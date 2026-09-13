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

export const syncRetention = {
  changesPerOutlet: 3_000,
  batchesPerOutletDevice: 200,
  conflictsPerOutlet: 200,
} as const

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

/** The pull cursor is transport progress, not part of the mutation identity.
 * A retry after an earlier row advances the cursor must still have the same
 * idempotency hash. */
export function syncPushIdempotencyValue(push: SyncPush) {
  return { ...push, baseCursor: 0 }
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

function replaceById(values: unknown[], next: Record<string, unknown>, idKey = 'id'): Record<string, unknown>[] {
  const id = text(next[idKey])
  return [next, ...values.map(asRecord).filter((value) => text(value[idKey]) !== id)]
}

function replaceForOrder(values: unknown[], orderUuid: string, replacements: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...replacements, ...values.map(asRecord).filter((value) => text(value.orderId) !== orderUuid)]
}

export function isClosedOrderRecord(value: unknown) {
  const order = asRecord(value)
  return order.isClosed === true
    || Boolean(text(order.closedAt))
    || ['paid', 'cancelled', 'void'].includes(text(order.status))
}

/**
 * The cloud snapshot is an operational bootstrap document, not an accounting
 * archive. Completed orders remain authoritative in the normalized D1 tables
 * and in R2 backups, while the desktop keeps its complete local SQLite copy.
 */
export function compactOperationalSnapshot(source: Record<string, unknown>) {
  const activeOrders = asArray(source.orders).map(asRecord).filter((order) => !isClosedOrderRecord(order))
  const activeOrderIds = new Set(activeOrders.map((order) => text(order.id)).filter(Boolean))
  const tables = asArray(source.tables).map(asRecord).map((table) => {
    const activeOrderId = text(table.activeOrderId)
    if (!activeOrderId || activeOrderIds.has(activeOrderId)) return table
    const { activeOrderId: _removed, ...availableTable } = table
    return { ...availableTable, status: table.status === 'dirty' ? 'dirty' : 'available' }
  })
  const activeTableIds = new Set(tables
    .filter((table) => text(table.activeOrderId) && activeOrderIds.has(text(table.activeOrderId)))
    .map((table) => text(table.id)))
  const savedCarts = Object.fromEntries(Object.entries(asRecord(source.savedCarts))
    .filter(([key]) => activeTableIds.has(key) || activeOrderIds.has(key)))

  return {
    ...source,
    snapshotKind: 'operational',
    snapshotSchemaVersion: 3,
    orders: activeOrders,
    orderItems: asArray(source.orderItems).map(asRecord).filter((item) => activeOrderIds.has(text(item.orderId))),
    kots: asArray(source.kots).map(asRecord).filter((kot) => activeOrderIds.has(text(kot.orderId))),
    payments: asArray(source.payments).map(asRecord).filter((payment) => activeOrderIds.has(text(payment.orderId))),
    tables,
    savedCarts,
    // Historical purchases and audit rows are relational/local history. They
    // must not make the frequently-read bootstrap document grow forever.
    purchaseEntries: [],
    auditLogs: [],
  }
}

export function applyOrderAggregateToSnapshot(
  source: Record<string, unknown>,
  change: SyncChange,
) {
  const snapshot = compactOperationalSnapshot(source)
  const order: Record<string, unknown> = {
    ...change.payload.order,
    id: change.orderUuid,
    version: change.version,
    isClosed: change.isClosed,
  }
  snapshot.orders = change.isClosed
    ? asArray(snapshot.orders).map(asRecord).filter((value) => text(value.id) !== change.orderUuid)
    : replaceById(asArray(snapshot.orders), order)
  snapshot.orderItems = replaceForOrder(asArray(snapshot.orderItems), change.orderUuid, change.isClosed ? [] : change.payload.orderItems)
  snapshot.kots = replaceForOrder(asArray(snapshot.kots), change.orderUuid, change.isClosed ? [] : change.payload.kots)
  snapshot.payments = replaceForOrder(asArray(snapshot.payments), change.orderUuid, change.isClosed ? [] : change.payload.payments)
  if (change.payload.table && !change.isClosed) snapshot.tables = replaceById(asArray(snapshot.tables), change.payload.table)

  if (change.isClosed) {
    const tableId = text(order.tableId)
    if (tableId) {
      const savedCarts = { ...asRecord(snapshot.savedCarts) }
      const tableNow = asArray(snapshot.tables).map(asRecord).find(table => text(table.id) === tableId)
      if (!tableNow?.activeOrderId || text(tableNow.activeOrderId) === change.orderUuid) delete savedCarts[tableId]
      delete savedCarts[change.orderUuid]
      snapshot.savedCarts = savedCarts
      snapshot.tables = asArray(snapshot.tables).map(asRecord).map((table) => {
        if (text(table.activeOrderId) !== change.orderUuid) return table
        return { ...table, status: table.status === 'dirty' ? 'dirty' : 'available', activeOrderId: undefined }
      })
    }
  }
  return compactOperationalSnapshot(snapshot)
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

export async function runDailySyncMaintenance(db: D1Database, outletId?: string) {
  const outletPredicate = outletId ? 'WHERE outlet_id = ?' : ''
  const outletValues = outletId ? [outletId] : []
  const changes = await db.prepare(`
    DELETE FROM sync_changes
    WHERE sequence IN (
      SELECT sequence FROM (
        SELECT sequence,
          ROW_NUMBER() OVER (PARTITION BY outlet_id ORDER BY sequence DESC) AS retention_rank
        FROM sync_changes
        ${outletPredicate}
      )
      WHERE retention_rank > ?
    )
  `).bind(...outletValues, syncRetention.changesPerOutlet).run()
  const batches = await db.prepare(`
    DELETE FROM sync_batches
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT rowid,
          ROW_NUMBER() OVER (PARTITION BY outlet_id, device_id ORDER BY created_at DESC) AS retention_rank
        FROM sync_batches
        ${outletPredicate}
      )
      WHERE retention_rank > ?
    )
  `).bind(...outletValues, syncRetention.batchesPerOutletDevice).run()
  const conflicts = await db.prepare(`
    DELETE FROM sync_conflicts
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (PARTITION BY outlet_id ORDER BY created_at DESC) AS retention_rank
        FROM sync_conflicts
        ${outletPredicate}
      )
      WHERE retention_rank > ?
    )
  `).bind(...outletValues, syncRetention.conflictsPerOutlet).run()
  return {
    changesDeleted: changes.meta.changes ?? 0,
    batchesDeleted: batches.meta.changes ?? 0,
    conflictsDeleted: conflicts.meta.changes ?? 0,
  }
}

export function aggregateFromSnapshot(snapshot: Record<string, unknown> | undefined, orderUuid: string) {
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

type AcceptedMutation = {
  change: SyncChange
  mutationId: string
  serverTime: string
}

/**
 * Project up to 50 aggregates with a fixed number of D1 statements. Each
 * collection is passed as JSON and expanded by SQLite's json_each(), avoiding
 * one D1 query per order/item and staying below the Free-plan invocation cap.
 */
function bulkOrderStatements(
  db: D1Database,
  outletId: string,
  tenantId: string,
  accepted: AcceptedMutation[],
  operationalSnapshot: Record<string, unknown>,
  projectionOnly = false,
) {
  const orderIds = accepted.map(({ change }) => change.orderUuid)
  const orderRows = accepted.map(({ change, mutationId, serverTime }) => {
    const order = change.payload.order
    return {
      id: change.orderUuid,
      tenantId,
      outletId,
      orderNo: text(order.orderNo),
      businessDate: text(order.businessDate),
      type: text(order.type, 'dine_in'),
      status: text(order.status, change.isClosed ? 'void' : 'running'),
      tableId: text(order.tableId) || null,
      tableName: text(order.tableName) || null,
      customerId: text(order.customerId) || null,
      customerName: text(order.customerName) || null,
      customerPhone: text(order.customerPhone) || null,
      captainUserId: text(order.captainUserId) || null,
      captainName: text(order.captainName) || null,
      cashierUserId: text(order.cashierUserId) || null,
      cashierName: text(order.cashierName) || null,
      subtotalPaise: number(order.subtotalPaise),
      discountPaise: number(order.discountPaise),
      taxPaise: number(order.taxPaise),
      chargePaise: number(order.chargePaise),
      totalPaise: number(order.totalPaise),
      paidPaise: number(order.paidPaise),
      paymentStatus: text(order.paymentStatus, 'unpaid'),
      notes: text(order.notes) || null,
      version: change.version,
      createdAt: text(order.createdAt, change.updatedAt),
      updatedAt: text(order.updatedAt, change.updatedAt),
      closedAt: change.isClosed ? text(order.closedAt, change.updatedAt) : null,
      cancellationReason: text(order.cancellationReason) || null,
      cancelledAt: text(order.cancelledAt) || null,
      isClosed: change.isClosed ? 1 : 0,
      payloadHash: change.payloadHash,
      mutationId,
      serverTime,
    }
  })
  const orderItemRows = accepted.flatMap(({ change }) => change.payload.orderItems.map((item) => ({
    id: text(item.id), tenantId, outletId, orderId: change.orderUuid,
    menuItemId: text(item.menuItemId), nameSnapshot: text(item.nameSnapshot), itemType: text(item.itemType, 'other'),
    quantity: number(item.quantity), unitPricePaise: number(item.unitPricePaise), taxPaise: number(item.taxPaise),
    discountPaise: number(item.discountPaise), totalPaise: number(item.totalPaise), stationId: text(item.stationId) || null,
    status: text(item.status, 'draft'), note: text(item.note) || null,
    modifiersJson: item.modifiers == null ? null : JSON.stringify(item.modifiers),
    createdAt: text(item.createdAt, change.updatedAt), updatedAt: text(item.updatedAt, change.updatedAt),
  })))
  const kotRows = accepted.flatMap(({ change }) => change.payload.kots.map((kot) => ({
    id: text(kot.id), tenantId, outletId, orderId: change.orderUuid, kotNo: text(kot.kotNo),
    stationId: text(kot.stationId) || null, status: text(kot.status, 'new'), createdByUserId: text(kot.createdByUserId),
    printedAt: text(kot.printedAt) || null, createdAt: text(kot.createdAt, change.updatedAt),
    updatedAt: text(kot.updatedAt, change.updatedAt), orderNo: text(kot.orderNo) || null,
    tableName: text(kot.tableName) || null, orderType: text(kot.orderType) || null,
    captainName: text(kot.captainName) || null, cancellationReason: text(kot.cancellationReason) || null,
    cancelledAt: text(kot.cancelledAt) || null,
  })))
  const kotItemRows = accepted.flatMap(({ change }) => validRelationalKotItems(change.payload).map(({ kot, item }) => ({
    id: text(item.id), tenantId, outletId, kotId: text(kot.id), orderItemId: text(item.orderItemId),
    quantity: number(item.quantity), status: text(item.status, 'new'),
    createdAt: text(item.createdAt, change.updatedAt), updatedAt: text(item.updatedAt, change.updatedAt),
    name: text(item.name) || null, note: text(item.note) || null,
    modifiers: item.modifiers == null ? null : JSON.stringify(item.modifiers), itemType: text(item.itemType) || null,
  })))
  const paymentRows = accepted.flatMap(({ change }) => change.payload.payments.map((payment) => ({
    id: text(payment.id), tenantId, outletId, orderId: change.orderUuid,
    method: text(payment.method, 'cash'), amountPaise: number(payment.amountPaise),
    referenceNo: text(payment.referenceNo) || null, status: text(payment.status, 'success'),
    collectedByUserId: text(payment.collectedByUserId), createdAt: text(payment.createdAt, change.updatedAt),
    statusReason: text(payment.statusReason) || null,
  })))
  const tableRows = accepted.flatMap(({ change, serverTime }) => {
    const tableId = text(change.payload.order.tableId)
    if (!tableId) return []
    return [{
      id: tableId,
      status: change.isClosed ? 'available' : text(change.payload.table?.status, 'occupied'),
      activeOrderId: change.isClosed ? null : change.orderUuid,
      closingOrderId: change.isClosed ? change.orderUuid : null,
      updatedAt: serverTime,
    }]
  })
  const changeRows = accepted.map(({ change, serverTime }) => ({
    outletId,
    entityType: change.entityType,
    entityId: change.entityId,
    orderUuid: change.orderUuid,
    version: change.version,
    operation: change.operation,
    payloadHash: change.payloadHash,
    payloadJson: JSON.stringify(change.payload),
    serverTime,
  }))
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
      .bind(outletId, JSON.stringify(orderIds)),
    db.prepare('DELETE FROM kot_items WHERE outlet_id = ? AND kot_id IN (SELECT id FROM kots WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?)))')
      .bind(outletId, outletId, JSON.stringify(orderIds)),
    db.prepare('DELETE FROM kots WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
      .bind(outletId, JSON.stringify(orderIds)),
    db.prepare('DELETE FROM order_items WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
      .bind(outletId, JSON.stringify(orderIds)),
  ]

  const upsertOrders = (rows: typeof orderRows) => {
    if (rows.length === 0) return
    statements.push(db.prepare(`
      INSERT INTO orders (
        id, tenant_id, outlet_id, order_no, business_date, type, status, table_id, table_name,
        customer_id, customer_name, customer_phone, captain_user_id, captain_name,
        cashier_user_id, cashier_name, subtotal_paise, discount_paise, tax_paise, charge_paise,
        total_paise, paid_paise, payment_status, notes, version, created_at, updated_at, closed_at,
        cancellation_reason, cancelled_at, is_closed, payload_hash, last_mutation_id, server_updated_at
      )
      SELECT
        json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.outletId'),
        json_extract(value, '$.orderNo'), json_extract(value, '$.businessDate'), json_extract(value, '$.type'),
        json_extract(value, '$.status'), json_extract(value, '$.tableId'), json_extract(value, '$.tableName'),
        json_extract(value, '$.customerId'), json_extract(value, '$.customerName'), json_extract(value, '$.customerPhone'),
        json_extract(value, '$.captainUserId'), json_extract(value, '$.captainName'), json_extract(value, '$.cashierUserId'),
        json_extract(value, '$.cashierName'), json_extract(value, '$.subtotalPaise'), json_extract(value, '$.discountPaise'),
        json_extract(value, '$.taxPaise'), json_extract(value, '$.chargePaise'), json_extract(value, '$.totalPaise'),
        json_extract(value, '$.paidPaise'), json_extract(value, '$.paymentStatus'), json_extract(value, '$.notes'),
        json_extract(value, '$.version'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt'),
        json_extract(value, '$.closedAt'), json_extract(value, '$.cancellationReason'), json_extract(value, '$.cancelledAt'),
        json_extract(value, '$.isClosed'), json_extract(value, '$.payloadHash'), json_extract(value, '$.mutationId'),
        json_extract(value, '$.serverTime')
      FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status, table_id = excluded.table_id, table_name = excluded.table_name,
        customer_id = excluded.customer_id, customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
        captain_user_id = excluded.captain_user_id, captain_name = excluded.captain_name,
        cashier_user_id = excluded.cashier_user_id, cashier_name = excluded.cashier_name,
        subtotal_paise = excluded.subtotal_paise, discount_paise = excluded.discount_paise,
        tax_paise = excluded.tax_paise, charge_paise = excluded.charge_paise,
        total_paise = excluded.total_paise, paid_paise = excluded.paid_paise,
        payment_status = excluded.payment_status, notes = excluded.notes, version = excluded.version,
        updated_at = excluded.updated_at,
        closed_at = CASE WHEN orders.is_closed = 1 THEN orders.closed_at ELSE excluded.closed_at END,
        cancellation_reason = excluded.cancellation_reason, cancelled_at = excluded.cancelled_at,
        is_closed = CASE WHEN orders.is_closed = 1 THEN 1 ELSE excluded.is_closed END,
        payload_hash = excluded.payload_hash, last_mutation_id = excluded.last_mutation_id,
        server_updated_at = excluded.server_updated_at
      WHERE excluded.version > orders.version OR (excluded.version = orders.version AND orders.payload_hash IS NULL)
    `).bind(JSON.stringify(rows)))
  }
  // Close rows first so a table can safely be transferred to a new order in
  // the same batch without violating the one-open-order partial unique index.
  upsertOrders(orderRows.filter((row) => row.isClosed === 1))
  upsertOrders(orderRows.filter((row) => row.isClosed === 0))

  if (orderItemRows.length) statements.push(db.prepare(`
    INSERT INTO order_items (
      id, tenant_id, outlet_id, order_id, menu_item_id, name_snapshot, item_type, quantity,
      unit_price_paise, tax_paise, discount_paise, total_paise, station_id, status, note,
      modifiers_json, created_at, updated_at
    ) SELECT
      json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.outletId'),
      json_extract(value, '$.orderId'), json_extract(value, '$.menuItemId'), json_extract(value, '$.nameSnapshot'),
      json_extract(value, '$.itemType'), json_extract(value, '$.quantity'), json_extract(value, '$.unitPricePaise'),
      json_extract(value, '$.taxPaise'), json_extract(value, '$.discountPaise'), json_extract(value, '$.totalPaise'),
      json_extract(value, '$.stationId'), json_extract(value, '$.status'), json_extract(value, '$.note'),
      json_extract(value, '$.modifiersJson'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
    FROM json_each(?)
  `).bind(JSON.stringify(orderItemRows)))
  if (kotRows.length) statements.push(db.prepare(`
    INSERT INTO kots (
      id, tenant_id, outlet_id, order_id, kot_no, station_id, status, created_by_user_id,
      printed_at, created_at, updated_at, order_no, table_name, order_type, captain_name,
      cancellation_reason, cancelled_at
    ) SELECT
      json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.outletId'),
      json_extract(value, '$.orderId'), json_extract(value, '$.kotNo'), json_extract(value, '$.stationId'),
      json_extract(value, '$.status'), json_extract(value, '$.createdByUserId'), json_extract(value, '$.printedAt'),
      json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt'), json_extract(value, '$.orderNo'),
      json_extract(value, '$.tableName'), json_extract(value, '$.orderType'), json_extract(value, '$.captainName'),
      json_extract(value, '$.cancellationReason'), json_extract(value, '$.cancelledAt')
    FROM json_each(?)
  `).bind(JSON.stringify(kotRows)))
  if (kotItemRows.length) statements.push(db.prepare(`
    INSERT INTO kot_items (
      id, tenant_id, outlet_id, kot_id, order_item_id, quantity, status,
      created_at, updated_at, name, note, modifiers, item_type
    ) SELECT
      json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.outletId'),
      json_extract(value, '$.kotId'), json_extract(value, '$.orderItemId'), json_extract(value, '$.quantity'),
      json_extract(value, '$.status'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt'),
      json_extract(value, '$.name'), json_extract(value, '$.note'), json_extract(value, '$.modifiers'),
      json_extract(value, '$.itemType')
    FROM json_each(?)
  `).bind(JSON.stringify(kotItemRows)))
  if (paymentRows.length) statements.push(db.prepare(`
    INSERT INTO payments (
      id, tenant_id, outlet_id, order_id, method, amount_paise, reference_no,
      status, collected_by_user_id, created_at, status_reason
    ) SELECT
      json_extract(value, '$.id'), json_extract(value, '$.tenantId'), json_extract(value, '$.outletId'),
      json_extract(value, '$.orderId'), json_extract(value, '$.method'), json_extract(value, '$.amountPaise'),
      json_extract(value, '$.referenceNo'), json_extract(value, '$.status'), json_extract(value, '$.collectedByUserId'),
      json_extract(value, '$.createdAt'), json_extract(value, '$.statusReason')
    FROM json_each(?)
  `).bind(JSON.stringify(paymentRows)))
  const metadataRows = accepted.map(({ change }) => ({
    id: change.orderUuid,
    metadata: {
      recipeConsumptionStatus: change.payload.order.recipeConsumptionStatus,
      recipeConsumedAt: change.payload.order.recipeConsumedAt,
      recipeReversedAt: change.payload.order.recipeReversedAt,
      migrationOriginalOrderNo: change.payload.order.migrationOriginalOrderNo,
    },
  }))
  const itemMetadata = accepted.flatMap(({ change }) => change.payload.orderItems.map(item => ({
    id: item.id, metadata: { isSeparateBill: item.isSeparateBill, taxPercent: item.taxPercent, taxType: item.taxType },
  })))
  const kotMetadata = accepted.flatMap(({ change }) => {
    const ids = new Set(change.payload.orderItems.map(item => item.id))
    return change.payload.kots.map(kot => ({ id: kot.id, metadata: {
      orphanedItems: asArray(kot.items).map(asRecord).filter(item => !ids.has(item.orderItemId)),
    } }))
  })
  for (const [table, rows] of [['orders', metadataRows], ['order_items', itemMetadata], ['kots', kotMetadata]] as const) {
    if (!rows.length) continue
    statements.push(db.prepare(`
      WITH incoming AS (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.metadata') AS metadata FROM json_each(?))
      UPDATE ${table} SET metadata_json = (SELECT metadata FROM incoming WHERE incoming.id = ${table}.id)
      WHERE outlet_id = ? AND id IN (SELECT id FROM incoming)
    `).bind(JSON.stringify(rows), outletId))
  }
  if (projectionOnly) return statements
  if (tableRows.length) statements.push(db.prepare(`
    WITH incoming AS (
      SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.status') AS status,
        json_extract(value, '$.activeOrderId') AS active_order_id, json_extract(value, '$.updatedAt') AS updated_at,
        json_extract(value, '$.closingOrderId') AS closing_order_id,
        CAST(key AS INTEGER) AS ordinal
      FROM json_each(?)
    )
    UPDATE restaurant_tables
    SET status = (SELECT status FROM incoming WHERE incoming.id = restaurant_tables.id ORDER BY ordinal DESC LIMIT 1),
        active_order_id = (SELECT active_order_id FROM incoming WHERE incoming.id = restaurant_tables.id ORDER BY ordinal DESC LIMIT 1),
        updated_at = (SELECT updated_at FROM incoming WHERE incoming.id = restaurant_tables.id ORDER BY ordinal DESC LIMIT 1)
    WHERE outlet_id = ? AND id IN (SELECT id FROM incoming)
      AND (SELECT closing_order_id IS NULL OR closing_order_id = restaurant_tables.active_order_id FROM incoming WHERE incoming.id = restaurant_tables.id ORDER BY ordinal DESC LIMIT 1)
  `).bind(JSON.stringify(tableRows), outletId))
  statements.push(db.prepare(`
    INSERT INTO app_snapshots (outlet_id, tenant_id, payload_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(outlet_id) DO UPDATE SET tenant_id = excluded.tenant_id,
      payload_json = excluded.payload_json, updated_at = excluded.updated_at
  `).bind(outletId, tenantId, JSON.stringify(operationalSnapshot), accepted.at(-1)?.serverTime ?? new Date().toISOString()))
  statements.push(db.prepare(`
    INSERT INTO sync_changes (
      outlet_id, entity_type, entity_id, order_uuid, version, operation,
      payload_hash, payload_json, server_updated_at
    ) SELECT
      json_extract(value, '$.outletId'), json_extract(value, '$.entityType'), json_extract(value, '$.entityId'),
      json_extract(value, '$.orderUuid'), json_extract(value, '$.version'), json_extract(value, '$.operation'),
      json_extract(value, '$.payloadHash'), json_extract(value, '$.payloadJson'), json_extract(value, '$.serverTime')
    FROM json_each(?)
  `).bind(JSON.stringify(changeRows)))
  return statements
}

/** Only fills missing legacy orders. Existing canonical orders are never replaced. */
export async function backfillMissingSnapshotOrders(db: D1Database, outletId: string, tenantId: string, snapshot: Record<string, unknown>) {
  const allOrders = asArray(snapshot.orders).map(asRecord)
  const [existing, usedOrderNumbers] = await Promise.all([
    db.prepare('SELECT id, outlet_id FROM orders WHERE id IN (SELECT value FROM json_each(?))')
      .bind(JSON.stringify(allOrders.map(order => text(order.id)))).all<{ id: string; outlet_id: string }>(),
    db.prepare('SELECT order_no FROM orders WHERE outlet_id = ? AND order_no IN (SELECT value FROM json_each(?))')
      .bind(outletId, JSON.stringify(allOrders.map(order => text(order.orderNo)))).all<{ order_no: string }>(),
  ])
  if (existing.results.some(order => order.outlet_id !== outletId)) throw new Error('Legacy order identity belongs to a different outlet; manual reconciliation required')
  const existingIds = new Set(existing.results.map(order => order.id))
  const usedOrderNos = new Set(usedOrderNumbers.results.map(order => order.order_no))
  const missing = allOrders.filter(order => !existingIds.has(text(order.id)))
  const now = new Date().toISOString()
  const mutations: AcceptedMutation[] = []
  let bytes = 0
  for (const order of missing.slice(0, 50)) {
    const id = text(order.id)
    const originalPayload = aggregateFromSnapshot(snapshot, id)!
    const originalOrderNo = text(originalPayload.order.orderNo)
    const orderNo = usedOrderNos.has(originalOrderNo) ? `${originalOrderNo}~${id.slice(-8)}` : originalOrderNo
    usedOrderNos.add(orderNo)
    const payload = { ...originalPayload, order: {
      ...originalPayload.order, orderNo,
      ...(orderNo !== originalOrderNo ? { migrationOriginalOrderNo: originalOrderNo } : {}),
    } }
    bytes += new TextEncoder().encode(JSON.stringify(payload)).length
    if (bytes > 512 * 1024 && mutations.length) break
    if (bytes > 1024 * 1024) throw new Error('Legacy order is too large for automatic migration')
    const change: SyncChange = {
      entityType: 'order_aggregate', entityId: id, orderUuid: id, baseVersion: 0,
      version: Math.max(1, number(order.version, 1)), operation: 'upsert', updatedAt: text(order.updatedAt, now),
      isClosed: isClosedOrderRecord(order), payloadHash: await sha256Hex(payload), payload,
    }
    mutations.push({ change, serverTime: now, mutationId: `migration:${id}` })
  }
  if (mutations.length) await db.batch(bulkOrderStatements(db, outletId, tenantId, mutations, snapshot, true))
  return { backfilled: mutations.length, remaining: missing.length - mutations.length }
}

async function logConflict(
  db: D1Database,
  outletId: string,
  push: SyncPush,
  item: SyncConflict,
) {
  await db.batch([
    db.prepare(`
      INSERT INTO sync_conflicts (
        outlet_id, device_id, batch_id, entity_type, entity_id, code,
        incoming_version, canonical_version, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      outletId, push.deviceId, push.batchId, item.entityType, item.entityId, item.code,
      item.incomingVersion, item.canonicalVersion ?? null,
      item.canonical == null ? null : JSON.stringify(item.canonical), new Date().toISOString(),
    ),
    db.prepare(`
      DELETE FROM sync_conflicts
      WHERE id IN (
        SELECT id FROM sync_conflicts
        WHERE outlet_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?
      )
    `).bind(outletId, syncRetention.conflictsPerOutlet),
  ])
}

export async function applySyncPush(
  db: D1Database,
  outletId: string,
  tenantId: string,
  push: SyncPush,
): Promise<{ status: number; body: SyncPushResponse | Record<string, unknown> }> {
  const seen = new Set<string>()
  for (const change of push.changes) {
    if (seen.has(change.orderUuid) || change.entityId !== change.orderUuid || change.payload.order.id !== change.orderUuid
      || isClosedOrderRecord(change.payload.order) !== change.isClosed || change.operation !== 'upsert') {
      return { status: 400, body: { error: 'Invalid or duplicate order identity/state in batch' } }
    }
    seen.add(change.orderUuid)
  }
  // Order ids are globally unique. Never update a different tenant's row.
  const foreign = await db.prepare(`SELECT id FROM orders WHERE outlet_id <> ? AND id IN (SELECT value FROM json_each(?)) LIMIT 1`)
    .bind(outletId, JSON.stringify([...seen])).first()
  if (foreign) return { status: 409, body: { error: 'Order identity is already in use' } }
  const requestHash = await sha256Hex(syncPushIdempotencyValue(push))
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
  if (snapshot && snapshot.payload.snapshotKind !== 'operational') {
    return { status: 503, body: { error: 'Cloud history migration is pending; retry after maintenance', code: 'SNAPSHOT_MIGRATION_REQUIRED' } }
  }
  const accepted: SyncAck[] = []
  const duplicates: SyncAck[] = []
  const conflicts: SyncConflict[] = []
  const serverTime = new Date().toISOString()
  let cursor = push.baseCursor
  const orderIds = [...new Set(push.changes.map((change) => change.orderUuid))]
  const currentRows = orderIds.length
    ? await db.prepare(`
        SELECT id, version, is_closed, payload_hash FROM orders
        WHERE outlet_id = ? AND id IN (SELECT value FROM json_each(?))
      `).bind(outletId, JSON.stringify(orderIds)).all<{
        id: string
        version: number
        is_closed: number
        payload_hash: string | null
      }>()
    : { results: [] }
  const currentById = new Map(currentRows.results.map((row) => [row.id, row]))
  const calculatedHashes = await Promise.all(push.changes.map((change) => sha256Hex(change.payload)))
  const eligible: SyncChange[] = []

  for (const [index, change] of push.changes.entries()) {
    const calculatedHash = calculatedHashes[index]
    if (calculatedHash !== change.payloadHash.toLowerCase()) {
      const item = conflict(change, 'INVALID_PAYLOAD_HASH', 'Payload hash does not match the canonical payload')
      conflicts.push(item)
      continue
    }
    const current = currentById.get(change.orderUuid)
    const canonical = aggregateFromSnapshot(snapshot?.payload, change.orderUuid)

    if (current?.is_closed === 1 && !change.isClosed) {
      const item = conflict(change, 'STALE_CLOSED_ORDER', 'A closed order cannot be reopened', current.version, canonical)
      conflicts.push(item)
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
      continue
    }
    eligible.push(change)
  }

  const incomingTableIds = [...new Set(eligible
    .filter((change) => !change.isClosed)
    .map((change) => text(change.payload.order.tableId))
    .filter(Boolean))]
  const activeTableRows = incomingTableIds.length
    ? await db.prepare(`
        SELECT id, table_id, version FROM orders
        WHERE outlet_id = ? AND is_closed = 0
          AND table_id IN (SELECT value FROM json_each(?))
      `).bind(outletId, JSON.stringify(incomingTableIds)).all<{ id: string; table_id: string; version: number }>()
    : { results: [] }
  const activeByTable = new Map(activeTableRows.results.map((row) => [row.table_id, row]))
  const closingIds = new Set(eligible.filter((change) => change.isClosed).map((change) => change.orderUuid))
  const claimedInBatch = new Map<string, SyncChange>()
  const acceptedMutations: AcceptedMutation[] = []

  for (const change of eligible) {
    const tableId = text(change.payload.order.tableId)
    if (!change.isClosed && tableId) {
      const active = activeByTable.get(tableId)
      const planned = claimedInBatch.get(tableId)
      if ((active && active.id !== change.orderUuid && !closingIds.has(active.id))
        || (planned && planned.orderUuid !== change.orderUuid)) {
        const blockingId = planned?.orderUuid ?? active?.id ?? ''
        const item = conflict(
          change,
          'TABLE_ALREADY_ACTIVE',
          'Another active order already owns this table',
          planned?.version ?? active?.version,
          aggregateFromSnapshot(snapshot?.payload, blockingId),
        )
        conflicts.push(item)
        continue
      }
      claimedInBatch.set(tableId, change)
    }
    const mutationId = `${push.deviceId}:${push.batchId}:${change.entityId}:${change.version}`
    acceptedMutations.push({ change, mutationId, serverTime })
  }

  if (acceptedMutations.length) {
    // Snapshot state is deterministic even when one batch closes an old table
    // order and opens its replacement: closures apply before active orders.
    const ordered = [...acceptedMutations].sort((left, right) => Number(right.change.isClosed) - Number(left.change.isClosed))
    let nextPayload = compactOperationalSnapshot(snapshot?.payload ?? {})
    for (const { change } of ordered) nextPayload = applyOrderAggregateToSnapshot(nextPayload, change)
    await db.batch(bulkOrderStatements(db, outletId, tenantId, ordered, nextPayload))
    snapshot = { tenantId, payload: nextPayload, updatedAt: serverTime }

    const acceptedIdentity = ordered.map(({ change }) => ({
      entityId: change.entityId,
      version: change.version,
      payloadHash: change.payloadHash,
    }))
    const inserted = await db.prepare(`
      SELECT sc.entity_id, sc.version, sc.payload_hash, sc.sequence
      FROM sync_changes sc
      JOIN json_each(?) incoming
        ON sc.entity_id = json_extract(incoming.value, '$.entityId')
       AND sc.version = json_extract(incoming.value, '$.version')
       AND sc.payload_hash = json_extract(incoming.value, '$.payloadHash')
      WHERE sc.outlet_id = ?
      ORDER BY sc.sequence ASC
    `).bind(JSON.stringify(acceptedIdentity), outletId).all<{
      entity_id: string
      version: number
      payload_hash: string
      sequence: number
    }>()
    const sequenceByIdentity = new Map(inserted.results.map((row) => [`${row.entity_id}:${row.version}:${row.payload_hash}`, row.sequence]))
    for (const { change } of ordered) {
      const sequence = sequenceByIdentity.get(`${change.entityId}:${change.version}:${change.payloadHash}`) ?? cursor
      cursor = Math.max(cursor, sequence)
      accepted.push({
        entityType: change.entityType, entityId: change.entityId, orderUuid: change.orderUuid,
        version: change.version, payloadHash: change.payloadHash, syncedAt: serverTime, cursor: sequence,
      })
    }
  }

  const maxSequence = await db.prepare('SELECT MAX(sequence) AS sequence FROM sync_changes WHERE outlet_id = ?')
    .bind(outletId).first<{ sequence: number | null }>()
  cursor = Math.max(cursor, maxSequence?.sequence ?? 0)
  for (const duplicate of duplicates) duplicate.cursor = cursor
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
  const finalStatements: D1PreparedStatement[] = []
  if (conflicts.length) {
    const conflictRows = conflicts.map((item) => ({
      outletId, deviceId: push.deviceId, batchId: push.batchId,
      entityType: item.entityType, entityId: item.entityId, code: item.code,
      incomingVersion: item.incomingVersion, canonicalVersion: item.canonicalVersion ?? null,
      detailsJson: item.canonical == null ? null : JSON.stringify(item.canonical), createdAt: response.serverTime,
    }))
    finalStatements.push(db.prepare(`
      INSERT INTO sync_conflicts (
        outlet_id, device_id, batch_id, entity_type, entity_id, code,
        incoming_version, canonical_version, details_json, created_at
      ) SELECT
        json_extract(value, '$.outletId'), json_extract(value, '$.deviceId'), json_extract(value, '$.batchId'),
        json_extract(value, '$.entityType'), json_extract(value, '$.entityId'), json_extract(value, '$.code'),
        json_extract(value, '$.incomingVersion'), json_extract(value, '$.canonicalVersion'),
        json_extract(value, '$.detailsJson'), json_extract(value, '$.createdAt')
      FROM json_each(?)
    `).bind(JSON.stringify(conflictRows)))
  }
  finalStatements.push(db.prepare(`
      INSERT INTO sync_batches (outlet_id, device_id, batch_id, request_hash, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(outletId, push.deviceId, push.batchId, requestHash, JSON.stringify(response), response.serverTime))
  await db.batch(finalStatements)
  return { status: 200, body: response }
}

export async function pullSyncChanges(db: D1Database, outletId: string, cursor: number, limit: number) {
  const bounds = await db.prepare(`
    SELECT MIN(sequence) AS min_sequence, MAX(sequence) AS max_sequence, COUNT(*) AS change_count
    FROM sync_changes WHERE outlet_id = ?
  `).bind(outletId).first<{ min_sequence: number | null; max_sequence: number | null; change_count: number }>()
  if (cursor === 0 || (bounds?.min_sequence && cursor < bounds.min_sequence - 1)) {
    return {
      ok: true,
      protocolVersion: 2 as const,
      outletId,
      changes: [],
      cursor: bounds?.max_sequence ?? cursor,
      hasMore: false,
      resetRequired: true,
      reason: 'sync_cursor_expired',
      serverTime: new Date().toISOString(),
    }
  }
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
    resetRequired: false,
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
