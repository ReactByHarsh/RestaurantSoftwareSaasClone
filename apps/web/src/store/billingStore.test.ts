import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order, OrderItem, RestaurantTable } from '../lib/types'
import type { BillingSnapshot } from '../lib/cloudSync'
import {
  resolveRestoredSession,
  useBillingStore,
  type CartItem,
} from './billingStore'

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
  beforeEach(() => {
    vi.restoreAllMocks()
    useBillingStore.getState().reset()
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

  it('uploads the completed snapshot immediately after checkout', async () => {
    const activeOrder = order('running')
    let finishUpload: ((value: { ok: boolean; json: () => Promise<Record<string, unknown>> }) => void) | undefined
    const uploadResponse = new Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>((resolve) => {
      finishUpload = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(uploadResponse)
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
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const uploaded = JSON.parse(String(request.body)).payload as BillingSnapshot
    expect(uploaded.orders.find((candidate) => candidate.id === activeOrder.id)?.status).toBe('paid')
    expect(uploaded.tables[0].activeOrderId).toBeUndefined()
    expect(uploaded.savedCarts).not.toHaveProperty('table-1')
    finishUpload?.({
      ok: true,
      json: async () => ({ ok: true, outletId: 'outlet-1', updatedAt: '2026-08-08T10:11:00.000Z' }),
    })
  })

  it('keeps checkout completed locally when the immediate cloud upload fails', async () => {
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
