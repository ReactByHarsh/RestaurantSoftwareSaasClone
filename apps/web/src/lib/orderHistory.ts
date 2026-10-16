export type OrderHistoryDateFields = {
  createdAt: string
  updatedAt?: string
  closedAt?: string
  isClosed?: boolean
  status: string
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getOrderHistoryTimestamp(order: OrderHistoryDateFields) {
  const isBilledOrClosed = order.isClosed === true || Boolean(order.closedAt) ||
    ['paid', 'billed', 'cancelled', 'void'].includes(order.status)
  return isBilledOrClosed
    ? order.closedAt || order.updatedAt || order.createdAt
    : order.createdAt
}

function localMidnight(dateInput: string) {
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return Number.NaN
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
}

export function isWithinLocalDateRange(timestamp: string, fromDate: string, toDate: string) {
  const value = Date.parse(timestamp)
  const start = localMidnight(fromDate)
  const endStart = localMidnight(toDate)
  if ([value, start, endStart].some(Number.isNaN) || endStart < start) return false
  const [year, month, day] = toDate.split('-').map(Number)
  const endExclusive = new Date(year, month - 1, day + 1).getTime()
  return value >= start && value < endExclusive
}
