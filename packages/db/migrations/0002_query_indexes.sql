PRAGMA foreign_keys = ON;

-- Tenant and outlet lookup.
CREATE INDEX IF NOT EXISTS idx_outlets_tenant_status_code ON outlets(tenant_id, status, code);

-- Staff login, role filtering, and session cleanup.
CREATE INDEX IF NOT EXISTS idx_users_tenant_role_status ON users(tenant_id, role, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);

-- Dining layout and live table dashboards.
CREATE INDEX IF NOT EXISTS idx_floors_outlet_active_sort ON floors(outlet_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tables_outlet_floor_sort ON restaurant_tables(outlet_id, floor_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tables_outlet_status_sort ON restaurant_tables(outlet_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_tables_active_order ON restaurant_tables(active_order_id);

-- POS menu search and category browsing.
CREATE INDEX IF NOT EXISTS idx_menu_categories_outlet_active_sort ON menu_categories(outlet_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet_available_category_sort ON menu_items(outlet_id, is_available, category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet_name ON menu_items(outlet_id, name);
CREATE INDEX IF NOT EXISTS idx_menu_items_station ON menu_items(station_id);

-- Order history, billing, table settlement, and reports.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_outlet_order_no ON orders(outlet_id, order_no);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_business_created ON orders(outlet_id, business_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_status_created ON orders(outlet_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_date ON orders(outlet_id, payment_status, business_date, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_cashier_date ON orders(cashier_user_id, business_date);
CREATE INDEX IF NOT EXISTS idx_orders_captain_date ON orders(captain_user_id, business_date);

-- Bill printing, kitchen aggregation, and item sales reports.
CREATE INDEX IF NOT EXISTS idx_order_items_order_status ON order_items(order_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_created ON order_items(menu_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_station_status ON order_items(station_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_outlet_created ON order_items(outlet_id, created_at DESC);

-- KOT queue and kitchen station screens.
CREATE INDEX IF NOT EXISTS idx_kots_order_created ON kots(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kots_station_status_created ON kots(station_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kot_items_kot_status ON kot_items(kot_id, status);
CREATE INDEX IF NOT EXISTS idx_kot_items_order_item ON kot_items(order_item_id);

-- Payment summaries and reconciliation.
CREATE INDEX IF NOT EXISTS idx_payments_outlet_created ON payments(outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_method_created ON payments(outlet_id, method, created_at DESC);

-- Inventory list, search, and low-stock scan.
CREATE INDEX IF NOT EXISTS idx_inventory_outlet_name ON inventory_items(outlet_id, name);
CREATE INDEX IF NOT EXISTS idx_inventory_outlet_stock ON inventory_items(outlet_id, current_stock, minimum_stock);

-- Audit screen and entity timeline.
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON audit_logs(entity_type, entity_id, created_at DESC);
