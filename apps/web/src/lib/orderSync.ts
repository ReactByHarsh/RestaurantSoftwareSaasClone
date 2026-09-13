import Dexie, { type EntityTable } from 'dexie'
import {
  fetchCompleteCloudSnapshot,
  mergeOperationalSnapshot,
  type BillingSnapshot,
  type CloudSyncSettings,
} from './cloudSync'
import type { Order } from './types'
import { isTauriDesktop, loadDesktopSyncMetadata, saveDesktopSyncMetadata } from './localDb'

export type OrderAggregatePayload = {
  order: Order
  orderItems: BillingSnapshot['orderItems']
  kots: BillingSnapshot['kots']
  payments: BillingSnapshot['payments']
  table?: BillingSnapshot['tables'][number]
}

export type SyncChange = {
  entityType: 'order_aggregate'
  entityId: string
  orderUuid: string
  baseVersion: number
  version: number
  operation: 'upsert'
  updatedAt: string
  isClosed: boolean
  payloadHash: string
  payload: OrderAggregatePayload
}

type SyncRecord = {
  key: string
  entityType: 'order_aggregate'
  entityId: string
  orderUuid: string
  version: number
  baseVersion: number
  syncedVersion: number
  sourceHash: string
  payloadHash: string
  updatedAt: string
  syncedAt?: string
  conflictState?: string
}

type SyncOutboxRow = SyncChange & {
  key: string
  batchId: string
  retryCount: number
  nextRetryAt?: string
}

type SyncStateRow = { key: string; value: string }
type SyncConflictRow = {
  key: string
  entityId: string
  orderUuid: string
  code: string
  details: unknown
  createdAt: string
}
type LocalSnapshotRow = { key: string; payload: BillingSnapshot; updatedAt: string }
type AppStateRow = { key: string; value: string }

class BhojPatraLocalDatabase extends Dexie {
  syncRecords!: EntityTable<SyncRecord, 'key'>
  syncOutbox!: EntityTable<SyncOutboxRow, 'key'>
  syncState!: EntityTable<SyncStateRow, 'key'>
  syncConflicts!: EntityTable<SyncConflictRow, 'key'>
  snapshots!: EntityTable<LocalSnapshotRow, 'key'>
  appState!: EntityTable<AppStateRow, 'key'>

  constructor() {
    super('bhojpatra-local-v2')
    this.version(1).stores({
      syncRecords: '&key, entityType, entityId, orderUuid, updatedAt, syncedAt, conflictState',
      syncOutbox: '&key, batchId, entityId, orderUuid, updatedAt, nextRetryAt',
      syncState: '&key',
      syncConflicts: '&key, entityId, orderUuid, code, createdAt',
      snapshots: '&key, updatedAt',
    })
    this.version(2).stores({
      syncRecords: '&key, entityType, entityId, orderUuid, updatedAt, syncedAt, conflictState',
      syncOutbox: '&key, batchId, entityId, orderUuid, updatedAt, nextRetryAt',
      syncState: '&key',
      syncConflicts: '&key, entityId, orderUuid, code, createdAt',
      snapshots: '&key, updatedAt',
      appState: '&key',
    })
  }
}

export const localSyncDb = new BhojPatraLocalDatabase()

/** Zustand async storage. The one-time localStorage fallback migrates existing
 * browser/PWA installations without leaving business state in localStorage. */
export const dexieBusinessStateStorage = {
  async getItem(key: string) {
    const stored = await localSyncDb.appState.get(key)
    if (stored) return stored.value
    const legacy = typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
    if (legacy != null) {
      await localSyncDb.appState.put({ key, value: legacy })
      try {
        const cloudSync = (JSON.parse(legacy) as { state?: { cloudSync?: unknown } }).state?.cloudSync
        if (cloudSync) localStorage.setItem('bhojpatra-cloud-settings-v2', JSON.stringify(cloudSync))
      } catch { /* malformed legacy state is handled by Zustand */ }
      localStorage.removeItem(key)
    }
    return legacy
  },
  async setItem(key: string, value: string) {
    await localSyncDb.appState.put({ key, value })
  },
  async removeItem(key: string) {
    await localSyncDb.appState.delete(key)
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  },
}

let desktopStorageHydrated: Promise<void> | null = null

async function ensureDesktopStorageHydrated() {
  if (!isTauriDesktop()) return
  if (!desktopStorageHydrated) desktopStorageHydrated = (async () => {
    const metadata = await loadDesktopSyncMetadata()
    if (!metadata) return
    await localSyncDb.transaction(
      'rw',
      localSyncDb.syncRecords,
      localSyncDb.syncOutbox,
      localSyncDb.syncState,
      localSyncDb.syncConflicts,
      async () => {
        await Promise.all([
          localSyncDb.syncRecords.clear(),
          localSyncDb.syncOutbox.clear(),
          localSyncDb.syncState.clear(),
          localSyncDb.syncConflicts.clear(),
        ])
        await localSyncDb.syncRecords.bulkPut(metadata.records as SyncRecord[])
        await localSyncDb.syncOutbox.bulkPut(metadata.outbox as SyncOutboxRow[])
        await localSyncDb.syncState.bulkPut(metadata.state as SyncStateRow[])
        await localSyncDb.syncConflicts.bulkPut(metadata.conflicts as SyncConflictRow[])
      },
    )
  })()
  await desktopStorageHydrated
}

async function mirrorDesktopStorage() {
  if (!isTauriDesktop()) return
  const [records, outbox, state, conflicts] = await Promise.all([
    localSyncDb.syncRecords.toArray(),
    localSyncDb.syncOutbox.toArray(),
    localSyncDb.syncState.toArray(),
    localSyncDb.syncConflicts.toArray(),
  ])
  await saveDesktopSyncMetadata({ records, outbox, state, conflicts })
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]))
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value))
}

export async function payloadHash(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function orderIsClosed(order: Order) {
  return order.isClosed === true || Boolean(order.closedAt) || ['paid', 'cancelled', 'void'].includes(order.status)
}

function sourceAggregate(snapshot: BillingSnapshot, order: Order): OrderAggregatePayload {
  // Reusing a table must not make every historical bill appear changed.
  const table = !orderIsClosed(order) && order.tableId ? snapshot.tables.find((candidate) => candidate.id === order.tableId) : undefined
  return {
    order: { ...order, orderUuid: order.orderUuid || order.id, isClosed: orderIsClosed(order) },
    orderItems: snapshot.orderItems.filter((item) => item.orderId === order.id),
    kots: snapshot.kots.filter((kot) => kot.orderId === order.id),
    payments: snapshot.payments.filter((payment) => payment.orderId === order.id),
    table,
  }
}

export async function getDeviceId() {
  const existing = await localSyncDb.syncState.get('deviceId')
  if (existing?.value) return existing.value
  const value = `web_${crypto.randomUUID()}`
  await localSyncDb.syncState.put({ key: 'deviceId', value })
  return value
}

async function getCursor(outletId: string) {
  const row = await localSyncDb.syncState.get(`pullCursor:v3:${outletId}`)
  return Number(row?.value || 0) || 0
}

async function setCursor(outletId: string, cursor: number) {
  await localSyncDb.syncState.put({ key: `pullCursor:v3:${outletId}`, value: String(cursor) })
}

export async function persistBrowserBusinessSnapshot(snapshot: BillingSnapshot) {
  await localSyncDb.snapshots.put({ key: 'restaurant', payload: snapshot, updatedAt: new Date().toISOString() })
}

export async function loadBrowserBusinessSnapshot() {
  return (await localSyncDb.snapshots.get('restaurant'))?.payload ?? null
}

export async function captureOrderDeltas(snapshot: BillingSnapshot) {
  const changed: SyncOutboxRow[] = []
  for (const order of snapshot.orders) {
    const key = `order_aggregate:${order.id}`
    const existing = await localSyncDb.syncRecords.get(key)
    const source = sourceAggregate(snapshot, order)
    const sourceHash = await payloadHash({ ...source, order: { ...source.order, version: undefined } })
    if (existing?.sourceHash === sourceHash) continue

    const version = existing ? existing.version + 1 : Math.max(1, order.version ?? 1)
    const baseVersion = existing?.syncedVersion ?? Math.max(0, (order.version ?? 1) - 1)
    const updatedAt = order.updatedAt || new Date().toISOString()
    const payload: OrderAggregatePayload = {
      ...source,
      order: { ...source.order, version, isClosed: orderIsClosed(order) },
    }
    const hash = await payloadHash(payload)
    const batchId = `batch_${crypto.randomUUID()}`
    const outbox: SyncOutboxRow = {
      key,
      entityType: 'order_aggregate',
      entityId: order.id,
      orderUuid: order.orderUuid || order.id,
      baseVersion,
      version,
      operation: 'upsert',
      updatedAt,
      isClosed: orderIsClosed(order),
      payloadHash: hash,
      payload,
      batchId,
      retryCount: 0,
    }
    await localSyncDb.transaction('rw', localSyncDb.syncRecords, localSyncDb.syncOutbox, async () => {
      await localSyncDb.syncRecords.put({
        key,
        entityType: 'order_aggregate',
        entityId: order.id,
        orderUuid: outbox.orderUuid,
        version,
        baseVersion,
        syncedVersion: existing?.syncedVersion ?? baseVersion,
        sourceHash,
        payloadHash: hash,
        updatedAt,
        syncedAt: existing?.syncedAt,
      })
      // Replacing the row also replaces the batch id. A changed payload must
      // never reuse the idempotency key of an older payload.
      await localSyncDb.syncOutbox.put(outbox)
    })
    changed.push(outbox)
  }
  await persistBrowserBusinessSnapshot(snapshot)
  return changed
}

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function authorization(settings: CloudSyncSettings): Record<string, string> {
  return settings.accountLogin && settings.accountSecret
    ? { Authorization: `Basic ${btoa(`${settings.accountLogin}:${settings.accountSecret}`)}` }
    : {}
}

type PushAck = { entityId: string; orderUuid: string; version: number; payloadHash: string; syncedAt: string; cursor: number }
type PushConflict = { entityId: string; orderUuid: string; code: string; canonical?: unknown; [key: string]: unknown }
type PushResponse = {
  accepted: PushAck[]
  duplicates: PushAck[]
  conflicts: PushConflict[]
  cursor: number
  serverTime: string
}

const retryMinutes = [1, 5, 15, 60]
export const MAX_ORDER_CHANGES_PER_PUSH = 50

export function chunkOrderChanges<T>(rows: T[], size = MAX_ORDER_CHANGES_PER_PUSH) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_ORDER_CHANGES_PER_PUSH) throw new Error('Batch size must be between 1 and 50')
  const batches: T[][] = []
  let batch: T[] = []
  let bytes = 0
  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length
    if (rowBytes > 512 * 1024) throw new Error('An order is too large to sync automatically; its local data has been retained')
    if (batch.length && (batch.length >= size || bytes + rowBytes > 512 * 1024)) {
      batches.push(batch); batch = []; bytes = 0
    }
    batch.push(row); bytes += rowBytes
  }
  if (batch.length) batches.push(batch)
  return batches
}

async function pushOutboxBatch(settings: CloudSyncSettings, rows: SyncOutboxRow[], deviceId: string, cursor: number) {
  const batchIdentity = await payloadHash(rows.map((row) => row.batchId))
  const response = await fetch(`${cleanBaseUrl(settings.serverUrl)}/api/v2/outlets/${encodeURIComponent(settings.outletId)}/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authorization(settings) },
    credentials: 'include',
    body: JSON.stringify({
      protocolVersion: 2,
      deviceId,
      // Derived from immutable per-row mutation IDs so a network retry reuses
      // the same idempotency key, while any changed row produces a new key.
      batchId: `batch_${batchIdentity.slice(0, 48)}`,
      baseCursor: cursor,
      changes: rows.map((row) => ({
        entityType: row.entityType,
        entityId: row.entityId,
        orderUuid: row.orderUuid,
        baseVersion: row.baseVersion,
        version: row.version,
        operation: row.operation,
        updatedAt: row.updatedAt,
        isClosed: row.isClosed,
        payloadHash: row.payloadHash,
        payload: row.payload,
      })),
    }),
  })
  const body = await response.json().catch(() => null) as (PushResponse & { error?: string }) | null
  if (!response.ok) {
    const detail = body?.error ? `: ${body.error}` : ''
    throw new Error(`Order delta push failed with ${response.status}${detail}`)
  }
  if (!body) throw new Error('Order delta push returned an invalid response')
  return body
}

async function acknowledge(row: SyncOutboxRow, acknowledgement: PushAck) {
  if (acknowledgement.entityId !== row.entityId || acknowledgement.version !== row.version || acknowledgement.payloadHash !== row.payloadHash) return false
  await localSyncDb.transaction('rw', localSyncDb.syncRecords, localSyncDb.syncOutbox, async () => {
    const current = await localSyncDb.syncRecords.get(row.key)
    // An old acknowledgement must never mark a newer local edit as synced.
    if (current?.version === row.version && current.payloadHash === row.payloadHash) {
      await localSyncDb.syncRecords.update(row.key, {
        syncedAt: acknowledgement.syncedAt,
        syncedVersion: acknowledgement.version,
        baseVersion: acknowledgement.version,
        conflictState: undefined,
      })
    }
    const pending = await localSyncDb.syncOutbox.get(row.key)
    if (pending?.version === row.version && pending.payloadHash === row.payloadHash) await localSyncDb.syncOutbox.delete(row.key)
  })
  return true
}

async function recordConflict(row: SyncOutboxRow, item: PushConflict) {
  const createdAt = new Date().toISOString()
  await localSyncDb.transaction('rw', localSyncDb.syncRecords, localSyncDb.syncOutbox, localSyncDb.syncConflicts, async () => {
    const pending = await localSyncDb.syncOutbox.get(row.key)
    if (pending?.version === row.version && pending.payloadHash === row.payloadHash) {
      await localSyncDb.syncRecords.update(row.key, { conflictState: item.code })
      await localSyncDb.syncOutbox.delete(row.key)
    }
    await localSyncDb.syncConflicts.put({
      key: `${row.key}:${row.version}`,
      entityId: row.entityId,
      orderUuid: row.orderUuid,
      code: item.code,
      details: item,
      createdAt,
    })
  })
}

function mergeRemoteAggregate(snapshot: BillingSnapshot, change: SyncChange): BillingSnapshot {
  const order = { ...change.payload.order, id: change.orderUuid, orderUuid: change.orderUuid, version: change.version, isClosed: change.isClosed }
  const next: BillingSnapshot = {
    ...snapshot,
    orders: [order, ...snapshot.orders.filter((candidate) => candidate.id !== change.orderUuid)],
    orderItems: [...change.payload.orderItems, ...snapshot.orderItems.filter((item) => item.orderId !== change.orderUuid)],
    kots: [...change.payload.kots, ...snapshot.kots.filter((kot) => kot.orderId !== change.orderUuid)],
    payments: [...change.payload.payments, ...snapshot.payments.filter((payment) => payment.orderId !== change.orderUuid)],
  }
  if (change.payload.table && !change.isClosed) next.tables = [change.payload.table, ...snapshot.tables.filter((table) => table.id !== change.payload.table?.id)]
  if (change.isClosed && order.tableId) {
    next.tables = next.tables.map((table) => table.activeOrderId === order.id
      ? { ...table, status: table.status === 'dirty' ? 'dirty' : 'available', activeOrderId: undefined }
      : table)
    const savedCarts = { ...(next.savedCarts ?? {}) }
    const tableNow = next.tables.find(table => table.id === order.tableId)
    if (!tableNow?.activeOrderId || tableNow.activeOrderId === order.id) delete savedCarts[order.tableId]
    delete savedCarts[order.id]
    next.savedCarts = savedCarts
  }
  return next
}

async function pullChanges(settings: CloudSyncSettings, initial: BillingSnapshot) {
  let snapshot = initial
  let cursor = await getCursor(settings.outletId)
  let hasMore = true
  let changed = false
  while (hasMore) {
    const response = await fetch(`${cleanBaseUrl(settings.serverUrl)}/api/v2/outlets/${encodeURIComponent(settings.outletId)}/sync/pull?cursor=${cursor}&limit=100`, {
      headers: { Accept: 'application/json', ...authorization(settings) },
      credentials: 'include',
    })
    if (!response.ok) throw new Error(`Order delta pull failed with ${response.status}`)
    const page = await response.json() as {
      changes: Array<SyncChange & { cursor: number }>
      cursor: number
      hasMore: boolean
      resetRequired?: boolean
    }
    if (page.resetRequired) {
      const operational = await fetchCompleteCloudSnapshot(
        settings.outletId,
        settings.serverUrl,
        { accountLogin: settings.accountLogin, accountSecret: settings.accountSecret },
      )
      if (operational.exists) {
        const remote = operational.payload
        const pending = await localSyncDb.syncOutbox.toArray()
        const pendingIds = new Set(pending.map(row => row.orderUuid))
        const local = snapshot
        snapshot = mergeOperationalSnapshot(local, { ...remote, snapshotKind: 'operational' })
        // A bootstrap cannot acknowledge pending edits. Keep them intact until
        // they receive a matching server acknowledgement.
        for (const order of local.orders.filter(order => pendingIds.has(order.id))) {
          const payload = sourceAggregate(local, order)
          snapshot = mergeRemoteAggregate(snapshot, {
            entityType:'order_aggregate', entityId:order.id, orderUuid:order.id,
            baseVersion:0, version:order.version ?? 1, operation:'upsert',
            updatedAt:order.updatedAt, isClosed:orderIsClosed(order), payloadHash:'', payload,
          })
        }
        for (const order of remote.orders.filter(order => !pendingIds.has(order.id))) {
          const payload = sourceAggregate(snapshot, order)
          const version = order.version ?? 1
          await localSyncDb.syncRecords.put({
            key:`order_aggregate:${order.id}`, entityType:'order_aggregate', entityId:order.id,
            orderUuid:order.id, version, baseVersion:version, syncedVersion:version,
            sourceHash:await payloadHash({...payload,order:{...payload.order,version:undefined}}),
            payloadHash:await payloadHash(payload), updatedAt:order.updatedAt, syncedAt:new Date().toISOString(),
          })
        }
        changed = true
      }
      cursor = page.cursor
      hasMore = false
      await persistBrowserBusinessSnapshot(snapshot)
      await setCursor(settings.outletId, cursor)
      continue
    }
    for (const change of page.changes) {
      const key = `${change.entityType}:${change.entityId}`
      const local = await localSyncDb.syncRecords.get(key)
      const pending = await localSyncDb.syncOutbox.get(key)
      if (pending && (pending.version !== change.version || pending.payloadHash !== change.payloadHash)) {
        await localSyncDb.syncConflicts.put({
          key: `${key}:remote:${change.version}`,
          entityId: change.entityId,
          orderUuid: change.orderUuid,
          code: 'REMOTE_UPDATE_WITH_PENDING_LOCAL_CHANGE',
          details: change,
          createdAt: new Date().toISOString(),
        })
        await localSyncDb.syncRecords.update(key, { conflictState: 'REMOTE_UPDATE_WITH_PENDING_LOCAL_CHANGE' })
        continue
      }
      snapshot = mergeRemoteAggregate(snapshot, change)
      changed = true
      const serverUpdatedAt = change.updatedAt || new Date().toISOString()
      await localSyncDb.syncRecords.put({
        key,
        entityType: change.entityType,
        entityId: change.entityId,
        orderUuid: change.orderUuid,
        version: change.version,
        baseVersion: change.version,
        syncedVersion: change.version,
        sourceHash: await payloadHash({ ...sourceAggregate(snapshot, snapshot.orders.find(order => order.id === change.orderUuid)!), order: { ...snapshot.orders.find(order => order.id === change.orderUuid)!, version: undefined } }),
        payloadHash: change.payloadHash,
        updatedAt: serverUpdatedAt,
        syncedAt: serverUpdatedAt,
      })
      await localSyncDb.syncOutbox.delete(key)
    }
    await persistBrowserBusinessSnapshot(snapshot)
    cursor = page.cursor
    hasMore = page.hasMore
    await setCursor(settings.outletId, cursor)
  }
  if (changed) await persistBrowserBusinessSnapshot(snapshot)
  return { snapshot, changed, cursor }
}

let activeSync: Promise<OrderSyncResult> | null = null
const leaseKey = 'bhojpatra-order-sync-lease-v2'

function acquireLease(deviceId: string) {
  const now = Date.now()
  try {
    const lease = JSON.parse(localStorage.getItem(leaseKey) || 'null') as { owner?: string; expiresAt?: number } | null
    if (lease?.expiresAt && lease.expiresAt > now && lease.owner !== deviceId) return false
    localStorage.setItem(leaseKey, JSON.stringify({ owner: deviceId, expiresAt: now + 120_000 }))
    return JSON.parse(localStorage.getItem(leaseKey) || 'null').owner === deviceId
  } catch {
    return true
  }
}

function releaseLease(deviceId: string) {
  try {
    const lease = JSON.parse(localStorage.getItem(leaseKey) || 'null') as { owner?: string } | null
    if (lease?.owner === deviceId) localStorage.removeItem(leaseKey)
  } catch { /* ignored */ }
}

export type OrderSyncResult = {
  snapshot: BillingSnapshot
  uploaded: number
  conflicts: number
  cursor: number
  changed: boolean
  skipped?: boolean
  pending?: number
}

async function executeSync(snapshot: BillingSnapshot, settings: CloudSyncSettings): Promise<OrderSyncResult> {
  await ensureDesktopStorageHydrated()
  await captureOrderDeltas(snapshot)
  const deviceId = await getDeviceId()
  if (!acquireLease(deviceId)) return { snapshot, uploaded: 0, conflicts: 0, cursor: await getCursor(settings.outletId), changed: false, skipped: true }
  try {
    let cursor = await getCursor(settings.outletId)
    let uploaded = 0
    let conflictCount = 0
    const rows = (await localSyncDb.syncOutbox.orderBy('updatedAt').toArray())
      .filter((row) => !row.nextRetryAt || Date.parse(row.nextRetryAt) <= Date.now())
    for (const batch of chunkOrderChanges(rows)) {
      try {
        const result = await pushOutboxBatch(settings, batch, deviceId, cursor)
        // Push cursors describe writes, not consumed remote changes. Advancing
        // the pull cursor here would skip edits made by another computer.
        for (const ack of [...result.accepted, ...result.duplicates]) {
          const row = batch.find((candidate) => candidate.entityId === ack.entityId)
          if (row && await acknowledge(row, ack)) uploaded += 1
        }
        for (const item of result.conflicts) {
          const row = batch.find((candidate) => candidate.entityId === item.entityId)
          if (row) {
            await recordConflict(row, item)
            conflictCount += 1
          }
        }
      } catch (error) {
        await Promise.all(batch.map(async (row) => {
          const retryCount = row.retryCount + 1
          const delay = retryMinutes[Math.min(retryCount - 1, retryMinutes.length - 1)]
          await localSyncDb.syncOutbox.update(row.key, {
            retryCount,
            nextRetryAt: new Date(Date.now() + delay * 60_000).toISOString(),
          })
        }))
        throw error
      }
    }
    const pulled = await pullChanges(settings, snapshot)
    const pending = await localSyncDb.syncOutbox.count()
    return { snapshot: pulled.snapshot, uploaded, conflicts: conflictCount, cursor: pulled.cursor, changed: pulled.changed, pending }
  } finally {
    await mirrorDesktopStorage()
    releaseLease(deviceId)
  }
}

export function syncOrderDeltasNow(snapshot: BillingSnapshot, settings: CloudSyncSettings) {
  if (!settings.enabled || !settings.serverUrl || !settings.outletId || !settings.accountLogin || !settings.accountSecret) {
    return Promise.resolve<OrderSyncResult>({ snapshot, uploaded: 0, conflicts: 0, cursor: 0, changed: false, skipped: true })
  }
  if (!activeSync) activeSync = executeSync(snapshot, settings).finally(() => { activeSync = null })
  return activeSync
}

export async function getOrderSyncHealth() {
  const [pending, conflicts, oldest] = await Promise.all([
    localSyncDb.syncOutbox.count(),
    localSyncDb.syncConflicts.count(),
    localSyncDb.syncOutbox.orderBy('updatedAt').first(),
  ])
  return { pending, conflicts, oldestPendingAt: oldest?.updatedAt }
}
