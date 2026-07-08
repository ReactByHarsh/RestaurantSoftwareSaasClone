PRAGMA foreign_keys = ON;

ALTER TABLE orders ADD COLUMN table_name TEXT;
ALTER TABLE orders ADD COLUMN customer_name TEXT;
ALTER TABLE orders ADD COLUMN customer_phone TEXT;
ALTER TABLE orders ADD COLUMN captain_name TEXT;
ALTER TABLE orders ADD COLUMN cashier_name TEXT;
ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN cancelled_at TEXT;

ALTER TABLE kots ADD COLUMN order_no TEXT;
ALTER TABLE kots ADD COLUMN table_name TEXT;
ALTER TABLE kots ADD COLUMN order_type TEXT;
ALTER TABLE kots ADD COLUMN captain_name TEXT;
ALTER TABLE kots ADD COLUMN cancellation_reason TEXT;
ALTER TABLE kots ADD COLUMN cancelled_at TEXT;

ALTER TABLE kot_items ADD COLUMN name TEXT;
ALTER TABLE kot_items ADD COLUMN note TEXT;
ALTER TABLE kot_items ADD COLUMN modifiers TEXT;
ALTER TABLE kot_items ADD COLUMN item_type TEXT;

ALTER TABLE payments ADD COLUMN status_reason TEXT;
