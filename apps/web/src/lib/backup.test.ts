import { describe, expect, it } from 'vitest'
import { extractBillingSnapshot, isBillingSnapshot } from './backup'
import type { BillingSnapshot } from './cloudSync'

const snapshot = {
  outlet: { id: 'outlet-1' },
  printSettings: {},
  menuCategories: [],
  menuItems: [],
  floors: [],
  tables: [],
  stations: [],
  inventoryItems: [],
  orders: [],
  orderItems: [],
  kots: [],
  payments: [],
  auditLogs: [],
} as unknown as BillingSnapshot

describe('backup import envelopes', () => {
  it('accepts the web app backup envelope', () => {
    expect(extractBillingSnapshot({ app: 'BhojPatra Desk', snapshot })).toBe(snapshot)
  })

  it('unwraps the Workers admin download envelope', () => {
    const downloaded = {
      customer: { restaurantName: 'Hotel Nisarga' },
      snapshot: {
        tenantId: 'tenant-1',
        updatedAt: '2026-08-11T12:34:22.096Z',
        payload: snapshot,
      },
    }

    expect(extractBillingSnapshot(downloaded)).toBe(snapshot)
  })

  it('accepts a direct cloud payload and rejects unrelated JSON', () => {
    expect(extractBillingSnapshot({ payload: snapshot })).toBe(snapshot)
    expect(extractBillingSnapshot({ snapshot: { payload: JSON.stringify(snapshot) } })).toEqual(snapshot)
    expect(isBillingSnapshot(snapshot)).toBe(true)
    expect(extractBillingSnapshot({ customer: {}, snapshot: null })).toBeNull()
    expect(extractBillingSnapshot({ snapshot: { payload: { orders: [] } } })).toBeNull()
  })
})
