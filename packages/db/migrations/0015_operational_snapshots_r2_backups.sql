PRAGMA foreign_keys = ON;

-- Full recovery generations are compressed R2 objects. D1 retains only
-- searchable metadata; app_snapshots remains the small operational bootstrap.
CREATE TABLE IF NOT EXISTS cloud_backups (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  backup_date TEXT NOT NULL,
  source TEXT NOT NULL,
  client_id TEXT,
  schema_version INTEGER NOT NULL,
  uncompressed_bytes INTEGER NOT NULL,
  compressed_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_backups_outlet_created
  ON cloud_backups(outlet_id, created_at DESC);

-- One row records the scheduled maintenance outcome without adding entries to
-- the per-order delta log.
CREATE TABLE IF NOT EXISTS sync_maintenance (
  id TEXT PRIMARY KEY CHECK (id = 'daily'),
  last_started_at TEXT,
  last_completed_at TEXT,
  changes_deleted INTEGER NOT NULL DEFAULT 0,
  batches_deleted INTEGER NOT NULL DEFAULT 0,
  conflicts_deleted INTEGER NOT NULL DEFAULT 0,
  legacy_backups_migrated INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
