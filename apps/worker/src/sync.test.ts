import { describe, expect, it } from 'vitest'
import {
  applyOrderAggregateToSnapshot,
  canonicalJson,
  compactOperationalSnapshot,
  sha256Hex,
  syncChangeSchema,
  syncPushIdempotencyValue,
  syncPushSchema,
  syncRetention,
  validRelationalKotItems,
} from './sync'

describe('v2 order sync projection', () => {
  it('keeps delta transport history bounded for daily clients', () => {
    expect(syncRetention.changesPerOutlet).toBe(3_000)
  })

  it('accepts the public versioned aggregate wire contract', () => {
    const parsed = syncChangeSchema.parse({
      entityType: 'order_aggregate',
      entityId: 'ord_1',
      orderUuid: 'ord_1',
      baseVersion: 1,
      version: 2,
      operation: 'upsert',
      updatedAt: '2026-08-09T00:00:00.000Z',
      isClosed: true,
      payloadHash: 'a'.repeat(64),
      payload: { order: { id: 'ord_1', status: 'billed', closedAt: '2026-08-09T00:00:00.000Z', tableId: 'table_1' } },
    })
    expect(parsed.orderUuid).toBe('ord_1')
    expect(parsed.version).toBe(2)
  })

  it('projects a close without reopening its table or stale cart', () => {
    const change = syncChangeSchema.parse({
      entityType: 'order_aggregate', entityId: 'ord_1', orderUuid: 'ord_1',
      baseVersion: 1, version: 2, operation: 'upsert',
      updatedAt: '2026-08-09T00:00:00.000Z', isClosed: true,
      payloadHash: 'b'.repeat(64),
      payload: {
        order: { id: 'ord_1', status: 'billed', closedAt: '2026-08-09T00:00:00.000Z', tableId: 'table_1' },
        table: { id: 'table_1', status: 'occupied', activeOrderId: 'ord_1' },
      },
    })
    const result = applyOrderAggregateToSnapshot({
      orders: [], orderItems: [], kots: [], payments: [],
      tables: [{ id: 'table_1', status: 'occupied', activeOrderId: 'ord_1' }],
      savedCarts: { table_1: [{ quantity: 1 }] },
    }, change)
    expect(result.orders).toEqual([])
    expect(result.orderItems).toEqual([])
    expect(result.kots).toEqual([])
    expect(result.payments).toEqual([])
    expect((result.tables as Array<any>)[0].activeOrderId).toBeUndefined()
    expect(result.savedCarts).toEqual({})
  })

  it('keeps only active order aggregates in the operational snapshot', () => {
    const result = compactOperationalSnapshot({
      orders: [
        { id: 'open', status: 'running' },
        { id: 'closed', status: 'paid', isClosed: true },
      ],
      orderItems: [{ id: 'oi-open', orderId: 'open' }, { id: 'oi-closed', orderId: 'closed' }],
      kots: [{ id: 'kot-open', orderId: 'open' }, { id: 'kot-closed', orderId: 'closed' }],
      payments: [{ id: 'pay-closed', orderId: 'closed' }],
      tables: [{ id: 'table-1', status: 'occupied', activeOrderId: 'closed' }],
      savedCarts: { 'table-1': [{ quantity: 1 }] },
      purchaseEntries: [{ id: 'purchase-old' }],
      auditLogs: [{ id: 'audit-old' }],
    })
    expect((result.orders as Array<{ id: string }>).map((order) => order.id)).toEqual(['open'])
    expect((result.orderItems as Array<{ id: string }>).map((item) => item.id)).toEqual(['oi-open'])
    expect(result.purchaseEntries).toEqual([])
    expect(result.auditLogs).toEqual([])
    expect(result.snapshotKind).toBe('operational')
  })

  it('uses deterministic canonical JSON for hashes', () => {
    expect(canonicalJson({ version: 2, order: { z: 1, a: 2 } }))
      .toBe('{"order":{"a":2,"z":1},"version":2}')
  })

  it('does not treat pull cursor progress as a different push mutation', async () => {
    const change = syncChangeSchema.parse({
      entityType: 'order_aggregate', entityId: 'ord_1', orderUuid: 'ord_1',
      baseVersion: 1, version: 2, operation: 'upsert',
      updatedAt: '2026-08-09T00:00:00.000Z', isClosed: true,
      payloadHash: 'd'.repeat(64), payload: { order: { id: 'ord_1', status: 'paid' } },
    })
    const first = syncPushSchema.parse({
      protocolVersion: 2, deviceId: 'device_1', batchId: 'batch_1',
      baseCursor: 10, changes: [change],
    })
    const retry = { ...first, baseCursor: 999 }

    await expect(sha256Hex(syncPushIdempotencyValue(first)))
      .resolves.toBe(await sha256Hex(syncPushIdempotencyValue(retry)))
  })

  it('omits orphan legacy KOT lines from the relational projection', () => {
    const change = syncChangeSchema.parse({
      entityType: 'order_aggregate', entityId: 'ord_legacy', orderUuid: 'ord_legacy',
      baseVersion: 0, version: 1, operation: 'upsert',
      updatedAt: '2026-08-09T00:00:00.000Z', isClosed: true,
      payloadHash: 'c'.repeat(64),
      payload: {
        order: { id: 'ord_legacy', status: 'paid' },
        orderItems: [{ id: 'oi_kept', orderId: 'ord_legacy' }],
        kots: [{
          id: 'kot_1', orderId: 'ord_legacy',
          items: [
            { id: 'ki_kept', orderItemId: 'oi_kept' },
            { id: 'ki_orphan', orderItemId: 'oi_removed' },
          ],
        }],
      },
    })

    expect(validRelationalKotItems(change.payload).map(({ item }) => item.id)).toEqual(['ki_kept'])
    expect(change.payload.kots[0].items).toHaveLength(2)
  })
})
