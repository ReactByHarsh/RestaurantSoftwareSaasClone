import type {
  AuditLog,
  Floor,
  InventoryItem,
  KOT,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  Payment,
  PurchaseEntry,
  RestaurantTable,
  Station,
  User,
} from './types'
import type { AppUpdateSettings, OutletSettings, PrintSettings } from '../store/billingStore'
import type { CartItem } from '../store/billingStore'
import type { StaffAccount } from '../store/staffStore'

export type CloudSyncSettings = {
  enabled: boolean
  serverUrl: string
  tenantId: string
  outletId: string
  accountLogin: string
  accountSecret: string
  autoSyncEnabled: boolean
  syncIntervalHours: number
  lastSuccessfulSyncAt?: string
  nextSyncAt?: string
  /** Legacy settings retained only for one-way settings migration. */
  autoSyncDaily?: boolean
  syncHour24?: number
  cloudMode?: 'daily_snapshot' | 'delta_v2'
  lastSyncedAt?: string
  lastCloudUploadedAt?: string
  lastCloudDownloadedAt?: string
}

export const DAILY_CLOUD_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

export function getDailyCloudSyncDueAt(
  settings: Pick<CloudSyncSettings, 'lastSuccessfulSyncAt' | 'lastSyncedAt' | 'nextSyncAt'>,
  currentTime = Date.now(),
) {
  const lastSuccess = Date.parse(settings.lastSuccessfulSyncAt || settings.lastSyncedAt || '')
  if (Number.isFinite(lastSuccess)) return lastSuccess + DAILY_CLOUD_SYNC_INTERVAL_MS
  const configuredNextRun = Date.parse(settings.nextSyncAt || '')
  return Number.isFinite(configuredNextRun) ? configuredNextRun : currentTime
}

export function isDailyCloudSyncDue(
  settings: Pick<CloudSyncSettings, 'lastSuccessfulSyncAt' | 'lastSyncedAt' | 'nextSyncAt'>,
  currentTime = Date.now(),
) {
  return getDailyCloudSyncDueAt(settings, currentTime) <= currentTime
}

export type BillingSnapshot = {
  snapshotKind?: 'operational' | 'full'
  snapshotSchemaVersion?: number
  outlet: OutletSettings
  printSettings: PrintSettings
  cloudSync?: CloudSyncSettings
  appUpdate?: AppUpdateSettings
  menuCategories: MenuCategory[]
  menuItems: MenuItem[]
  floors: Floor[]
  tables: RestaurantTable[]
  stations: Station[]
  inventoryItems: InventoryItem[]
  purchaseEntries?: PurchaseEntry[]
  orders: Order[]
  orderItems: OrderItem[]
  kots: KOT[]
  payments: Payment[]
  auditLogs: AuditLog[]
  savedCarts?: Record<string, CartItem[]>
}

export function isClosedSnapshotOrder(order: Order) {
  return order.isClosed === true || Boolean(order.closedAt) || ['paid', 'cancelled', 'void'].includes(order.status)
}

function withoutCloudSecret(snapshot: BillingSnapshot): BillingSnapshot {
  if (!snapshot.cloudSync) return snapshot
  return {
    ...snapshot,
    cloudSync: {
      ...snapshot.cloudSync,
      accountSecret: '',
      lastSyncedAt: undefined,
      lastCloudUploadedAt: undefined,
      lastCloudDownloadedAt: undefined,
    },
  }
}

/** Build the small cloud bootstrap while leaving the caller's full local
 * snapshot untouched. Closed order history remains in local SQLite and D1. */
export function createOperationalSnapshot(snapshot: BillingSnapshot): BillingSnapshot {
  const activeOrders = snapshot.orders.filter((order) => !isClosedSnapshotOrder(order))
  const activeOrderIds = new Set(activeOrders.map((order) => order.id))
  const tables = snapshot.tables.map((table) => {
    if (!table.activeOrderId || activeOrderIds.has(table.activeOrderId)) return table
    return { ...table, status: table.status === 'dirty' ? 'dirty' as const : 'available' as const, activeOrderId: undefined }
  })
  const activeTableIds = new Set(tables
    .filter((table) => table.activeOrderId && activeOrderIds.has(table.activeOrderId))
    .map((table) => table.id))
  const savedCarts = Object.fromEntries(Object.entries(snapshot.savedCarts ?? {})
    .filter(([key]) => activeTableIds.has(key) || activeOrderIds.has(key)))

  return withoutCloudSecret({
    ...snapshot,
    snapshotKind: 'operational',
    snapshotSchemaVersion: 3,
    orders: activeOrders,
    orderItems: snapshot.orderItems.filter((item) => activeOrderIds.has(item.orderId)),
    kots: snapshot.kots.filter((kot) => activeOrderIds.has(kot.orderId)),
    payments: snapshot.payments.filter((payment) => activeOrderIds.has(payment.orderId)),
    tables,
    savedCarts,
    purchaseEntries: [],
    auditLogs: [],
  })
}

/** Merge a compact cloud bootstrap into a desktop without deleting its local
 * closed-order, purchase, or audit history. */
export function mergeOperationalSnapshot(local: BillingSnapshot, cloud: BillingSnapshot): BillingSnapshot {
  if (cloud.snapshotKind !== 'operational') return cloud
  const localClosedOrders = local.orders.filter(isClosedSnapshotOrder)
  const localClosedIds = new Set(localClosedOrders.map((order) => order.id))
  const cloudOrderIds = new Set(cloud.orders.map((order) => order.id))
  return {
    ...cloud,
    cloudSync: local.cloudSync,
    appUpdate: local.appUpdate,
    purchaseEntries: local.purchaseEntries ?? [],
    auditLogs: local.auditLogs,
    orders: [...cloud.orders, ...localClosedOrders.filter((order) => !cloudOrderIds.has(order.id))],
    orderItems: [...cloud.orderItems, ...local.orderItems.filter((item) => localClosedIds.has(item.orderId) && !cloudOrderIds.has(item.orderId))],
    kots: [...cloud.kots, ...local.kots.filter((kot) => localClosedIds.has(kot.orderId) && !cloudOrderIds.has(kot.orderId))],
    payments: [...cloud.payments, ...local.payments.filter((payment) => localClosedIds.has(payment.orderId) && !cloudOrderIds.has(payment.orderId))],
  }
}

export type CloudStateResponse =
  | { exists: false; outletId: string }
  | { exists: true; outletId: string; tenantId: string; updatedAt: string; payload: BillingSnapshot }

export type CloudAuth = {
  accountLogin?: string
  accountSecret?: string
}

function getStoredCloudSettings(): CloudSyncSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const preferences = window.localStorage.getItem('bhojpatra-cloud-settings-v2')
    if (preferences) return JSON.parse(preferences) as CloudSyncSettings
    const raw = window.localStorage.getItem('bhojpatra-restaurant-data-v2')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { cloudSync?: CloudSyncSettings } }
    return parsed.state?.cloudSync ?? null
  } catch {
    return null
  }
}

function activeCloudSettings() {
  const cloud = getStoredCloudSettings()
  if (!cloud?.enabled || !cloud.serverUrl || !cloud.outletId) return null
  return {
    serverUrl: cloud.serverUrl,
    outletId: cloud.outletId,
    tenantId: cloud.tenantId,
    auth: { accountLogin: cloud.accountLogin, accountSecret: cloud.accountSecret },
  }
}

const now = () => new Date().toISOString()

function cleanBaseUrl(serverUrl: string) {
  const fallback = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev'
  const raw = String(serverUrl || '').trim()
  if (!raw) return fallback
  return raw.replace(/\/+$/, '')
}

function authHeaders(auth?: CloudAuth): Record<string, string> {
  if (!auth?.accountLogin || !auth.accountSecret) return {}
  return {
    Authorization: `Basic ${btoa(`${auth.accountLogin}:${auth.accountSecret}`)}`,
  }
}

export async function runCloudLogin(serverUrl: string, emailOrPhone: string, password: string): Promise<{ user: User; outlets: OutletSettings[] }> {
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ emailOrPhone, password }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Cloud login failed' })) as { error?: string }
    throw new Error(payload.error || 'Cloud login failed')
  }
  return response.json() as Promise<{ user: User; outlets: OutletSettings[] }>
}

export function getRealtimeUrl(outletId: string, clientId: string) {
  const url = new URL(`https://desktop.local/${encodeURIComponent(outletId)}/realtime`)
  url.searchParams.set('clientId', clientId)
  return url.toString()
}

export async function fetchCloudBootstrap(
  outletId: string,
  serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  auth?: CloudAuth
): Promise<{ outlet: OutletSettings; users: User[]; realtime: { status: string; transport: string; manualSyncRequired: boolean } }> {
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/outlets/${encodeURIComponent(outletId)}/bootstrap`, {
    headers: { Accept: 'application/json', ...authHeaders(auth) },
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`Cloud bootstrap failed with ${response.status}`)
  return response.json()
}

export async function cloudLogin(_emailOrPhone: string, _password: string): Promise<{ user: User; outlets: OutletSettings[] }> {
  throw new Error('Cloud login is disabled in BhojPatra Desk')
}

function currentCloudAuth() {
  const cloud = activeCloudSettings()
  if (!cloud) return null
  return cloud
}

export async function fetchCloudStaff(serverUrl?: string, auth?: CloudAuth): Promise<{ staff: StaffAccount[] }> {
  const cloud = currentCloudAuth()
  const baseUrl = serverUrl || cloud?.serverUrl
  const effectiveAuth = auth || cloud?.auth
  if (!baseUrl) return { staff: [] }
  const response = await fetch(`${cleanBaseUrl(baseUrl)}/api/v1/staff/sync`, {
    headers: { Accept: 'application/json', ...authHeaders(effectiveAuth) },
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`Cloud staff fetch failed with ${response.status}`)
  return response.json() as Promise<{ staff: StaffAccount[] }>
}

export async function createCloudStaff(account: StaffAccount, serverUrl?: string, auth?: CloudAuth): Promise<{ user: StaffAccount }> {
  const result = await syncCloudStaff([account], serverUrl, auth)
  if (!result.staff.some((candidate) => candidate.id === account.id)) {
    throw new Error('Cloud did not save this staff login. Please check the owner account and try again.')
  }
  return { user: account }
}

export async function updateCloudStaff(account: StaffAccount, serverUrl?: string, auth?: CloudAuth): Promise<{ user: StaffAccount }> {
  const result = await syncCloudStaff([account], serverUrl, auth)
  if (!result.staff.some((candidate) => candidate.id === account.id)) {
    throw new Error('Cloud did not update this staff login. Please try again.')
  }
  return { user: account }
}

export async function syncCloudStaff(staff: StaffAccount[], serverUrl?: string, auth?: CloudAuth): Promise<{ staff: StaffAccount[] }> {
  const cloud = currentCloudAuth()
  const baseUrl = serverUrl || cloud?.serverUrl
  const effectiveAuth = auth || cloud?.auth
  if (!baseUrl) return { staff }
  const response = await fetch(`${cleanBaseUrl(baseUrl)}/api/v1/staff/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(effectiveAuth) },
    credentials: 'include',
    body: JSON.stringify({ staff }),
  })
  if (!response.ok) throw new Error(`Cloud staff sync failed with ${response.status}`)
  return response.json() as Promise<{ staff: StaffAccount[] }>
}

export function hasSnapshotData(snapshot: BillingSnapshot) {
  return getSnapshotDataScore(snapshot) > 0
}

export function getSnapshotDataScore(snapshot: BillingSnapshot) {
  return [
    snapshot.menuItems.length * 10,
    snapshot.orders.length * 8,
    snapshot.orderItems.length * 6,
    snapshot.payments.length * 6,
    snapshot.kots.length * 5,
    Object.values(snapshot.savedCarts ?? {}).reduce((sum, cart) => sum + cart.length, 0) * 7,
    snapshot.tables.length * 3,
    snapshot.floors.length * 2,
    snapshot.menuCategories.length * 2,
    snapshot.inventoryItems.length * 2,
    (snapshot.purchaseEntries?.length ?? 0) * 3,
  ].reduce((score, value) => score + value, 0)
}

export async function fetchCloudSnapshot(outletId: string, serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev', auth?: CloudAuth): Promise<CloudStateResponse> {
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/outlets/${encodeURIComponent(outletId)}/state`, {
    headers: { Accept: 'application/json', ...authHeaders(auth) },
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`Cloud sync fetch failed with ${response.status}`)
  return response.json() as Promise<CloudStateResponse>
}

const completeSnapshotCollections = [
  'menuCategories', 'menuItems', 'floors', 'tables', 'stations',
  'inventoryItems', 'purchaseEntries', 'orders', 'orderItems',
  'kots', 'payments', 'auditLogs',
] as const

function mergeCloudCollection(primary: unknown, secondary: unknown) {
  const values = [
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(secondary) ? secondary : []),
  ]
  const byId = new Map<string, unknown>()
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') return
    const id = String((value as { id?: unknown }).id ?? `row-${index}`)
    byId.set(id, value)
  })
  return Array.from(byId.values())
}

type CloudOrderHistory = Pick<BillingSnapshot, 'orders' | 'orderItems' | 'kots' | 'payments'>

export async function fetchCloudOrderHistory(
  outletId: string,
  serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  auth?: CloudAuth,
): Promise<CloudOrderHistory> {
  const history: CloudOrderHistory = { orders: [], orderItems: [], kots: [], payments: [] }
  let cursor = 0
  let hasMore = true
  while (hasMore) {
    const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/state/${encodeURIComponent(outletId)}/history?cursor=${cursor}&limit=200`, {
      headers: { Accept: 'application/json', ...authHeaders(auth) },
      credentials: 'include',
    })
    if (!response.ok) throw new Error(`Cloud order-history fetch failed with ${response.status}`)
    const page = await response.json() as CloudOrderHistory & { cursor: number; hasMore: boolean }
    history.orders.push(...page.orders)
    history.orderItems.push(...page.orderItems)
    history.kots.push(...page.kots)
    history.payments.push(...page.payments)
    if (page.hasMore && page.cursor <= cursor) throw new Error('Cloud order-history cursor did not advance')
    cursor = page.cursor
    hasMore = page.hasMore
  }
  return history
}

/**
 * Fetch the complete restaurant dataset. The saved app snapshot contains
 * setup data, while initial-state also projects all relational orders,
 * order-items, KOTs, and payments. Combining both prevents an older snapshot
 * from hiding history that is already present in the cloud database.
 */
export async function fetchCompleteCloudSnapshot(
  outletId: string,
  serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  auth?: CloudAuth,
): Promise<CloudStateResponse> {
  const [savedState, initialState, history] = await Promise.all([
    fetchCloudSnapshot(outletId, serverUrl, auth),
    fetchInitialState(outletId, serverUrl, auth),
    fetchCloudOrderHistory(outletId, serverUrl, auth),
  ])

  const savedPayload = savedState.exists ? savedState.payload : null
  const initialPayload = initialState.exists ? initialState.payload : null
  if (!savedPayload && !initialPayload && history.orders.length === 0) return savedState

  const merged = {
    ...(initialPayload ?? {}),
    ...(savedPayload ?? {}),
  } as BillingSnapshot
  completeSnapshotCollections.forEach((key) => {
    ;(merged as unknown as Record<string, unknown>)[key] = mergeCloudCollection(
      savedPayload?.[key],
      initialPayload?.[key],
    )
  })
  merged.orders = mergeCloudCollection(merged.orders, history.orders) as Order[]
  merged.orderItems = mergeCloudCollection(merged.orderItems, history.orderItems) as OrderItem[]
  merged.kots = mergeCloudCollection(merged.kots, history.kots) as KOT[]
  merged.payments = mergeCloudCollection(merged.payments, history.payments) as Payment[]
  merged.snapshotKind = 'full'
  merged.snapshotSchemaVersion = 1
  merged.savedCarts = {
    ...(initialPayload?.savedCarts ?? {}),
    ...(savedPayload?.savedCarts ?? {}),
  }

  return {
    exists: true,
    outletId,
    tenantId: savedState.exists ? savedState.tenantId : initialPayload?.outlet?.tenantId ?? '',
    updatedAt: savedState.exists ? savedState.updatedAt : initialState.updatedAt,
    payload: merged,
  }
}

export async function saveCloudSnapshot(
  outletId: string,
  tenantId: string,
  payload: BillingSnapshot,
  clientId?: string,
  serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  auth?: CloudAuth
): Promise<{ ok: true; outletId: string; updatedAt: string; skipped?: boolean; payload?: BillingSnapshot }> {
  const safePayload = createOperationalSnapshot(payload)
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/outlets/${encodeURIComponent(outletId)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(auth) },
    credentials: 'include',
    body: JSON.stringify({ tenantId, payload: safePayload, clientId }),
  })
  if (!response.ok) throw new Error(`Cloud sync save failed with ${response.status}`)
  return response.json() as Promise<{ ok: true; outletId: string; updatedAt: string; skipped?: boolean; payload?: BillingSnapshot }>
}

export async function saveCloudDailyBackup(
  outletId: string,
  tenantId: string,
  payload: BillingSnapshot,
  clientId?: string,
  serverUrl = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  auth?: CloudAuth,
): Promise<{ ok: true; backupId: string; objectKey: string; createdAt: string; compressedBytes: number }> {
  const fullBackup = withoutCloudSecret({
    ...payload,
    snapshotKind: 'full',
    snapshotSchemaVersion: 1,
  })
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/outlets/${encodeURIComponent(outletId)}/backups/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(auth) },
    credentials: 'include',
    body: JSON.stringify({ tenantId, payload: fullBackup, clientId, createdAt: now() }),
  })
  const body = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(body?.error || `Cloud backup failed with ${response.status}`)
  return body as { ok: true; backupId: string; objectKey: string; createdAt: string; compressedBytes: number }
}

export async function fetchInitialState(
  outletId: string,
  serverUrl?: string,
  auth?: CloudAuth,
): Promise<{ exists: boolean; payload: BillingSnapshot; updatedAt: string }> {
  const cloud = activeCloudSettings()
  const baseUrl = serverUrl || cloud?.serverUrl
  const effectiveAuth = auth || cloud?.auth
  if (!baseUrl) return { exists: false, payload: {} as BillingSnapshot, updatedAt: now() }
  const response = await fetch(`${cleanBaseUrl(baseUrl)}/api/v1/state/${encodeURIComponent(outletId)}/initial-state`, {
    headers: { Accept: 'application/json', ...authHeaders(effectiveAuth) },
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`Initial state fetch failed with ${response.status}`)
  return response.json()
}

export async function createCloudOrder(order: Order, items: OrderItem[]) {
  const cloud = activeCloudSettings()
  if (!cloud) return { ok: true, order, items, skipped: true }
  const response = await fetch(`${cleanBaseUrl(cloud.serverUrl)}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(cloud.auth) },
    credentials: 'include',
    body: JSON.stringify({ ...order, items }),
  })
  if (!response.ok) throw new Error(`Cloud order create failed with ${response.status}`)
  return response.json()
}

export async function updateCloudOrder(order: Order, items: OrderItem[]) {
  const cloud = activeCloudSettings()
  if (!cloud) return { ok: true, order, items, skipped: true }
  const response = await fetch(`${cleanBaseUrl(cloud.serverUrl)}/api/v1/orders/${encodeURIComponent(order.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(cloud.auth) },
    credentials: 'include',
    body: JSON.stringify({ ...order, items }),
  })
  if (!response.ok) throw new Error(`Cloud order update failed with ${response.status}`)
  return response.json()
}

export async function addCloudKOT(outletId: string, kot: KOT) {
  const cloud = activeCloudSettings()
  if (!cloud) return { ok: true, outletId, kot, skipped: true }
  const response = await fetch(`${cleanBaseUrl(cloud.serverUrl)}/api/v1/kots/${encodeURIComponent(outletId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(cloud.auth) },
    credentials: 'include',
    body: JSON.stringify(kot),
  })
  if (!response.ok) throw new Error(`Cloud KOT create failed with ${response.status}`)
  return response.json()
}

export async function updateCloudKOT(outletId: string, kot: KOT) {
  const cloud = activeCloudSettings()
  if (!cloud) return { ok: true, outletId, kot, skipped: true }
  const response = await fetch(`${cleanBaseUrl(cloud.serverUrl)}/api/v1/kots/${encodeURIComponent(outletId)}/${encodeURIComponent(kot.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(cloud.auth) },
    credentials: 'include',
    body: JSON.stringify(kot),
  })
  if (!response.ok) throw new Error(`Cloud KOT update failed with ${response.status}`)
  return response.json()
}

export async function addCloudPayment(outletId: string, payment: Payment) {
  const cloud = activeCloudSettings()
  if (!cloud) return { ok: true, outletId, payment, skipped: true }
  const response = await fetch(`${cleanBaseUrl(cloud.serverUrl)}/api/v1/payments/${encodeURIComponent(outletId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(cloud.auth) },
    credentials: 'include',
    body: JSON.stringify(payment),
  })
  if (!response.ok) throw new Error(`Cloud payment create failed with ${response.status}`)
  return response.json()
}

/*
export async function createCloudOrder(order: Order, items: OrderItem[]) {
  return { ok: true, order, items }
}

export async function updateCloudOrder(order: Order, items: OrderItem[]) {
  return { ok: true, order, items }
}

export async function addCloudKOT(outletId: string, kot: KOT) {
  return { ok: true, outletId, kot }
}

export async function updateCloudKOT(outletId: string, kot: KOT) {
  return { ok: true, outletId, kot }
}

export async function addCloudPayment(outletId: string, payment: Payment) {
  return { ok: true, outletId, payment }
}
*/
