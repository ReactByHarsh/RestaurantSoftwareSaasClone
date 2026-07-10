import { Hono } from 'hono'
import { z } from 'zod'
import { getCookie } from 'hono/cookie'

export const kotsRouter = new Hono<{ Bindings: { DB: any; REALTIME_HUB: any; SESSION_SECRET?: string } }>()

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

kotsRouter.use('*', authMiddleware)

const kotItemSchema = z.object({
  id: z.string(),
  kotId: z.string(),
  orderItemId: z.string(),
  name: z.string(),
  quantity: z.number(),
  note: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  status: z.enum(['new', 'preparing', 'ready', 'served', 'cancelled']),
  itemType: z.enum(['veg', 'nonveg', 'egg', 'other'])
})

const kotSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNo: z.string(),
  kotNo: z.string(),
  tableName: z.string().optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery', 'online_manual']),
  stationId: z.string().optional(),
  status: z.enum(['new', 'preparing', 'ready', 'served', 'cancelled']),
  captainName: z.string().optional(),
  createdByUserId: z.string(),
  createdAt: z.string(),
  cancellationReason: z.string().optional(),
  cancelledAt: z.string().optional(),
  items: z.array(kotItemSchema)
})

async function broadcast(env: any, outletId: string, eventType: string, payload: any) {
  if (!env.REALTIME_HUB) return
  try {
    const stub = env.REALTIME_HUB.get(env.REALTIME_HUB.idFromName(outletId))
    await stub.fetch('https://realtime.internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: eventType, payload })
    })
  } catch (e) {
    console.error('Broadcast error:', e)
  }
}

function tenantIdFromOutlet(outletId: string) {
  return outletId.startsWith('out_') ? outletId.slice(4) : outletId
}

kotsRouter.post('/:outletId', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const outletId = c.req.param('outletId')
  const body = kotSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid KOT' }, 400)
  
  const kot = body.data
  const tenantId = tenantIdFromOutlet(outletId)
  const updatedAt = new Date().toISOString()
  
  try {
    await db.prepare('DELETE FROM kot_items WHERE kot_id = ?').bind(kot.id).run()
    await db.prepare(`
      INSERT INTO kots (
        id, tenant_id, outlet_id, order_id, order_no, kot_no, table_name, order_type, station_id,
        status, captain_name, created_by_user_id, created_at,
        updated_at, cancellation_reason, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        outlet_id = excluded.outlet_id,
        order_no = excluded.order_no,
        table_name = excluded.table_name,
        order_type = excluded.order_type,
        station_id = excluded.station_id,
        status = excluded.status,
        captain_name = excluded.captain_name,
        updated_at = excluded.updated_at,
        cancellation_reason = excluded.cancellation_reason,
        cancelled_at = excluded.cancelled_at
    `).bind(
      kot.id, tenantId, outletId, kot.orderId, kot.orderNo, kot.kotNo, kot.tableName || null, kot.orderType, kot.stationId || null,
      kot.status, kot.captainName || null, kot.createdByUserId, kot.createdAt,
      updatedAt, kot.cancellationReason || null, kot.cancelledAt || null
    ).run()

    if (kot.items.length > 0) {
      const stmts = kot.items.map(item => db.prepare(`
        INSERT INTO kot_items (
          id, tenant_id, outlet_id, kot_id, order_item_id, name, quantity, note, modifiers, status, item_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id, tenantId, outletId, item.kotId, item.orderItemId, item.name, item.quantity, item.note || null,
        item.modifiers ? JSON.stringify(item.modifiers) : null, item.status, item.itemType, kot.createdAt, updatedAt
      ))
      await db.batch(stmts)
    }

    c.executionCtx.waitUntil(broadcast(c.env, outletId, 'KOT_ADDED', kot))
    return c.json({ ok: true, kot })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

kotsRouter.put('/:outletId/:id', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const outletId = c.req.param('outletId')
  const body = kotSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid KOT' }, 400)
  
  const kot = body.data
  const tenantId = tenantIdFromOutlet(outletId)
  const updatedAt = new Date().toISOString()
  
  try {
    await db.prepare(`
      UPDATE kots SET
        status = ?, updated_at = ?, cancellation_reason = ?, cancelled_at = ?
      WHERE id = ? AND outlet_id = ?
    `).bind(
      kot.status, updatedAt, kot.cancellationReason || null, kot.cancelledAt || null, kot.id, outletId
    ).run()

    await db.prepare('DELETE FROM kot_items WHERE kot_id = ?').bind(kot.id).run()
    if (kot.items.length > 0) {
      const stmts = kot.items.map(item => db.prepare(`
        INSERT INTO kot_items (
          id, tenant_id, outlet_id, kot_id, order_item_id, name, quantity, note, modifiers, status, item_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id, tenantId, outletId, item.kotId, item.orderItemId, item.name, item.quantity, item.note || null,
        item.modifiers ? JSON.stringify(item.modifiers) : null, item.status, item.itemType, kot.createdAt, updatedAt
      ))
      await db.batch(stmts)
    }

    c.executionCtx.waitUntil(broadcast(c.env, outletId, 'KOT_UPDATED', kot))
    return c.json({ ok: true, kot })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

export default kotsRouter
