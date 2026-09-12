import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

export const stateRouter = new Hono<{ Bindings: { DB: D1Database; SESSION_SECRET?: string } }>()

async function verifySessionToken(token: string, secret: string) {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    const payload = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))
    const encoder = new TextEncoder()
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${payload}:${secret}`))))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    if (expected !== parts[1]) return null
    const [userId] = payload.split(':')
    return userId || null
  } catch { return null }
}

async function verifySecret(storedValue: string | undefined | null, candidate: string) {
  const stored = (storedValue ?? '').trim()
  if (!stored) return false
  const encoder = new TextEncoder()
  if (stored.startsWith('sha256$')) {
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(candidate))))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    return stored === `sha256$${expected}`
  }
  return stored === candidate
}

function parseDateBoundary(value: string | undefined | null, boundary: 'start' | 'end' = 'end') {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
  }
  return boundary === 'start'
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime()
    : new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime()
}

function getAccessBlockReason(row: any) {
  const now = Date.now()
  const startsAt = parseDateBoundary(row.access_starts_at, 'start')
  if (startsAt !== null && startsAt > now) return 'Access not started'
  const renewalDate = parseDateBoundary(row.renewal_date, 'end')
  if (renewalDate !== null && renewalDate < now) return 'Renewal expired'
  const endsAt = parseDateBoundary(row.access_ends_at, 'end')
  if (endsAt !== null && endsAt < now) return 'Access expired'
  return null
}

async function authMiddleware(c: any, next: any) {
  if (c.get('user')) return next()
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  
  const authorization = c.req.header('Authorization') ?? c.req.raw?.headers?.get?.('Authorization')
  if (authorization?.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(authorization.slice(6).trim())
      const separator = decoded.indexOf(':')
      if (separator > 0) {
        const login = decoded.slice(0, separator).trim().toLowerCase()
        const password = decoded.slice(separator + 1)
        const row = await c.env.DB.prepare(
          'SELECT id, tenant_id, password_hash, pin_hash, name, email, phone, role, status, access_starts_at, access_ends_at, renewal_date FROM users WHERE lower(email) = ? OR lower(phone) = ? LIMIT 1'
        ).bind(login, login).first()
        if (row && row.status === 'active') {
          const pwOk = await verifySecret(row.password_hash, password)
          const pinOk = await verifySecret(row.pin_hash, password)
          if (pwOk || pinOk) {
            const blocked = getAccessBlockReason(row)
            if (blocked) return c.json({ error: blocked }, 403)
            c.set('user', row)
            return next()
          }
        }
      }
    } catch {}
  }
  
  const sessionToken = getCookie(c, 'rf_session')
  if (sessionToken) {
    const secret = c.env.SESSION_SECRET || 'dev-fallback-secret-change-in-production'
    const userId = await verifySessionToken(sessionToken, secret)
    if (userId) {
      const row = await c.env.DB.prepare(
        'SELECT id, tenant_id, name, email, phone, role, status, access_starts_at, access_ends_at, renewal_date FROM users WHERE id = ? LIMIT 1'
      ).bind(userId).first()
      if (row && row.status === 'active') {
        const blocked = getAccessBlockReason(row)
        if (blocked) return c.json({ error: blocked }, 403)
        c.set('user', row)
        return next()
      }
    }
  }
  
  return c.json({ error: 'Unauthenticated' }, 401)
}

stateRouter.use('*', authMiddleware)

function toCamel(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return obj
  const converted: Record<string, unknown> = typeof obj.metadata_json === 'string' ? JSON.parse(obj.metadata_json) : {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'metadata_json') continue
    const camelKey = key === 'modifiers_json'
      ? 'modifiers'
      : key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
    if ((key === 'modifiers' || key === 'modifiers_json') && typeof value === 'string') {
      try { converted[camelKey] = JSON.parse(value) } catch { converted[camelKey] = value }
    } else if (key === 'is_closed') {
      converted[camelKey] = Boolean(value)
    } else {
      converted[camelKey] = value
    }
  }
  return converted
}

stateRouter.get('/:outletId/initial-state', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const outletId = c.req.param('outletId')
  const user = (c as any).get('user')
  
  // Enforce tenant-level data isolation: non-platform users can only access their own outlet
  if (user && user.tenant_id !== 'platform') {
    const expectedOutletId = `out_${user.tenant_id}`
    if (outletId !== expectedOutletId) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }
  
  try {
    // Load base snapshot for settings/menu/tables
    const row = await db.prepare(
      'SELECT tenant_id, payload_json, updated_at FROM app_snapshots WHERE outlet_id = ?'
    ).bind(outletId).first<{ payload_json: string; updated_at: string }>()

    let baseSnapshot: any = {
      outlet: { id: outletId },
      printSettings: { printKot: true, printReceipt: true },
      menuCategories: [], menuItems: [], floors: [], tables: [], stations: [], inventoryItems: []
    }
    
    if (row && row.payload_json) {
      try {
        baseSnapshot = JSON.parse(row.payload_json)
      } catch (e) {
        console.error('Failed to parse base snapshot', e)
      }
    }

    const [
      orders, orderItems, kots, kotItems, payments
    ] = await Promise.all([
      db.prepare('SELECT * FROM orders WHERE outlet_id = ? AND is_closed = 0').bind(outletId).all(),
      db.prepare('SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.outlet_id = ? AND o.is_closed = 0').bind(outletId).all(),
      db.prepare('SELECT k.* FROM kots k JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ? AND o.is_closed = 0').bind(outletId).all(),
      db.prepare('SELECT ki.* FROM kot_items ki JOIN kots k ON ki.kot_id = k.id JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ? AND o.is_closed = 0').bind(outletId).all(),
      db.prepare('SELECT p.* FROM payments p JOIN orders o ON p.order_id = o.id WHERE o.outlet_id = ? AND o.is_closed = 0').bind(outletId).all(),
    ])

    const snapshot = {
      ...baseSnapshot,
      snapshotKind: 'operational',
      snapshotSchemaVersion: 3,
      orders: orders.results.map(toCamel),
      orderItems: orderItems.results.map(toCamel),
      kots: kots.results.map(toCamel).map((k: any) => ({
        ...k,
        items: [...kotItems.results.filter((ki: any) => ki.kot_id === k.id).map(toCamel), ...(k.orphanedItems ?? [])]
      })),
      payments: payments.results.map(toCamel)
    }

    return c.json({ exists: true, payload: snapshot, updatedAt: row?.updated_at || new Date().toISOString() })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

stateRouter.get('/:outletId/history', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  const outletId = c.req.param('outletId')
  const user = (c as any).get('user')
  if (user && user.tenant_id !== 'platform' && outletId !== `out_${user.tenant_id}`) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const cursor = Math.max(0, Number.parseInt(c.req.query('cursor') ?? '0', 10) || 0)
  const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '100', 10) || 100))
  try {
    const ordersPage = await db.prepare(`
      SELECT rowid AS history_cursor, * FROM orders
      WHERE outlet_id = ? AND is_closed = 1 AND rowid > ?
      ORDER BY rowid ASC
      LIMIT ?
    `).bind(outletId, cursor, limit + 1).all<Record<string, unknown> & { history_cursor: number; id: string }>()
    const hasMore = ordersPage.results.length > limit
    const selectedOrders = ordersPage.results.slice(0, limit)
    const orderIds = selectedOrders.map((order) => order.id)
    if (orderIds.length === 0) {
      return c.json({ ok: true, outletId, orders: [], orderItems: [], kots: [], payments: [], cursor, hasMore: false })
    }
    const orderIdsJson = JSON.stringify(orderIds)
    const [orderItems, kots, kotItems, payments] = await Promise.all([
      db.prepare('SELECT * FROM order_items WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
        .bind(outletId, orderIdsJson).all<Record<string, unknown>>(),
      db.prepare('SELECT * FROM kots WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
        .bind(outletId, orderIdsJson).all<Record<string, unknown> & { id: string }>(),
      db.prepare(`
        SELECT ki.* FROM kot_items ki
        JOIN kots k ON k.id = ki.kot_id
        WHERE ki.outlet_id = ? AND k.order_id IN (SELECT value FROM json_each(?))
      `).bind(outletId, orderIdsJson).all<Record<string, unknown> & { kot_id: string }>(),
      db.prepare('SELECT * FROM payments WHERE outlet_id = ? AND order_id IN (SELECT value FROM json_each(?))')
        .bind(outletId, orderIdsJson).all<Record<string, unknown>>(),
    ])
    const nextCursor = selectedOrders.at(-1)?.history_cursor ?? cursor
    return c.json({
      ok: true,
      outletId,
      orders: selectedOrders.map(({ history_cursor: _cursor, ...order }) => toCamel(order)),
      orderItems: orderItems.results.map(toCamel),
      kots: kots.results.map((kot) => ({
        ...toCamel(kot),
        items: [...kotItems.results.filter((item) => item.kot_id === kot.id).map(toCamel), ...((toCamel(kot)?.orphanedItems as unknown[]) ?? [])],
      })),
      payments: payments.results.map(toCamel),
      cursor: nextCursor,
      hasMore,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

export default stateRouter
