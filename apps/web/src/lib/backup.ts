import type { BillingSnapshot } from './cloudSync'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Checks the collections that make a payload a BhojPatra billing snapshot.
 * The remaining fields are normalized by the billing store after import.
 */
export function isBillingSnapshot(value: unknown): value is BillingSnapshot {
  if (!isRecord(value)) return false
  return Boolean(
    value.outlet &&
    value.printSettings &&
    Array.isArray(value.menuCategories) &&
    Array.isArray(value.menuItems) &&
    Array.isArray(value.floors) &&
    Array.isArray(value.tables) &&
    Array.isArray(value.stations) &&
    Array.isArray(value.inventoryItems) &&
    Array.isArray(value.orders) &&
    Array.isArray(value.orderItems) &&
    Array.isArray(value.kots) &&
    Array.isArray(value.payments) &&
    Array.isArray(value.auditLogs)
  )
}

/**
 * Gets a billing snapshot from any supported backup envelope.
 *
 * The web app exports `{ snapshot: BillingSnapshot }`. The Workers admin
 * download exports `{ customer, snapshot: { tenantId, updatedAt, payload } }`.
 * Both are intentionally supported so a cloud backup can be restored from
 * the Settings screen without editing the downloaded file.
 */
export function extractBillingSnapshot(value: unknown): BillingSnapshot | null {
  const visited = new Set<unknown>()

  const visit = (candidate: unknown, depth: number): BillingSnapshot | null => {
    if (depth > 5 || visited.has(candidate)) return null
    if (isBillingSnapshot(candidate)) return candidate

    if (typeof candidate === 'string') {
      visited.add(candidate)
      try {
        return visit(JSON.parse(candidate) as unknown, depth + 1)
      } catch {
        return null
      }
    }

    if (!isRecord(candidate)) return null
    visited.add(candidate)

    // Supports the local export, Workers admin download, direct cloud state,
    // and older exports that added one more data/state/backup envelope.
    for (const key of ['snapshot', 'payload', 'data', 'state', 'backup']) {
      const nested = visit(candidate[key], depth + 1)
      if (nested) return nested
    }
    return null
  }

  return visit(value, 0)
}
