-- sync_changes is a short-lived transport log. app_snapshots plus the
-- relational order/KOT/payment tables remain the canonical customer data.
-- Keep enough deltas for daily clients while preventing this table from
-- consuming the complete D1 database allocation again.
DELETE FROM sync_changes
WHERE sequence IN (
  SELECT sequence FROM (
    SELECT
      sequence,
      ROW_NUMBER() OVER (PARTITION BY outlet_id ORDER BY sequence DESC) AS retention_rank
    FROM sync_changes
  )
  WHERE retention_rank > 3000
);
