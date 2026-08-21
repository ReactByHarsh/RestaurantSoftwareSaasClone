import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, OrderItem, RestaurantTable } from '../lib/types'
import type { BillingSnapshot } from '../lib/cloudSync'
import {
  resolveRestoredSession,
  useBillingStore,
  type CartItem,
} from './billingStore'
import { localSyncDb } from '../lib/orderSync'

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size },
    },
  })
})

const table = (activeOrderId?: string): RestaurantTable => ({
  id: 'table-1',
  outletId: 'outlet-1',
  floorId: 'floor-1',
  name: 'Table 1',
  seats: 4,
  status: activeOrderId ? 'occupied' : 'available',
  activeOrderId,
  sortOrder: 1,
})

const order = (status: Order['status'], updatedAt = '2026-08-08T10:00:00.000Z'): Order => ({
  id: 'order-1',
  outletId: 'outlet-1',
  orderNo: 'ORD-0001',
  businessDate: '2026-08-08',
  type: 'dine_in',
  status,
  tableId: 'table-1',
  tableName: 'Table 1',
  subtotalPaise: 10000,
  discountPaise: 0,
  taxPaise: 0,
  chargePaise: 0,
  totalPaise: 10000,
  paidPaise: status === 'paid' ? 10000 : 0,
  paymentStatus: status === 'paid' ? 'paid' : 'unpaid',
  createdAt: '2026-08-08T09:00:00.000Z',
  updatedAt,
  closedAt: status === 'paid' ? updatedAt : undefined,
})

const cartItem: CartItem = {
  menuItemId: 'menu-1',
  name: 'Test item',
  itemType: 'veg',
  quantity: 1,
  unitPricePaise: 10000,
  basePricePaise: 10000,
  taxPercent: 0,
}

const savedOrderItem: OrderItem = {
  id: 'order-item-1',
  orderId: 'order-1',
  menuItemId: 'menu-1',
  nameSnapshot: 'Test item',
  itemType: 'veg',
  quantity: 1,
  unitPricePaise: 10000,
  taxPaise: 0,
  discountPaise: 0,
  totalPaise: 10000,
  status: 'kot_sent',
  createdAt: '2026-08-08T09:00:00.000Z',
}

const sessionSnapshot = (
  currentOrder: Order,
  currentTable: RestaurantTable,
  savedCarts: Record<string, CartItem[]> = {},
): Pick<BillingSnapshot, 'orders' | 'tables' | 'savedCarts'> => ({
  orders: [currentOrder],
  tables: [currentTable],
  savedCarts,
})

describe('billing session restoration', () => {
  it.each(['paid', 'cancelled', 'void'] as const)(
    'does not restore a %s order or its stale table cart',
    (status) => {
      const closedOrder = order(status)
      const restored = resolveRestoredSession(
        sessionSnapshot(closedOrder, table(), { 'table-1': [cartItem] }),
        closedOrder,
        'table-1',
        [cartItem],
      )

      expect(restored.currentOrder).toBeNull()
      expect(restored.selectedTableId).toBe('table-1')
      expect(restored.cart).toEqual([])
      expect(restored.savedCarts).not.toHaveProperty('table-1')
    },
  )

  it('restores an unsent cart for an active unpaid table order', () => {
    const activeOrder = order('running')
    const restored = resolveRestoredSession(
      sessionSnapshot(activeOrder, table(activeOrder.id), { 'table-1': [cartItem] }),
      activeOrder,
      'table-1',
      [],
    )

    expect(restored.currentOrder?.id).toBe(activeOrder.id)
    expect(restored.cart).toEqual([cartItem])
  })

  it('treats billed plus closedAt as closed and never restores its cart', () => {
    const billedClosed = { ...order('billed'), closedAt: '2026-08-08T10:01:00.000Z' }
    const restored = resolveRestoredSession(
      sessionSnapshot(billedClosed, table(billedClosed.id), { 'table-1': [cartItem] }),
      billedClosed,
      'table-1',
      [cartItem],
    )
    expect(restored.currentOrder).toBeNull()
    expect(restored.cart).toEqual([])
    expect(restored.savedCarts).not.toHaveProperty('table-1')
  })

  it('does not use the stale top-level cart for an empty table', () => {
    const activeOrder = order('running')
    const restored = resolveRestoredSession(
      sessionSnapshot(activeOrder, table(), { 'table-1': [cartItem] }),
      activeOrder,
      'table-1',
      [cartItem],
    )

    expect(restored.currentOrder).toBeNull()
    expect(restored.cart).toEqual([])
    expect(restored.savedCarts).not.toHaveProperty('table-1')
  })
})

describe('billing store stale-state recovery', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await Promise.all([
      localSyncDb.syncRecords.clear(),
      localSyncDb.syncOutbox.clear(),
      localSyncDb.syncState.clear(),
      localSyncDb.syncConflicts.clear(),
      localSyncDb.snapshots.clear(),
    ])
    useBillingStore.getState().reset()
  })

  it('exports the active table cart even before the user switches tables', () => {
    const activeOrder = order('running')
    useBillingStore.setState({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      currentOrder: activeOrder,
      selectedTableId: 'table-1',
      cart: [cartItem],
      savedCarts: {},
      activeOrderType: 'dine_in',
    })

    expect(useBillingStore.getState().exportSnapshot().savedCarts).toEqual({
      'table-1': [cartItem],
    })
  })

  it('reopens a persisted occupied table with its unsent cart', () => {
    const activeOrder = order('running')
    const snapshot = {
      ...useBillingStore.getState().exportSnapshot(),
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      orderItems: [],
      savedCarts: { 'table-1': [cartItem] },
    }

    useBillingStore.getState().importSnapshot(snapshot)
    useBillingStore.getState().selectTable('table-1')

    const state = useBillingStore.getState()
    expect(state.currentOrder?.id).toBe(activeOrder.id)
    expect(state.selectedTableId).toBe('table-1')
    expect(state.cart).toEqual([cartItem])
    expect(state.tables[0].activeOrderId).toBe(activeOrder.id)
  })

  it('parks the cart and clears the modal session when leaving a table', () => {
    const activeOrder = order('running')
    useBillingStore.setState({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      currentOrder: activeOrder,
      selectedTableId: 'table-1',
      cart: [cartItem],
      savedCarts: {},
      activeOrderType: 'dine_in',
    })

    useBillingStore.getState().closeTableView()

    const state = useBillingStore.getState()
    expect(state.selectedTableId).toBeNull()
    expect(state.currentOrder).toBeNull()
    expect(state.cart).toEqual([])
    expect(state.savedCarts['table-1']).toEqual([cartItem])

    useBillingStore.getState().selectTable('table-1')
    expect(useBillingStore.getState().cart).toEqual([cartItem])
    expect(useBillingStore.getState().currentOrder?.id).toBe(activeOrder.id)
  })

  it('does not delete a parked cart during the transient table-open state', () => {
    const activeOrder = order('running')
    useBillingStore.setState({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      currentOrder: null,
      selectedTableId: 'table-1',
      cart: [],
      savedCarts: { 'table-1': [cartItem] },
      activeOrderType: 'dine_in',
    })

    expect(useBillingStore.getState().exportSnapshot().savedCarts?.['table-1'] ?? []).toEqual([cartItem])
  })

  it('clears a stale paid order when the already-selected empty table is selected again', () => {
    const paidOrder = order('paid')
    useBillingStore.setState({
      tables: [table()],
      orders: [paidOrder],
      currentOrder: paidOrder,
      selectedTableId: 'table-1',
      cart: [cartItem],
      savedCarts: { 'table-1': [cartItem] },
      activeOrderType: 'dine_in',
    })

    useBillingStore.getState().selectTable('table-1')

    const state = useBillingStore.getState()
    expect(state.currentOrder).toBeNull()
    expect(state.cart).toEqual([])
    expect(state.savedCarts).not.toHaveProperty('table-1')
  })

  it('preserves a newer local completed order when an older remote snapshot is imported', () => {
    const paidOrder = order('paid', '2026-08-08T10:10:00.000Z')
    useBillingStore.setState({
      tables: [table()],
      orders: [paidOrder],
      currentOrder: null,
      selectedTableId: null,
      cart: [],
      savedCarts: {},
    })

    const remoteOpenOrder = order('running', '2026-08-08T10:00:00.000Z')
    const remoteSnapshot: BillingSnapshot = {
      ...useBillingStore.getState().exportSnapshot(),
      tables: [table(remoteOpenOrder.id)],
      orders: [remoteOpenOrder],
      savedCarts: { 'table-1': [cartItem] },
    }

    useBillingStore.getState().importSnapshot(remoteSnapshot, true)

    const state = useBillingStore.getState()
    expect(state.orders.find((candidate) => candidate.id === paidOrder.id)?.status).toBe('paid')
    expect(state.tables[0].activeOrderId).toBeUndefined()
    expect(state.tables[0].status).toBe('available')
    expect(state.savedCarts).not.toHaveProperty('table-1')
  })

  it('preserves a local open table session when the remote snapshot has not received it yet', () => {
    const activeOrder = order('running')
    useBillingStore.setState({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      currentOrder: activeOrder,
      selectedTableId: 'table-1',
      cart: [cartItem],
      savedCarts: {},
      activeOrderType: 'dine_in',
    })

    const remoteSnapshot = {
      ...useBillingStore.getState().exportSnapshot(),
      tables: [table()],
      orders: [],
      orderItems: [],
      savedCarts: {},
    }
    useBillingStore.getState().importSnapshot(remoteSnapshot, true)

    const state = useBillingStore.getState()
    expect(state.tables[0].activeOrderId).toBe(activeOrder.id)
    expect(state.orders[0].id).toBe(activeOrder.id)
    expect(state.savedCarts['table-1']).toEqual([cartItem])
    expect(state.cart).toEqual([cartItem])
  })

  it('keeps checkout local and defers cloud sync to the desktop timer', async () => {
    const activeOrder = order('running')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useBillingStore.setState((state) => ({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      orderItems: [savedOrderItem],
      currentOrder: activeOrder,
      selectedTableId: 'table-1',
      cart: [],
      savedCarts: {},
      cloudSync: {
        ...state.cloudSync,
        enabled: true,
        serverUrl: 'https://example.test',
        tenantId: 'tenant-1',
        outletId: 'outlet-1',
        accountLogin: 'owner',
        accountSecret: 'secret',
      },
    }))

    const settled = await useBillingStore.getState().settlePayment(
      activeOrder.id,
      [{ method: 'cash', amountPaise: 10000 }],
      0,
      'user-1',
      'Owner',
      false,
    )

    expect(settled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useBillingStore.getState().orders.find((candidate) => candidate.id === activeOrder.id)?.status).toBe('paid')
    expect(useBillingStore.getState().tables[0].activeOrderId).toBeUndefined()
  })

  it('keeps checkout completed locally while offline', async () => {
    const activeOrder = order('running')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useBillingStore.setState((state) => ({
      tables: [table(activeOrder.id)],
      orders: [activeOrder],
      orderItems: [savedOrderItem],
      currentOrder: activeOrder,
      selectedTableId: 'table-1',
      cart: [],
      savedCarts: {},
      cloudSync: {
        ...state.cloudSync,
        enabled: true,
        serverUrl: 'https://example.test',
        tenantId: 'tenant-1',
        outletId: 'outlet-1',
        accountLogin: 'owner',
        accountSecret: 'secret',
      },
    }))

    const settled = await useBillingStore.getState().settlePayment(
      activeOrder.id,
      [{ method: 'cash', amountPaise: 10000 }],
      0,
      'user-1',
      'Owner',
      false,
    )

    const state = useBillingStore.getState()
    expect(settled).toBe(true)
    expect(state.orders.find((candidate) => candidate.id === activeOrder.id)?.status).toBe('paid')
    expect(state.currentOrder).toBeNull()
    expect(state.tables[0].activeOrderId).toBeUndefined()
  })
})
