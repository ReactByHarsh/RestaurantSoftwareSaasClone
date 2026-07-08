-- Add indexing for multi-tenant and fast lookup support

-- Index on users table for login and tenant queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Index on app_snapshots for tenant-based lookup (outlet_id is already PRIMARY/UNIQUE but we'll index tenant_id too)
CREATE INDEX IF NOT EXISTS idx_app_snapshots_tenant_id ON app_snapshots(tenant_id);

-- Optional indexes on outlets if it exists
CREATE INDEX IF NOT EXISTS idx_outlets_tenant_id ON outlets(tenant_id);
