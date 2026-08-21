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

export type BillingSnapshot = {
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
  const [savedState, initialState] = await Promise.all([
    fetchCloudSnapshot(outletId, serverUrl, auth),
    fetchInitialState(outletId, serverUrl, auth),
  ])

  const savedPayload = savedState.exists ? savedState.payload : null
  const initialPayload = initialState.exists ? initialState.payload : null
  if (!savedPayload && !initialPayload) return savedState

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
  const safePayload: BillingSnapshot = payload.cloudSync
    ? {
        ...payload,
        cloudSync: {
          ...payload.cloudSync,
          accountSecret: '',
          lastSyncedAt: undefined,
          lastCloudUploadedAt: undefined,
          lastCloudDownloadedAt: undefined,
        },
      }
    : payload
  const response = await fetch(`${cleanBaseUrl(serverUrl)}/api/v1/outlets/${encodeURIComponent(outletId)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(auth) },
    credentials: 'include',
    body: JSON.stringify({ tenantId, payload: safePayload, clientId }),
  })
  if (!response.ok) throw new Error(`Cloud sync save failed with ${response.status}`)
  return response.json() as Promise<{ ok: true; outletId: string; updatedAt: string; skipped?: boolean; payload?: BillingSnapshot }>
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
