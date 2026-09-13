PRAGMA foreign_keys = ON;

-- Immutable recovery generations prevent a bad client update or failed future
-- migration from becoming the only copy of a restaurant's cloud snapshot.
CREATE TABLE IF NOT EXISTS app_snapshot_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  archived_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_snapshot_history_outlet_id
  ON app_snapshot_history(outlet_id, id DESC);
