PRAGMA foreign_keys = ON;

-- Abort before making any change if a table has competing active orders and
-- any contender contains real sale/payment data. Empty orphan drafts are the
-- only records this migration is allowed to finalize automatically.
CREATE TABLE sync_migration_preflight_guard (
  violation_count INTEGER NOT NULL CHECK (violation_count = 0)
);
INSERT INTO sync_migration_preflight_guard (violation_count)
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.table_id IS NOT NULL
    AND o.closed_at IS NULL
    AND o.status NOT IN ('paid', 'cancelled', 'void')
  GROUP BY o.outlet_id, o.table_id
  HAVING COUNT(*) > 1
    AND SUM(CASE WHEN o.total_paise <> 0
      OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.status <> 'cancelled')
      OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
      THEN 1 ELSE 0 END) > 0
) THEN 1 ELSE 0 END;
DROP TABLE sync_migration_preflight_guard;

-- Orders finalized through due/account settlement have historically remained
-- in the `billed` status while closed_at is populated.  Make the lifecycle
-- explicit and monotonic for the sync protocol.
ALTER TABLE orders ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN payload_hash TEXT;
ALTER TABLE orders ADD COLUMN last_mutation_id TEXT;
ALTER TABLE orders ADD COLUMN server_updated_at TEXT;

UPDATE orders
SET is_closed = CASE
  WHEN closed_at IS NOT NULL OR status IN ('paid', 'cancelled', 'void') THEN 1
  ELSE 0
END;

-- Preserve, but finalize, empty orphan drafts left by the legacy whole-state
-- projector.  The predicates deliberately exclude orders with items,
-- payments, value, or a live table reference.
INSERT OR IGNORE INTO audit_logs (
  id, tenant_id, outlet_id, user_id, action, entity_type, entity_id,
  metadata_json, created_at
)
SELECT
  'audit_sync_cleanup_' || o.id,
  o.tenant_id,
  o.outlet_id,
  NULL,
  'sync.migration.empty_orphan_voided',
  'order',
  o.id,
  json_object('reason', 'sync_migration_empty_orphan'),
  CURRENT_TIMESTAMP
FROM orders o
LEFT JOIN restaurant_tables t
  ON t.outlet_id = o.outlet_id AND t.active_order_id = o.id
WHERE o.is_closed = 0
  AND o.status NOT IN ('paid', 'cancelled', 'void')
  AND o.total_paise = 0
  AND t.id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = o.id AND oi.status <> 'cancelled'
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.order_id = o.id
  );

UPDATE orders
SET
  status = 'void',
  is_closed = 1,
  closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
  cancellation_reason = COALESCE(cancellation_reason, 'sync_migration_empty_orphan'),
  updated_at = CURRENT_TIMESTAMP,
  server_updated_at = CURRENT_TIMESTAMP,
  version = version + 1
WHERE is_closed = 0
  AND status NOT IN ('paid', 'cancelled', 'void')
  AND total_paise = 0
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_tables t
    WHERE t.outlet_id = orders.outlet_id AND t.active_order_id = orders.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = orders.id AND oi.status <> 'cancelled'
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.order_id = orders.id
  );

CREATE TABLE IF NOT EXISTS sync_batches (
  outlet_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (outlet_id, device_id, batch_id)
);

CREATE TABLE IF NOT EXISTS sync_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  order_uuid TEXT,
  version INTEGER NOT NULL,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  server_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  code TEXT NOT NULL,
  incoming_version INTEGER NOT NULL,
  canonical_version INTEGER,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_outlet_sequence
  ON sync_changes(outlet_id, sequence);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_outlet_created
  ON sync_conflicts(outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sync_version
  ON orders(outlet_id, id, version);

-- This is the final database-level guard against two devices claiming the
-- same table.  Closed orders remain in history and do not participate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_table
  ON orders(outlet_id, table_id)
  WHERE table_id IS NOT NULL AND is_closed = 0;
