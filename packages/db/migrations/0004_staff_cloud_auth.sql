PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN access_starts_at TEXT;
ALTER TABLE users ADD COLUMN access_ends_at TEXT;
ALTER TABLE users ADD COLUMN restaurant_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_status ON users(email, status);
CREATE INDEX IF NOT EXISTS idx_users_phone_status ON users(phone, status);

INSERT OR IGNORE INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES
  ('platform', 'BhojPatra Platform', 'platform', 'active', datetime('now'), datetime('now')),
  ('ten_1', 'My Restaurant', 'my-restaurant', 'active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO outlets (id, tenant_id, name, code, timezone, currency, status, created_at, updated_at)
VALUES ('out_1', 'ten_1', 'My Restaurant', 'MAIN', 'Asia/Kolkata', 'INR', 'active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO users
  (id, tenant_id, name, email, phone, password_hash, pin_hash, role, status, restaurant_name, created_at, updated_at)
VALUES
  ('usr_super_admin', 'platform', 'BhojPatra Admin', 'admin@gmail.com', '9000000000', 'harsh&nitin', '0000', 'admin', 'active', 'BhojPatra', datetime('now'), datetime('now')),
  ('usr_test_cashier', 'ten_1', 'Test User', 'test@gmail.com', '9000000001', 'test', '1111', 'cashier', 'active', 'My Restaurant', datetime('now'), datetime('now')),
  ('usr_admin', 'ten_1', 'Client Admin', 'admin@demo.com', '9000000002', 'admin123', '0000', 'admin', 'active', 'My Restaurant', datetime('now'), datetime('now'));
