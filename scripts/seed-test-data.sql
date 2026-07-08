-- BhojPatra Cloud Test Data Seed
-- Run after migrations: pnpm db:migrate:local
-- Then: npx wrangler d1 execute bhojpatra-db --local --file scripts/seed-test-data.sql

-- Demo tenant (already created by seed migration but ensure it exists)
INSERT OR IGNORE INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES ('ten_demo', 'Demo Grand Kitchen', 'demo-grand-kitchen', 'active', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO outlets (id, tenant_id, name, code, address, timezone, currency, status, created_at, updated_at)
VALUES ('out_ten_demo', 'ten_demo', 'Demo Grand Kitchen', 'DGK', '123 MG Road, Mumbai', 'Asia/Kolkata', 'INR', 'active', datetime('now'), datetime('now'));

-- Demo floor
INSERT OR IGNORE INTO floors (id, tenant_id, outlet_id, name, sort_order, is_active, created_at, updated_at)
VALUES ('flr_1', 'ten_demo', 'out_ten_demo', 'Ground Floor', 1, 1, datetime('now'), datetime('now'));

-- Demo tables
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, outlet_id, floor_id, name, seats, status, sort_order, created_at, updated_at) VALUES ('tbl_1', 'ten_demo', 'out_ten_demo', 'flr_1', 'T1', 4, 'available', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, outlet_id, floor_id, name, seats, status, sort_order, created_at, updated_at) VALUES ('tbl_2', 'ten_demo', 'out_ten_demo', 'flr_1', 'T2', 4, 'available', 2, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, outlet_id, floor_id, name, seats, status, sort_order, created_at, updated_at) VALUES ('tbl_3', 'ten_demo', 'out_ten_demo', 'flr_1', 'T3', 6, 'occupied', 3, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, outlet_id, floor_id, name, seats, status, sort_order, created_at, updated_at) VALUES ('tbl_4', 'ten_demo', 'out_ten_demo', 'flr_1', 'T4', 2, 'available', 4, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, outlet_id, floor_id, name, seats, status, sort_order, created_at, updated_at) VALUES ('tbl_5', 'ten_demo', 'out_ten_demo', 'flr_1', 'T5', 8, 'available', 5, datetime('now'), datetime('now'));

-- Demo stations
INSERT OR IGNORE INTO stations (id, tenant_id, outlet_id, name, created_at, updated_at) VALUES ('stn_1', 'ten_demo', 'out_ten_demo', 'Main Kitchen', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO stations (id, tenant_id, outlet_id, name, created_at, updated_at) VALUES ('stn_2', 'ten_demo', 'out_ten_demo', 'Beverage Station', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO stations (id, tenant_id, outlet_id, name, created_at, updated_at) VALUES ('stn_3', 'ten_demo', 'out_ten_demo', 'Tandoor', datetime('now'), datetime('now'));

-- Demo menu categories
INSERT OR IGNORE INTO menu_categories (id, tenant_id, outlet_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ('cat_1', 'ten_demo', 'out_ten_demo', 'Starters', '#f97316', 1, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_categories (id, tenant_id, outlet_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ('cat_2', 'ten_demo', 'out_ten_demo', 'Main Course', '#ef4444', 2, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_categories (id, tenant_id, outlet_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ('cat_3', 'ten_demo', 'out_ten_demo', 'Breads', '#eab308', 3, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_categories (id, tenant_id, outlet_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ('cat_4', 'ten_demo', 'out_ten_demo', 'Beverages', '#06b6d4', 4, 1, datetime('now'), datetime('now'));

-- Demo menu items (in paise)
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_1', 'ten_demo', 'out_ten_demo', 'cat_1', 'Paneer Tikka', 'veg', 28000, 5, 'stn_3', 1, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_2', 'ten_demo', 'out_ten_demo', 'cat_1', 'Chicken Tikka', 'nonveg', 32000, 5, 'stn_3', 1, 2, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_3', 'ten_demo', 'out_ten_demo', 'cat_1', 'Masala Papad', 'veg', 8000, 5, 'stn_1', 1, 3, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_4', 'ten_demo', 'out_ten_demo', 'cat_2', 'Paneer Butter Masala', 'veg', 32000, 5, 'stn_1', 1, 4, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_5', 'ten_demo', 'out_ten_demo', 'cat_2', 'Butter Chicken', 'nonveg', 35000, 5, 'stn_1', 1, 5, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_6', 'ten_demo', 'out_ten_demo', 'cat_2', 'Dal Makhani', 'veg', 24000, 5, 'stn_1', 1, 6, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_7', 'ten_demo', 'out_ten_demo', 'cat_3', 'Butter Naan', 'veg', 5000, 5, 'stn_3', 1, 7, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_8', 'ten_demo', 'out_ten_demo', 'cat_3', 'Garlic Naan', 'veg', 6000, 5, 'stn_3', 1, 8, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_9', 'ten_demo', 'out_ten_demo', 'cat_4', 'Masala Chai', 'veg', 3000, 5, 'stn_2', 1, 9, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO menu_items (id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at) VALUES ('item_10', 'ten_demo', 'out_ten_demo', 'cat_4', 'Fresh Lime Soda', 'veg', 6000, 5, 'stn_2', 1, 10, datetime('now'), datetime('now'));
