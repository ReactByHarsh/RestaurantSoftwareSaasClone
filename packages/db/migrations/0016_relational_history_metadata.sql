-- Keep POS-only historical attributes alongside their relational entity.
-- KOT metadata retains orphaned cancelled lines that no longer have an order item.
ALTER TABLE orders ADD COLUMN metadata_json TEXT;
ALTER TABLE order_items ADD COLUMN metadata_json TEXT;
ALTER TABLE kots ADD COLUMN metadata_json TEXT;
