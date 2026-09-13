import { describe, expect, it } from 'vitest'
import {
  DAILY_CLOUD_SYNC_INTERVAL_MS,
  createOperationalSnapshot,
  getDailyCloudSyncDueAt,
  isDailyCloudSyncDue,
  mergeOperationalSnapshot,
  type BillingSnapshot,
} from './cloudSync'

function snapshotWithOrders(orders: BillingSnapshot['orders']): BillingSnapshot {
  return {
    outlet: { id: 'out_1', tenantId: '1', name: 'Test' } as BillingSnapshot['outlet'],
    printSettings: {} as BillingSnapshot['printSettings'],
    menuCategories: [], menuItems: [], floors: [], tables: [], stations: [], inventoryItems: [],
    purchaseEntries: [{ id: 'purchase-1' } as NonNullable<BillingSnapshot['purchaseEntries']>[number]],
    orders,
    orderItems: orders.map((order) => ({ id: `item-${order.id}`, orderId: order.id } as BillingSnapshot['orderItems'][number])),
    kots: [], payments: [], auditLogs: [], savedCarts: {},
  }
}

describe('daily cloud sync schedule', () => {
  it('runs immediately on a fresh installation', () => {
    const now = Date.parse('2026-09-06T08:00:00.000Z')
    expect(getDailyCloudSyncDueAt({}, now)).toBe(now)
    expect(isDailyCloudSyncDue({}, now)).toBe(true)
  })

  it('does not sync again within 24 hours of a successful run', () => {
    const lastSuccessfulSyncAt = '2026-09-06T08:00:00.000Z'
    const justBefore = Date.parse(lastSuccessfulSyncAt) + DAILY_CLOUD_SYNC_INTERVAL_MS - 1
    expect(isDailyCloudSyncDue({ lastSuccessfulSyncAt }, justBefore)).toBe(false)
    expect(isDailyCloudSyncDue({ lastSuccessfulSyncAt }, justBefore + 1)).toBe(true)
  })

  it('honors a saved first-run schedule when no sync has completed yet', () => {
    const nextSyncAt = '2026-09-06T08:01:00.000Z'
    expect(isDailyCloudSyncDue({ nextSyncAt }, Date.parse('2026-09-06T08:00:00.000Z'))).toBe(false)
    expect(isDailyCloudSyncDue({ nextSyncAt }, Date.parse(nextSyncAt))).toBe(true)
  })

  it('keeps closed history local while sending only active orders in the cloud snapshot', () => {
    const open = { id: 'open', status: 'running' } as BillingSnapshot['orders'][number]
    const closed = { id: 'closed', status: 'paid', isClosed: true } as BillingSnapshot['orders'][number]
    const local = snapshotWithOrders([open, closed])
    const operational = createOperationalSnapshot(local)
    expect(operational.orders.map((order) => order.id)).toEqual(['open'])
    expect(operational.orderItems.map((item) => item.orderId)).toEqual(['open'])
    expect(operational.purchaseEntries).toEqual([])
    expect(mergeOperationalSnapshot(local, operational).orders.map((order) => order.id).sort()).toEqual(['closed', 'open'])
    expect(mergeOperationalSnapshot(local, operational).purchaseEntries).toHaveLength(1)
  })
})
