import { z } from 'zod'
import { backfillMissingSnapshotOrders, compactOperationalSnapshot, isClosedOrderRecord } from './sync'

export const dailyBackupSchema = z.object({
  tenantId: z.string().min(1),
  payload: z.record(z.unknown()),
  clientId: z.string().max(160).optional(),
  createdAt: z.string().datetime().optional(),
})

function safeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160)
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

type BackupWrite = {
  backupId: string
  objectKey: string
  outletId: string
  tenantId: string
  payload: Record<string, unknown>
  createdAt: string
  backupDate: string
  source: 'desktop_daily' | 'legacy_snapshot_history' | 'pre_compaction_snapshot'
  clientId?: string
}

export async function writeCompressedSnapshotBackup(
  db: D1Database,
  bucket: R2Bucket,
  input: BackupWrite,
) {
  const document = {
    format: 'bhojpatra-full-backup',
    schemaVersion: 1,
    outletId: input.outletId,
    tenantId: input.tenantId,
    createdAt: input.createdAt,
    source: input.source,
    payload: { ...input.payload, cloudSync: input.payload.cloudSync && typeof input.payload.cloudSync === 'object'
      ? { ...input.payload.cloudSync, accountSecret: '' } : undefined },
  }
  const uncompressed = new TextEncoder().encode(JSON.stringify(document))
  const checksum = await sha256Hex(uncompressed)
  const compressed = new Blob([uncompressed])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  // R2 put requires a known byte length. Inputs are bounded to 16 MiB at the
  // route and migration boundary, so buffering the compressed result is safe.
  if (uncompressed.byteLength > 16 * 1024 * 1024) throw new Error('Backup exceeds the 16 MiB export limit')
  const stored = await bucket.put(input.objectKey, await new Response(compressed).arrayBuffer(), {
    httpMetadata: {
      contentType: 'application/gzip',
      contentDisposition: `attachment; filename="${safeKeyPart(input.backupId)}.json.gz"`,
    },
    customMetadata: {
      backupId: input.backupId,
      outletId: input.outletId,
      backupDate: input.backupDate,
      schemaVersion: '1',
      sha256: checksum,
    },
  })
  await db.prepare(`
    INSERT INTO cloud_backups (
      id, outlet_id, tenant_id, object_key, backup_date, source, client_id,
      schema_version, uncompressed_bytes, compressed_bytes, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      object_key = excluded.object_key,
      source = excluded.source,
      client_id = excluded.client_id,
      schema_version = excluded.schema_version,
      uncompressed_bytes = excluded.uncompressed_bytes,
      compressed_bytes = excluded.compressed_bytes,
      sha256 = excluded.sha256,
      created_at = excluded.created_at
  `).bind(
    input.backupId,
    input.outletId,
    input.tenantId,
    input.objectKey,
    input.backupDate,
    input.source,
    input.clientId ?? null,
    1,
    uncompressed.byteLength,
    stored.size,
    checksum,
    input.createdAt,
  ).run()
  return {
    ok: true as const,
    backupId: input.backupId,
    objectKey: stored.key,
    createdAt: input.createdAt,
    uncompressedBytes: uncompressed.byteLength,
    compressedBytes: stored.size,
    sha256: checksum,
  }
}

export async function writeDailyDesktopBackup(
  db: D1Database,
  bucket: R2Bucket,
  outletId: string,
  tenantId: string,
  payload: Record<string, unknown>,
  clientId?: string,
  requestedAt?: string,
) {
  const createdAt = new Date().toISOString()
  const backupDate = createdAt.slice(0, 10)
  const safeOutlet = safeKeyPart(outletId)
  return writeCompressedSnapshotBackup(db, bucket, {
    backupId: `daily_${safeOutlet}_${backupDate}_${safeKeyPart(clientId || 'default')}`,
    objectKey: `backups/${safeKeyPart(tenantId)}/${safeOutlet}/${backupDate}/daily-${safeKeyPart(clientId || 'default')}.json.gz`,
    outletId,
    tenantId,
    payload,
    createdAt,
    backupDate,
    source: 'desktop_daily',
    clientId,
  })
}

/** Move legacy D1 snapshot-history blobs to R2 before deleting those copies. */
export async function migrateLegacySnapshotHistory(
  db: D1Database,
  bucket: R2Bucket,
  limit = 10,
) {
  const rows = await db.prepare(`
    SELECT id, outlet_id, tenant_id, payload_json, archived_at
    FROM app_snapshot_history
    ORDER BY id ASC
    LIMIT ?
  `).bind(limit).all<{
    id: number
    outlet_id: string
    tenant_id: string
    payload_json: string
    archived_at: string
  }>()
  let migrated = 0
  for (const row of rows.results) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(row.payload_json) as Record<string, unknown>
    } catch {
      console.error(JSON.stringify({ event: 'legacy_backup_invalid_json', snapshotHistoryId: row.id }))
      continue
    }
    const backupDate = row.archived_at.slice(0, 10)
    const safeOutlet = safeKeyPart(row.outlet_id)
    await writeCompressedSnapshotBackup(db, bucket, {
      backupId: `legacy_${row.id}`,
      objectKey: `backups/${safeKeyPart(row.tenant_id)}/${safeOutlet}/legacy/${row.id}-${backupDate}.json.gz`,
      outletId: row.outlet_id,
      tenantId: row.tenant_id,
      payload,
      createdAt: row.archived_at,
      backupDate,
      source: 'legacy_snapshot_history',
    })
    // Delete only after both the R2 object and its D1 metadata are durable.
    await db.prepare('DELETE FROM app_snapshot_history WHERE id = ?').bind(row.id).run()
    migrated += 1
  }
  return { migrated, remainingMayExist: rows.results.length === limit }
}

/**
 * Compact old monolithic app_snapshots only after proving every closed order
 * is already present in relational D1 and writing a pre-compaction R2 backup.
 */
export async function compactLegacyAppSnapshots(
  db: D1Database,
  bucket: R2Bucket,
  limit = 5,
  outletId?: string,
) {
  const rows = await db.prepare(`
    SELECT outlet_id, tenant_id, payload_json, updated_at
    FROM app_snapshots
    WHERE COALESCE(json_extract(payload_json, '$.snapshotKind'), '') <> 'operational'
      AND (? IS NULL OR outlet_id = ?)
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(outletId ?? null, outletId ?? null, limit).all<{
    outlet_id: string
    tenant_id: string
    payload_json: string
    updated_at: string
  }>()
  let compacted = 0
  let skipped = 0
  for (const row of rows.results) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(row.payload_json) as Record<string, unknown>
    } catch {
      skipped += 1
      continue
    }
    // Preserve the complete original before adding relational rows or compacting.
    const backupDate = row.updated_at.slice(0, 10)
    const safeOutlet = safeKeyPart(row.outlet_id)
    const snapshotHash = await sha256Hex(new TextEncoder().encode(row.payload_json))
    const backupId = `pre_compaction_${safeOutlet}_${snapshotHash.slice(0, 16)}`
    const alreadyBackedUp = await db.prepare('SELECT id FROM cloud_backups WHERE id = ?').bind(backupId).first()
    if (!alreadyBackedUp) await writeCompressedSnapshotBackup(db, bucket, {
      backupId, objectKey: `backups/${safeKeyPart(row.tenant_id)}/${safeOutlet}/migration/${snapshotHash}.json.gz`,
      outletId: row.outlet_id, tenantId: row.tenant_id, payload,
      createdAt: row.updated_at, backupDate, source: 'pre_compaction_snapshot',
    })
    const backfill = await backfillMissingSnapshotOrders(db, row.outlet_id, row.tenant_id, payload)
    if (backfill.remaining) { skipped += 1; continue }
    const orders = (Array.isArray(payload.orders) ? payload.orders : []) as Record<string, unknown>[]
    const items = (Array.isArray(payload.orderItems) ? payload.orderItems : []) as Record<string, unknown>[]
    const kots = (Array.isArray(payload.kots) ? payload.kots : []) as Record<string, unknown>[]
    const itemIds = new Set(items.map(item => item.id))
    const metadata = [
      ['orders', orders.map(order => ({ id: order.id, data: {
        recipeConsumptionStatus: order.recipeConsumptionStatus, recipeConsumedAt: order.recipeConsumedAt, recipeReversedAt: order.recipeReversedAt,
      } }))],
      ['order_items', items.map(item => ({ id: item.id, data: { isSeparateBill: item.isSeparateBill, taxPercent: item.taxPercent, taxType: item.taxType } }))],
      ['kots', kots.map(kot => ({ id: kot.id, data: { orphanedItems: (Array.isArray(kot.items) ? kot.items : []).filter(item => !itemIds.has(item.orderItemId)) } }))],
    ] as const
    await db.batch(metadata.map(([table, values]) => db.prepare(`
      WITH incoming AS (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.data') AS data FROM json_each(?))
      UPDATE ${table} SET metadata_json = (SELECT data FROM incoming WHERE incoming.id = ${table}.id)
      WHERE outlet_id = ? AND metadata_json IS NULL AND id IN (SELECT id FROM incoming)
    `).bind(JSON.stringify(values), row.outlet_id)))
    // Parent rows alone do not prove that the bill lines and payments survived.
    let missingChildren = false
    for (const [table, values] of [['order_items', items], ['kots', kots], ['payments', Array.isArray(payload.payments) ? payload.payments : []]] as const) {
      const ids = [...new Set(values.map(value => String(value.id ?? '')).filter(Boolean))]
      if (!ids.length) continue
      const result = await db.prepare(`SELECT COUNT(*) AS matched FROM ${table} WHERE outlet_id = ? AND id IN (SELECT value FROM json_each(?))`)
        .bind(row.outlet_id, JSON.stringify(ids)).first<{ matched: number }>()
      if (result?.matched !== ids.length) missingChildren = true
    }
    if (missingChildren) { skipped += 1; continue }
    const closedOrderIds = [...new Set((Array.isArray(payload.orders) ? payload.orders : [])
      .filter(isClosedOrderRecord)
      .map((order) => String((order as Record<string, unknown>).id ?? ''))
      .filter(Boolean))]
    if (closedOrderIds.length) {
      const verified = await db.prepare(`
        SELECT COUNT(*) AS matched FROM orders
        WHERE outlet_id = ? AND is_closed = 1
          AND id IN (SELECT value FROM json_each(?))
      `).bind(row.outlet_id, JSON.stringify(closedOrderIds)).first<{ matched: number }>()
      if ((verified?.matched ?? 0) !== closedOrderIds.length) {
        skipped += 1
        console.error(JSON.stringify({
          event: 'snapshot_compaction_skipped_unverified_history',
          outletId: row.outlet_id,
          expected: closedOrderIds.length,
          matched: verified?.matched ?? 0,
        }))
        continue
      }
    }
    const result = await db.prepare(`
      UPDATE app_snapshots SET payload_json = ?, updated_at = ?
      WHERE outlet_id = ? AND updated_at = ? AND payload_json = ?
    `).bind(JSON.stringify(compactOperationalSnapshot(payload)), new Date().toISOString(), row.outlet_id, row.updated_at, row.payload_json).run()
    // A sync may have arrived while R2 was being written. Never overwrite it.
    if (result.meta.changes) compacted += 1
    else skipped += 1
  }
  return { compacted, skipped, remainingMayExist: rows.results.length === limit }
}

export async function listCloudBackups(db: D1Database, outletId: string, limit = 30) {
  return db.prepare(`
    SELECT id, object_key, backup_date, source, schema_version,
      uncompressed_bytes, compressed_bytes, sha256, created_at
    FROM cloud_backups
    WHERE outlet_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(outletId, limit).all()
}
