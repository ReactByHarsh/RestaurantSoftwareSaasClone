-- LOCAL TEST DATABASE ONLY. Does not delete any relational history.
UPDATE app_snapshots SET payload_json = json_set(payload_json,
  '$.snapshotKind', 'full',
  '$.orders', json_array(json_object(
    'id', 'legacy-test-order', 'outletId', 'out_ten_1', 'orderNo', 'LEGACY-TEST',
    'status', 'paid', 'isClosed', json('true'), 'type', 'takeaway',
    'version', 1, 'businessDate', '2026-09-06', 'totalPaise', 100, 'paidPaise', 100,
    'createdAt', '2026-09-06T00:00:00Z', 'updatedAt', '2026-09-06T00:00:00Z',
    'recipeConsumptionStatus', 'consumed')),
  '$.orderItems', json_array(), '$.kots', json_array(), '$.payments', json_array()
), updated_at = '2026-09-06T00:00:00Z' WHERE outlet_id = 'out_ten_1';
