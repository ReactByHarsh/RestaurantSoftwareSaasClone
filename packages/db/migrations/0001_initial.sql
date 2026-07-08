PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outlets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  gstin TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS user_outlets (
  user_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  PRIMARY KEY (user_id, outlet_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (outlet_id) REFERENCES outlets(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  floor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available',
  active_order_id TEXT,
  assigned_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (floor_id) REFERENCES floors(id)
);

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'veg',
  price_paise INTEGER NOT NULL,
  tax_percent REAL NOT NULL DEFAULT 0,
  station_id TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES menu_categories(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  business_date TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  table_id TEXT,
  customer_id TEXT,
  captain_user_id TEXT,
  cashier_user_id TEXT,
  subtotal_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  charge_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL DEFAULT 0,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  item_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  station_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  modifiers_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS kots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  kot_no TEXT NOT NULL,
  station_id TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_by_user_id TEXT NOT NULL,
  printed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS kot_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  kot_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (kot_id) REFERENCES kots(id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  reference_no TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  collected_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_stock REAL NOT NULL DEFAULT 0,
  minimum_stock REAL NOT NULL DEFAULT 0,
  cost_per_unit INTEGER NOT NULL DEFAULT 0,
  supplier TEXT,
  last_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS print_settings (
  outlet_id TEXT PRIMARY KEY,
  receipt_width TEXT NOT NULL DEFAULT '80mm',
  business_name TEXT NOT NULL,
  header_text TEXT,
  footer_text TEXT,
  show_gstin INTEGER NOT NULL DEFAULT 1,
  show_kot_token INTEGER NOT NULL DEFAULT 1,
  auto_print_receipt INTEGER NOT NULL DEFAULT 0,
  auto_print_kot INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_outlet_date ON orders(outlet_id, business_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_kots_outlet_status ON kots(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet_category ON menu_items(outlet_id, category_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet_created ON audit_logs(outlet_id, created_at);
