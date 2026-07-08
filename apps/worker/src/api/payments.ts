import { Hono } from 'hono'
import { z } from 'zod'
import { getCookie } from 'hono/cookie'

export const paymentsRouter = new Hono<{ Bindings: { DB: any; REALTIME_HUB: any; SESSION_SECRET?: string } }>()

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
          'SELECT id, tenant_id, password_hash, pin_hash, name, email, phone, role, status, access_starts_at, access_ends_at FROM users WHERE lower(email) = ? OR lower(phone) = ? LIMIT 1'
        ).bind(login, login).first()
        if (row && row.status === 'active') {
          const pwOk = await verifySecret(row.password_hash, password)
          const pinOk = await verifySecret(row.pin_hash, password)
          if (pwOk || pinOk) {
            const now = Date.now()
            if (row.access_starts_at && new Date(row.access_starts_at).getTime() > now) return c.json({ error: 'Access not started' }, 403)
            if (row.access_ends_at && new Date(row.access_ends_at).getTime() < now) return c.json({ error: 'Access expired' }, 403)
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
        'SELECT id, tenant_id, name, email, phone, role, status FROM users WHERE id = ? LIMIT 1'
      ).bind(userId).first()
      if (row && row.status === 'active') {
        c.set('user', row)
        return next()
      }
    }
  }
  
  return c.json({ error: 'Unauthenticated' }, 401)
}

paymentsRouter.use('*', authMiddleware)

const paymentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  method: z.enum(['cash', 'upi', 'card', 'wallet', 'due', 'account', 'paytm', 'cheque', 'aggregator', 'complementary']),
  amountPaise: z.number(),
  referenceNo: z.string().optional(),
  status: z.enum(['success', 'failed', 'refunded']),
  collectedByUserId: z.string(),
  createdAt: z.string(),
  statusReason: z.string().optional()
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

paymentsRouter.post('/:outletId', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const outletId = c.req.param('outletId')
  const body = paymentSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid Payment' }, 400)
  
  const payment = body.data
  const tenantId = tenantIdFromOutlet(outletId)
  
  try {
    await db.prepare(`
      INSERT INTO payments (
        id, tenant_id, outlet_id, order_id, method, amount_paise, reference_no, status,
        collected_by_user_id, created_at, status_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        outlet_id = excluded.outlet_id,
        method = excluded.method,
        amount_paise = excluded.amount_paise,
        reference_no = excluded.reference_no,
        status = excluded.status,
        collected_by_user_id = excluded.collected_by_user_id,
        status_reason = excluded.status_reason
    `).bind(
      payment.id, tenantId, outletId, payment.orderId, payment.method, payment.amountPaise, payment.referenceNo || null, payment.status,
      payment.collectedByUserId, payment.createdAt, payment.statusReason || null
    ).run()

    c.executionCtx.waitUntil(broadcast(c.env, outletId, 'PAYMENT_ADDED', payment))
    return c.json({ ok: true, payment })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

export default paymentsRouter
