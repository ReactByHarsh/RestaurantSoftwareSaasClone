import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { canonicalJson, chunkOrderChanges, orderIsClosed, payloadHash } from './orderSync'
import type { Order } from './types'

const baseOrder: Order = {
  id: 'ord_7b62dd37-6dde-4bed-abce-12f96dcfee22',
  outletId: 'out_1',
  orderNo: 'ORD-1',
  businessDate: '2026-08-09',
  type: 'dine_in',
  status: 'billed',
  subtotalPaise: 100,
  discountPaise: 0,
  taxPaise: 0,
  chargePaise: 0,
  totalPaise: 100,
  paidPaise: 0,
  paymentStatus: 'unpaid',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:01:00.000Z',
}

describe('order sync wire primitives', () => {
  it('canonicalizes property order before hashing', async () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } }))
      .toBe('{"a":{"x":3,"y":2},"z":1}')
    expect(await payloadHash({ a: 1, b: 2 })).toBe(await payloadHash({ b: 2, a: 1 }))
  })

  it('makes closure monotonic for billed orders with closedAt', () => {
    expect(orderIsClosed({ ...baseOrder, closedAt: '2026-08-09T00:02:00.000Z' })).toBe(true)
    expect(orderIsClosed({ ...baseOrder, isClosed: true })).toBe(true)
    expect(orderIsClosed(baseOrder)).toBe(false)
  })

  it('uploads 150 pending orders as three batches of at most 50', () => {
    const batches = chunkOrderChanges(Array.from({ length: 150 }, (_, index) => index))
    expect(batches).toHaveLength(3)
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 50])
  })
})
