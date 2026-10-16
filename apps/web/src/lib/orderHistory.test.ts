import { describe, expect, it } from 'vitest'
import { getOrderHistoryTimestamp, isWithinLocalDateRange, localDateInputValue } from './orderHistory'

describe('order history date selection', () => {
  it('uses the bill-close time for a table order opened the previous day', () => {
    const order = {
      createdAt: '2026-10-15T18:00:00.000Z',
      closedAt: '2026-10-16T04:30:00.000Z',
      updatedAt: '2026-10-16T04:30:00.000Z',
      isClosed: true,
      status: 'paid',
    }
    expect(isWithinLocalDateRange(getOrderHistoryTimestamp(order), '2026-10-16', '2026-10-16')).toBe(true)
  })

  it('falls back to the final update time for older billed orders without closedAt', () => {
    expect(getOrderHistoryTimestamp({
      createdAt: '2026-10-15T18:00:00.000Z',
      updatedAt: '2026-10-16T04:30:00.000Z',
      status: 'billed',
    })).toBe('2026-10-16T04:30:00.000Z')
  })

  it('uses local date inputs and includes the whole selected end date', () => {
    const localMorning = new Date(2026, 9, 16, 8, 0, 0).toISOString()
    const nextMidnight = new Date(2026, 9, 17, 0, 0, 0).toISOString()
    expect(localDateInputValue(new Date(2026, 9, 16, 8))).toBe('2026-10-16')
    expect(isWithinLocalDateRange(localMorning, '2026-10-16', '2026-10-16')).toBe(true)
    expect(isWithinLocalDateRange(nextMidnight, '2026-10-16', '2026-10-16')).toBe(false)
  })
})
