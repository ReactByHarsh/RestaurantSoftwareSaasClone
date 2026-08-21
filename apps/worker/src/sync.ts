import { z } from 'zod'

const recordSchema = z.record(z.unknown())

export const orderAggregatePayloadSchema = z.object({
  order: recordSchema,
  orderItems: z.array(recordSchema).default([]),
  kots: z.array(recordSchema).default([]),
  payments: z.array(recordSchema).default([]),
  table: recordSchema.optional(),
})

export const syncChangeSchema = z.object({
  entityType: z.literal('order_aggregate'),
  entityId: z.string().min(1),
  orderUuid: z.string().min(1),
  baseVersion: z.number().int().min(0),
  version: z.number().int().min(1),
  operation: z.enum(['upsert', 'delete']).default('upsert'),
  updatedAt: z.string().min(1),
  isClosed: z.boolean(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/i),
  payload: orderAggregatePayloadSchema,
})

export const syncPushSchema = z.object({
  protocolVersion: z.literal(2),
  deviceId: z.string().min(1).max(160),
  batchId: z.string().min(1).max(160),
  baseCursor: z.number().int().min(0).default(0),
  changes: z.array(syncChangeSchema).min(1).max(50),
})

export type SyncChange = z.infer<typeof syncChangeSchema>
export type SyncPush = z.infer<typeof syncPushSchema>

type SyncAck = {
  entityType: 'order_aggregate'
  entityId: string
  orderUuid: string
  version: number
  payloadHash: string
  syncedAt: string
  cursor: number
}

type SyncConflict = {
  entityType: 'order_aggregate'
  entityId: string
  orderUuid: string
  code: 'BATCH_ID_REUSED' | 'INVALID_PAYLOAD_HASH' | 'VERSION_CONFLICT' | 'STALE_CLOSED_ORDER' | 'TABLE_ALREADY_ACTIVE'
  message: string
  incomingVersion: number
  canonicalVersion?: number
  canonical?: unknown
}

export type SyncPushResponse = {
  ok: true
  protocolVersion: 2
  outletId: string
  batchId: string
  accepted: SyncAck[]
  duplicates: SyncAck[]
  conflicts: SyncConflict[]
  cursor: number
  serverTime: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value))
}

export async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Legacy snapshots can retain a KOT line after its source order item was
 * removed (for example, when an item was cancelled after printing). The full
 * KOT remains part of the canonical snapshot, but the relational D1 projector
 * cannot insert that line because kot_items.order_item_id is a foreign key.
 */
export function validRelationalKotItems(payload: SyncChange['payload']) {
  const orderItemIds = new Set(payload.orderItems.map((item) => text(item.id)).filter(Boolean))
  return payload.kots.flatMap((kot) => asArray(kot.items)
    .map(asRecord)
    .filter((item) => orderItemIds.has(text(item.orderItemId)))
    .map((item) => ({ kot, item })))
}

function replaceById(values: unknown[], next: Record<string, unknown>, idKey = 'id') {
  const id = text(next[idKey])
  return [next, ...values.filter((value) => text(asRecord(value)[idKey]) !== id)]
}

function replaceForOrder(values: unknown[], orderUuid: string, replacements: Record<string, unknown>[]) {
  return [...replacements, ...values.filter((value) => text(asRecord(value).orderId) !== orderUuid)]
}

export function applyOrderAggregateToSnapshot(
  source: Record<string, unknown>,
  change: SyncChange,
) {
  const snapshot = { ...source }
  const order: Record<string, unknown> = {
    ...change.payload.order,
    id: change.orderUuid,
    version: change.version,
    isClosed: change.isClosed,
  }
  snapshot.orders = replaceById(asArray(snapshot.orders), order)
  snapshot.orderItems = replaceForOrder(asArray(snapshot.orderItems), change.orderUuid, change.payload.orderItems)
  snapshot.kots = replaceForOrder(asArray(snapshot.kots), change.orderUuid, change.payload.kots)
  snapshot.payments = replaceForOrder(asArray(snapshot.payments), change.orderUuid, change.payload.payments)
  if (change.payload.table) snapshot.tables = replaceById(asArray(snapshot.tables), change.payload.table)

  if (change.isClosed) {
    const tableId = text(order.tableId)
    if (tableId) {
      const savedCarts = { ...asRecord(snapshot.savedCarts) }
      delete savedCarts[tableId]
      delete savedCarts[change.orderUuid]
      snapshot.savedCarts = savedCarts
      snapshot.tables = asArray(snapshot.tables).map((candidate) => {
        const table = asRecord(candidate)
        if (text(table.id) !== tableId && text(table.activeOrderId) !== change.orderUuid) return candidate
        return { ...table, status: table.status === 'dirty' ? 'dirty' : 'available', activeOrderId: undefined }
      })
    }
  }
  return snapshot
}

async function readSnapshot(db: D1Database, outletId: string) {
  const row = await db.prepare(
    'SELECT tenant_id, payload_json, updated_at FROM app_snapshots WHERE outlet_id = ?',
  ).bind(outletId).first<{ tenant_id: string; payload_json: string; updated_at: string }>()
  if (!row) return null
  try {
    return { tenantId: row.tenant_id, payload: JSON.parse(row.payload_json) as Record<string, unknown>, updatedAt: row.updated_at }
  } catch {
    return null
  }
}

function aggregateFromSnapshot(snapshot: Record<string, unknown> | undefined, orderUuid: string) {
  if (!snapshot) return undefined
  const order = asArray(snapshot.orders).map(asRecord).find((row) => text(row.id) === orderUuid)
  if (!order) return undefined
  const tableId = text(order.tableId)
  return {
    order,
    orderItems: asArray(snapshot.orderItems).map(asRecord).filter((row) => text(row.orderId) === orderUuid),
    kots: asArray(snapshot.kots).map(asRecord).filter((row) => text(row.orderId) === orderUuid),
    payments: asArray(snapshot.payments).map(asRecord).filter((row) => text(row.orderId) === orderUuid),
    table: tableId ? asArray(snapshot.tables).map(asRecord).find((row) => text(row.id) === tableId) : undefined,
  }
}

function conflict(
  change: SyncChange,
  code: SyncConflict['code'],
  message: string,
  canonicalVersion?: number,
  canonical?: unknown,
): SyncConflict {
  return {
    entityType: change.entityType,
    entityId: change.entityId,
    orderUuid: change.orderUuid,
    code,
    message,
    incomingVersion: change.version,
    canonicalVersion,
    canonical,
  }
}

function orderStatements(
  db: D1Database,
  outletId: string,
  tenantId: string,
  change: SyncChange,
  mutationId: string,
  serverTime: string,
) {
  const payload = change.payload
  const order = payload.order
  const orderUuid = change.orderUuid
  const tableId = text(order.tableId) || null
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE order_id = ? AND outlet_id = ?').bind(orderUuid, outletId),
    db.prepare('DELETE FROM kot_items WHERE kot_id IN (SELECT id FROM kots WHERE order_id = ? AND outlet_id = ?)').bind(orderUuid, outletId),
    db.prepare('DELETE FROM kots WHERE order_id = ? AND outlet_id = ?').bind(orderUuid, outletId),
    db.prepare('DELETE FROM order_items WHERE order_id = ? AND outlet_id = ?').bind(orderUuid, outletId),
    db.prepare(`
      INSERT INTO orders (
        id, tenant_id, outlet_id, order_no, business_date, type, status, table_id, table_name,
        customer_id, customer_name, customer_phone, captain_user_id, captain_name,
        cashier_user_id, cashier_name, subtotal_paise, discount_paise, tax_paise, charge_paise,
        total_paise, paid_paise, payment_status, notes, version, created_at, updated_at, closed_at,
        cancellation_reason, cancelled_at, is_closed, payload_hash, last_mutation_id, server_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        table_id = excluded.table_id,
        table_name = excluded.table_name,
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        captain_user_id = excluded.captain_user_id,
        captain_name = excluded.captain_name,
        cashier_user_id = excluded.cashier_user_id,
        cashier_name = excluded.cashier_name,
        subtotal_paise = excluded.subtotal_paise,
        discount_paise = excluded.discount_paise,
        tax_paise = excluded.tax_paise,
        charge_paise = excluded.charge_paise,
        total_paise = excluded.total_paise,
        paid_paise = excluded.paid_paise,
        payment_status = excluded.payment_status,
        notes = excluded.notes,
        version = excluded.version,
        updated_at = excluded.updated_at,
        closed_at = CASE WHEN orders.is_closed = 1 THEN orders.closed_at ELSE excluded.closed_at END,
        cancellation_reason = excluded.cancellation_reason,
        cancelled_at = excluded.cancelled_at,
        is_closed = CASE WHEN orders.is_closed = 1 THEN 1 ELSE excluded.is_closed END,
        payload_hash = excluded.payload_hash,
        last_mutation_id = excluded.last_mutation_id,
        server_updated_at = excluded.server_updated_at
      WHERE excluded.version > orders.version
         OR (excluded.version = orders.version AND orders.payload_hash IS NULL)
    `).bind(
      orderUuid,
      tenantId,
      outletId,
      text(order.orderNo),
      text(order.businessDate),
      text(order.type, 'dine_in'),
      text(order.status, change.isClosed ? 'void' : 'running'),
      tableId,
      text(order.tableName) || null,
      text(order.customerId) || null,
      text(order.customerName) || null,
      text(order.customerPhone) || null,
      text(order.captainUserId) || null,
      text(order.captainName) || null,
      text(order.cashierUserId) || null,
      text(order.cashierName) || null,
      number(order.subtotalPaise),
      number(order.discountPaise),
      number(order.taxPaise),
      number(order.chargePaise),
      number(order.totalPaise),
      number(order.paidPaise),
      text(order.paymentStatus, 'unpaid'),
      text(order.notes) || null,
      change.version,
      text(order.createdAt, change.updatedAt),
      text(order.updatedAt, change.updatedAt),
      change.isClosed ? text(order.closedAt, change.updatedAt) : null,
      text(order.cancellationReason) || null,
      text(order.cancelledAt) || null,
      change.isClosed ? 1 : 0,
      change.payloadHash,
      mutationId,
      serverTime,
    ),
  ]

  for (const item of payload.orderItems) {
    statements.push(db.prepare(`
      INSERT INTO order_items (
        id, tenant_id, outlet_id, order_id, menu_item_id, name_snapshot, item_type, quantity,
        unit_price_paise, tax_paise, discount_paise, total_paise, station_id, status, note,
        modifiers_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(item.id), tenantId, outletId, orderUuid, text(item.menuItemId), text(item.nameSnapshot),
      text(item.itemType, 'other'), number(item.quantity), number(item.unitPricePaise), number(item.taxPaise),
      number(item.discountPaise), number(item.totalPaise), text(item.stationId) || null,
      text(item.status, 'draft'), text(item.note) || null,
      item.modifiers == null ? null : JSON.stringify(item.modifiers),
      text(item.createdAt, change.updatedAt), text(item.updatedAt, change.updatedAt),
    ))
  }

  for (const kot of payload.kots) {
    statements.push(db.prepare(`
      INSERT INTO kots (
        id, tenant_id, outlet_id, order_id, kot_no, station_id, status, created_by_user_id,
        printed_at, created_at, updated_at, order_no, table_name, order_type, captain_name,
        cancellation_reason, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(kot.id), tenantId, outletId, orderUuid, text(kot.kotNo), text(kot.stationId) || null,
      text(kot.status, 'new'), text(kot.createdByUserId), text(kot.printedAt) || null,
      text(kot.createdAt, change.updatedAt), text(kot.updatedAt, change.updatedAt), text(kot.orderNo) || null,
      text(kot.tableName) || null, text(kot.orderType) || null, text(kot.captainName) || null,
      text(kot.cancellationReason) || null, text(kot.cancelledAt) || null,
    ))
  }

  // Project only KOT lines whose order item is present in this aggregate.
  // Orphan legacy lines stay intact in app_snapshots and sync_changes.
  for (const { kot, item } of validRelationalKotItems(payload)) {
    statements.push(db.prepare(`
      INSERT INTO kot_items (
        id, tenant_id, outlet_id, kot_id, order_item_id, quantity, status,
        created_at, updated_at, name, note, modifiers, item_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(item.id), tenantId, outletId, text(kot.id), text(item.orderItemId), number(item.quantity),
      text(item.status, 'new'), text(item.createdAt, change.updatedAt), text(item.updatedAt, change.updatedAt),
      text(item.name) || null, text(item.note) || null,
      item.modifiers == null ? null : JSON.stringify(item.modifiers), text(item.itemType) || null,
    ))
  }

  for (const payment of payload.payments) {
    statements.push(db.prepare(`
      INSERT INTO payments (
        id, tenant_id, outlet_id, order_id, method, amount_paise, reference_no,
        status, collected_by_user_id, created_at, status_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      text(payment.id), tenantId, outletId, orderUuid, text(payment.method, 'cash'),
      number(payment.amountPaise), text(payment.referenceNo) || null, text(payment.status, 'success'),
      text(payment.collectedByUserId), text(payment.createdAt, change.updatedAt), text(payment.statusReason) || null,
    ))
  }

  if (tableId) {
    statements.push(db.prepare(`
      UPDATE restaurant_tables
      SET status = ?, active_order_id = ?, updated_at = ?
      WHERE id = ? AND outlet_id = ?
    `).bind(
      change.isClosed ? text(payload.table?.status, 'available') : text(payload.table?.status, 'occupied'),
      change.isClosed ? null : orderUuid,
      serverTime,
      tableId,
      outletId,
    ))
  }
  return statements
}

async function logConflict(
  db: D1Database,
  outletId: string,
  push: SyncPush,
  item: SyncConflict,
) {
  await db.prepare(`
    INSERT INTO sync_conflicts (
      outlet_id, device_id, batch_id, entity_type, entity_id, code,
      incoming_version, canonical_version, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    outletId, push.deviceId, push.batchId, item.entityType, item.entityId, item.code,
    item.incomingVersion, item.canonicalVersion ?? null,
    item.canonical == null ? null : JSON.stringify(item.canonical), new Date().toISOString(),
  ).run()
}

export async function applySyncPush(
  db: D1Database,
  outletId: string,
  tenantId: string,
  push: SyncPush,
): Promise<{ status: number; body: SyncPushResponse | Record<string, unknown> }> {
  const requestHash = await sha256Hex(push)
  const cached = await db.prepare(`
    SELECT request_hash, response_json FROM sync_batches
    WHERE outlet_id = ? AND device_id = ? AND batch_id = ?
  `).bind(outletId, push.deviceId, push.batchId).first<{ request_hash: string; response_json: string }>()
  if (cached) {
    if (cached.request_hash !== requestHash) {
      return { status: 409, body: { error: 'Batch ID was already used for a different request', code: 'BATCH_ID_REUSED' } }
    }
    return { status: 200, body: JSON.parse(cached.response_json) as SyncPushResponse }
  }

  let snapshot = await readSnapshot(db, outletId)
  const accepted: SyncAck[] = []
  const duplicates: SyncAck[] = []
  const conflicts: SyncConflict[] = []
  let cursor = push.baseCursor

  for (const change of push.changes) {
    const serverTime = new Date().toISOString()
    const calculatedHash = await sha256Hex(change.payload)
    if (calculatedHash !== change.payloadHash.toLowerCase()) {
      const item = conflict(change, 'INVALID_PAYLOAD_HASH', 'Payload hash does not match the canonical payload')
      conflicts.push(item)
      await logConflict(db, outletId, push, item)
      continue
    }

    const current = await db.prepare(`
      SELECT version, is_closed, payload_hash FROM orders WHERE id = ? AND outlet_id = ?
    `).bind(change.orderUuid, outletId).first<{ version: number; is_closed: number; payload_hash: string | null }>()
    const canonical = aggregateFromSnapshot(snapshot?.payload, change.orderUuid)

    if (current?.is_closed === 1 && !change.isClosed) {
      const item = conflict(change, 'STALE_CLOSED_ORDER', 'A closed order cannot be reopened', current.version, canonical)
      conflicts.push(item)
      await logConflict(db, outletId, push, item)
      continue
    }
    if (current && current.version === change.version && current.payload_hash === change.payloadHash) {
      duplicates.push({
        entityType: change.entityType, entityId: change.entityId, orderUuid: change.orderUuid,
        version: change.version, payloadHash: change.payloadHash, syncedAt: serverTime, cursor,
      })
      continue
    }
    const adoptsLegacyProjection = Boolean(
      current && current.payload_hash == null && change.version === current.version
      && (change.baseVersion === 0 || change.baseVersion === current.version),
    )
    if (!adoptsLegacyProjection && ((current && (change.baseVersion !== current.version || change.version <= current.version))
      || (!current && change.baseVersion !== 0))) {
      const item = conflict(change, 'VERSION_CONFLICT', 'The order changed on another device', current?.version, canonical)
      conflicts.push(item)
      await logConflict(db, outletId, push, item)
      continue
    }

    const tableId = text(change.payload.order.tableId)
    if (!change.isClosed && tableId) {
      const active = await db.prepare(`
        SELECT id, version FROM orders
        WHERE outlet_id = ? AND table_id = ? AND is_closed = 0 AND id <> ?
        LIMIT 1
      `).bind(outletId, tableId, change.orderUuid).first<{ id: string; version: number }>()
      if (active) {
        const item = conflict(
          change,
          'TABLE_ALREADY_ACTIVE',
          'Another active order already owns this table',
          active.version,
          aggregateFromSnapshot(snapshot?.payload, active.id),
        )
        conflicts.push(item)
        await logConflict(db, outletId, push, item)
        continue
      }
    }

    const mutationId = `${push.deviceId}:${push.batchId}:${change.entityId}:${change.version}`
    const nextPayload = applyOrderAggregateToSnapshot(snapshot?.payload ?? {}, change)
    const transaction = orderStatements(db, outletId, tenantId, change, mutationId, serverTime)
    if (snapshot) {
      transaction.push(db.prepare(`
        INSERT INTO app_snapshot_history (outlet_id, tenant_id, payload_json, archived_at)
        VALUES (?, ?, ?, ?)
      `).bind(outletId, snapshot.tenantId, JSON.stringify(snapshot.payload), serverTime))
    }
    transaction.push(db.prepare(`
      INSERT INTO app_snapshots (outlet_id, tenant_id, payload_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(outlet_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).bind(outletId, tenantId, JSON.stringify(nextPayload), serverTime))
    transaction.push(db.prepare(`
      INSERT INTO sync_changes (
        outlet_id, entity_type, entity_id, order_uuid, version, operation,
        payload_hash, payload_json, server_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      outletId, change.entityType, change.entityId, change.orderUuid, change.version,
      change.operation, change.payloadHash, JSON.stringify(change.payload), serverTime,
    ))
    transaction.push(db.prepare(`
      DELETE FROM app_snapshot_history
      WHERE outlet_id = ? AND id NOT IN (
        SELECT id FROM app_snapshot_history WHERE outlet_id = ? ORDER BY id DESC LIMIT 20
      )
    `).bind(outletId, outletId))
    await db.batch(transaction)
    const sequence = await db.prepare('SELECT MAX(sequence) AS sequence FROM sync_changes WHERE outlet_id = ?')
      .bind(outletId).first<{ sequence: number | null }>()
    cursor = Math.max(cursor, sequence?.sequence ?? cursor)
    snapshot = { tenantId, payload: nextPayload, updatedAt: serverTime }
    accepted.push({
      entityType: change.entityType, entityId: change.entityId, orderUuid: change.orderUuid,
      version: change.version, payloadHash: change.payloadHash, syncedAt: serverTime, cursor,
    })
  }

  const maxSequence = await db.prepare('SELECT MAX(sequence) AS sequence FROM sync_changes WHERE outlet_id = ?')
    .bind(outletId).first<{ sequence: number | null }>()
  cursor = Math.max(cursor, maxSequence?.sequence ?? 0)
  const response: SyncPushResponse = {
    ok: true,
    protocolVersion: 2,
    outletId,
    batchId: push.batchId,
    accepted,
    duplicates,
    conflicts,
    cursor,
    serverTime: new Date().toISOString(),
  }
  await db.prepare(`
    INSERT INTO sync_batches (outlet_id, device_id, batch_id, request_hash, response_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(outletId, push.deviceId, push.batchId, requestHash, JSON.stringify(response), response.serverTime).run()
  return { status: 200, body: response }
}

export async function pullSyncChanges(db: D1Database, outletId: string, cursor: number, limit: number) {
  const rows = await db.prepare(`
    SELECT sequence, entity_type, entity_id, order_uuid, version, operation,
           payload_hash, payload_json, server_updated_at
    FROM sync_changes
    WHERE outlet_id = ? AND sequence > ?
    ORDER BY sequence ASC
    LIMIT ?
  `).bind(outletId, cursor, limit + 1).all<{
    sequence: number
    entity_type: 'order_aggregate'
    entity_id: string
    order_uuid: string
    version: number
    operation: 'upsert' | 'delete'
    payload_hash: string
    payload_json: string
    server_updated_at: string
  }>()
  const hasMore = rows.results.length > limit
  const page = rows.results.slice(0, limit)
  const changes = page.map((row) => ({
    cursor: row.sequence,
    entityType: row.entity_type,
    entityId: row.entity_id,
    orderUuid: row.order_uuid,
    version: row.version,
    operation: row.operation,
      payloadHash: row.payload_hash,
      updatedAt: row.server_updated_at,
      payload: JSON.parse(row.payload_json),
      isClosed: Boolean((JSON.parse(row.payload_json) as { order?: { isClosed?: boolean; closedAt?: string; status?: string } }).order?.isClosed
        || (JSON.parse(row.payload_json) as { order?: { closedAt?: string } }).order?.closedAt
        || ['paid', 'cancelled', 'void'].includes((JSON.parse(row.payload_json) as { order?: { status?: string } }).order?.status ?? '')),
  }))
  return {
    ok: true,
    protocolVersion: 2,
    outletId,
    changes,
    cursor: page.at(-1)?.sequence ?? cursor,
    hasMore,
    serverTime: new Date().toISOString(),
  }
}

type LegacyMutation = {
  order?: Record<string, unknown>
  orderItems?: Record<string, unknown>[]
  kot?: Record<string, unknown>
  payment?: Record<string, unknown>
  kots?: Record<string, unknown>[]
  payments?: Record<string, unknown>[]
  table?: Record<string, unknown>
  deviceId: string
}

/** Compatibility adapter: legacy order/KOT/payment endpoints become one guarded
 * order-aggregate mutation instead of writing relational rows directly. */
export async function applyLegacyOrderMutation(
  db: D1Database,
  outletId: string,
  tenantId: string,
  orderUuid: string,
  mutation: LegacyMutation,
): Promise<{ status: number; body: SyncPushResponse | { error: string } }> {
  const snapshot = await readSnapshot(db, outletId)
  const current = aggregateFromSnapshot(snapshot?.payload, orderUuid)
  const order = mutation.order ?? current?.order
  if (!order) return { status: 404, body: { error: 'Order not found' } }
  const currentRow = await db.prepare('SELECT version FROM orders WHERE id = ? AND outlet_id = ?')
    .bind(orderUuid, outletId).first<{ version: number }>()
  const isClosed = Boolean(order.isClosed || order.closedAt || ['paid', 'cancelled', 'void'].includes(text(order.status)))
  const kots = mutation.kots ?? current?.kots ?? []
  const payments = mutation.payments ?? current?.payments ?? []
  const nextKots = mutation.kot ? replaceById(kots, mutation.kot) as Record<string, unknown>[] : kots
  const nextPayments = mutation.payment ? replaceById(payments, mutation.payment) as Record<string, unknown>[] : payments
  const nextItems = mutation.orderItems ?? current?.orderItems ?? []
  const nextTable = mutation.table ?? current?.table
  const logicalPayload = (candidate: {
    order: Record<string, unknown>
    orderItems: Record<string, unknown>[]
    kots: Record<string, unknown>[]
    payments: Record<string, unknown>[]
    table?: Record<string, unknown>
  }) => ({
    ...candidate,
    order: { ...candidate.order, id: orderUuid, orderUuid, version: undefined, isClosed },
  })
  if (current && canonicalJson(logicalPayload({
    order: current.order,
    orderItems: current.orderItems,
    kots: current.kots,
    payments: current.payments,
    table: current.table,
  })) === canonicalJson(logicalPayload({
    order,
    orderItems: nextItems,
    kots: nextKots,
    payments: nextPayments,
    table: nextTable,
  }))) {
    return {
      status: 200,
      body: {
        ok: true, protocolVersion: 2, outletId, batchId: 'legacy_unchanged',
        accepted: [], duplicates: [], conflicts: [], cursor: 0,
        serverTime: new Date().toISOString(),
      },
    }
  }
  const version = (currentRow?.version ?? 0) + 1
  const payload = {
    order: { ...order, id: orderUuid, orderUuid, version, isClosed },
    orderItems: nextItems,
    kots: nextKots,
    payments: nextPayments,
    table: nextTable,
  }
  const hash = await sha256Hex(payload)
  const change: SyncChange = {
    entityType: 'order_aggregate',
    entityId: orderUuid,
    orderUuid,
    baseVersion: currentRow?.version ?? 0,
    version,
    operation: 'upsert',
    updatedAt: text(order.updatedAt, new Date().toISOString()),
    isClosed,
    payloadHash: hash,
    payload,
  }
  return applySyncPush(db, outletId, tenantId, {
    protocolVersion: 2,
    deviceId: mutation.deviceId,
    batchId: `legacy_${crypto.randomUUID()}`,
    baseCursor: 0,
    changes: [change],
  }) as Promise<{ status: number; body: SyncPushResponse | { error: string } }>
}
