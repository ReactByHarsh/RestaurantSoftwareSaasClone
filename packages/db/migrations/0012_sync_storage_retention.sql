-- Delta sync stores only bounded retry/recovery metadata. Current restaurant
-- state remains in app_snapshots and completed sales remain in relational
-- order, item, KOT, and payment tables.

DELETE FROM app_snapshot_history
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY outlet_id ORDER BY id DESC) AS retention_rank
    FROM app_snapshot_history
  )
  WHERE retention_rank > 3
);

DELETE FROM sync_batches
WHERE rowid IN (
  SELECT rowid FROM (
    SELECT
      rowid,
      ROW_NUMBER() OVER (
        PARTITION BY outlet_id, device_id ORDER BY created_at DESC
      ) AS retention_rank
    FROM sync_batches
  )
  WHERE retention_rank > 200
);

DELETE FROM sync_conflicts
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY outlet_id ORDER BY id DESC) AS retention_rank
    FROM sync_conflicts
  )
  WHERE retention_rank > 200
);
