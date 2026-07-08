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

stateRouter.use('*', authMiddleware)

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
      db.prepare('SELECT * FROM orders WHERE outlet_id = ?').bind(outletId).all(),
      db.prepare('SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.outlet_id = ?').bind(outletId).all(),
      db.prepare('SELECT k.* FROM kots k JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ?').bind(outletId).all(),
      db.prepare('SELECT ki.* FROM kot_items ki JOIN kots k ON ki.kot_id = k.id JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ?').bind(outletId).all(),
      db.prepare('SELECT p.* FROM payments p JOIN orders o ON p.order_id = o.id WHERE o.outlet_id = ?').bind(outletId).all(),
    ])

    // Convert snake_case DB rows back to camelCase frontend objects
    const toCamel = (obj: any) => {
      if (!obj) return obj
      const newObj: any = {}
      for (const key in obj) {
        const camelKey = key === 'modifiers_json'
          ? 'modifiers'
          : key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
        if ((key === 'modifiers' || key === 'modifiers_json') && obj[key]) {
          try { newObj[camelKey] = JSON.parse(obj[key]) } catch { newObj[camelKey] = obj[key] }
        } else {
          newObj[camelKey] = obj[key]
        }
      }
      return newObj
    }

    const snapshot = {
      ...baseSnapshot,
      orders: orders.results.map(toCamel),
      orderItems: orderItems.results.map(toCamel),
      kots: kots.results.map(toCamel).map((k: any) => ({
        ...k,
        items: kotItems.results.filter((ki: any) => ki.kot_id === k.id).map(toCamel)
      })),
      payments: payments.results.map(toCamel)
    }

    return c.json({ exists: true, payload: snapshot, updatedAt: row?.updated_at || new Date().toISOString() })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

export default stateRouter
