PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_snapshots (
  outlet_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_snapshots_tenant_updated ON app_snapshots(tenant_id, updated_at DESC);
