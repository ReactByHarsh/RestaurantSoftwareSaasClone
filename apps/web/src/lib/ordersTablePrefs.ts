export type OrderColumnKey =
  | 'receipt'
  | 'table'
  | 'customer'
  | 'businessDate'
  | 'txnTime'
  | 'items'
  | 'billDisc'
  | 'net'
  | 'pendingAmt'
  | 'paymentDetails'
  | 'status'

export type OrderSortField =
  | 'txnTime'
  | 'businessDate'
  | 'receipt'
  | 'table'
  | 'customer'
  | 'net'
  | 'pendingAmt'

export type OrderSortDirection = 'asc' | 'desc'

export interface OrderColumnPreference {
  key: OrderColumnKey
  visible: boolean
}

export interface OrdersTablePreferences {
  columns: OrderColumnPreference[]
  sortField: OrderSortField
  sortDirection: OrderSortDirection
}

export interface OrderColumnMeta {
  key: OrderColumnKey
  label: string
  align: 'left' | 'center' | 'right'
  sortField?: OrderSortField
}

export const ORDER_COLUMN_META: OrderColumnMeta[] = [
  { key: 'receipt', label: 'Receipt No', align: 'left', sortField: 'receipt' },
  { key: 'table', label: 'Table', align: 'left', sortField: 'table' },
  { key: 'customer', label: 'Customer', align: 'left', sortField: 'customer' },
  { key: 'businessDate', label: 'Bsn Date', align: 'left', sortField: 'businessDate' },
  { key: 'txnTime', label: 'Txn Time', align: 'left', sortField: 'txnTime' },
  { key: 'items', label: 'Items', align: 'center' },
  { key: 'billDisc', label: 'Bill Disc', align: 'right' },
  { key: 'net', label: 'Net', align: 'right', sortField: 'net' },
  { key: 'pendingAmt', label: 'Pnding Amt', align: 'right', sortField: 'pendingAmt' },
  { key: 'paymentDetails', label: 'Pymt Details', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
]

export const ORDER_SORT_FIELDS: Array<{ value: OrderSortField; label: string }> = [
  { value: 'txnTime', label: 'Transaction time' },
  { value: 'businessDate', label: 'Business date' },
  { value: 'receipt', label: 'Receipt no' },
  { value: 'table', label: 'Table' },
  { value: 'customer', label: 'Customer' },
  { value: 'net', label: 'Net amount' },
  { value: 'pendingAmt', label: 'Pending amount' },
]

const STORAGE_KEY = 'bhojpatra-orders-table-prefs-v1'

const DEFAULT_PREFERENCES: OrdersTablePreferences = {
  columns: ORDER_COLUMN_META.map((column) => ({ key: column.key, visible: true })),
  sortField: 'txnTime',
  sortDirection: 'desc',
}

export function defaultSortDirection(field: OrderSortField): OrderSortDirection {
  return field === 'receipt' || field === 'table' || field === 'customer' || field === 'businessDate'
    ? 'asc'
    : 'desc'
}

export function defaultOrdersTablePreferences(): OrdersTablePreferences {
  return {
    columns: DEFAULT_PREFERENCES.columns.map((column) => ({ ...column })),
    sortField: DEFAULT_PREFERENCES.sortField,
    sortDirection: DEFAULT_PREFERENCES.sortDirection,
  }
}

export function loadOrdersTablePreferences(): OrdersTablePreferences {
  if (typeof window === 'undefined') return defaultOrdersTablePreferences()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultOrdersTablePreferences()
    return normalizeOrdersTablePreferences(JSON.parse(raw))
  } catch {
    return defaultOrdersTablePreferences()
  }
}

export function saveOrdersTablePreferences(preferences: OrdersTablePreferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeOrdersTablePreferences(preferences)))
  } catch {
    // Settings still apply for the current session when storage is unavailable.
  }
}

export function normalizeOrdersTablePreferences(value: unknown): OrdersTablePreferences {
  const fallback = defaultOrdersTablePreferences()
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as Partial<OrdersTablePreferences>
  const knownKeys = new Set(ORDER_COLUMN_META.map((column) => column.key))
  const seen = new Set<OrderColumnKey>()
  const columns: OrderColumnPreference[] = []

  if (Array.isArray(candidate.columns)) {
    candidate.columns.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return
      const key = (entry as OrderColumnPreference).key
      if (!knownKeys.has(key) || seen.has(key)) return
      seen.add(key)
      columns.push({ key, visible: (entry as OrderColumnPreference).visible !== false })
    })
  }

  ORDER_COLUMN_META.forEach((column) => {
    if (!seen.has(column.key)) columns.push({ key: column.key, visible: true })
  })

  if (!columns.some((column) => column.visible)) {
    columns.forEach((column) => { column.visible = true })
  }

  const sortField = ORDER_SORT_FIELDS.some((field) => field.value === candidate.sortField)
    ? candidate.sortField as OrderSortField
    : fallback.sortField
  const sortDirection = candidate.sortDirection === 'asc' || candidate.sortDirection === 'desc'
    ? candidate.sortDirection
    : fallback.sortDirection

  return { columns, sortField, sortDirection }
}
