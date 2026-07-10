import { Hono } from 'hono'
import { z } from 'zod'
import { getCookie } from 'hono/cookie'

export const ordersRouter = new Hono<{ Bindings: { DB: any; REALTIME_HUB: any; SESSION_SECRET?: string } }>()

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

ordersRouter.use('*', authMiddleware)

const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  menuItemId: z.string(),
  nameSnapshot: z.string(),
  itemType: z.enum(['veg', 'nonveg', 'egg', 'other']),
  quantity: z.number(),
  unitPricePaise: z.number(),
  taxPaise: z.number(),
  discountPaise: z.number(),
  totalPaise: z.number(),
  stationId: z.string().optional(),
  status: z.enum(['draft', 'kot_sent', 'preparing', 'ready', 'served', 'cancelled']),
  note: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  createdAt: z.string()
})

const orderSchema = z.object({
  id: z.string(),
  outletId: z.string(),
  orderNo: z.string(),
  businessDate: z.string(),
  type: z.enum(['dine_in', 'takeaway', 'delivery', 'online_manual']),
  status: z.enum(['draft', 'running', 'kot_sent', 'preparing', 'ready', 'billed', 'paid', 'cancelled', 'void']),
  tableId: z.string().optional(),
  tableName: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  captainUserId: z.string().optional(),
  captainName: z.string().optional(),
  cashierUserId: z.string().optional(),
  cashierName: z.string().optional(),
  subtotalPaise: z.number(),
  discountPaise: z.number(),
  taxPaise: z.number(),
  chargePaise: z.number(),
  totalPaise: z.number(),
  paidPaise: z.number(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
  cancellationReason: z.string().optional(),
  cancelledAt: z.string().optional(),
  items: z.array(orderItemSchema).optional()
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

ordersRouter.post('/', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const body = orderSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid order', details: body.error.errors }, 400)
  
  const order = body.data
  const tenantId = tenantIdFromOutlet(order.outletId)
  
  try {
    await db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(order.id).run()
    await db.prepare(`
      INSERT INTO orders (
        id, tenant_id, outlet_id, order_no, business_date, type, status, table_id, table_name,
        customer_id, customer_name, customer_phone, captain_user_id, captain_name,
        cashier_user_id, cashier_name, subtotal_paise, discount_paise, tax_paise,
        charge_paise, total_paise, paid_paise, payment_status, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        outlet_id = excluded.outlet_id,
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
        updated_at = excluded.updated_at
    `).bind(
      order.id, tenantId, order.outletId, order.orderNo, order.businessDate, order.type, order.status, order.tableId || null, order.tableName || null,
      order.customerId || null, order.customerName || null, order.customerPhone || null, order.captainUserId || null, order.captainName || null,
      order.cashierUserId || null, order.cashierName || null, order.subtotalPaise, order.discountPaise, order.taxPaise,
      order.chargePaise, order.totalPaise, order.paidPaise, order.paymentStatus, order.notes || null,
      order.createdAt, order.updatedAt
    ).run()

    if (order.items && order.items.length > 0) {
      const stmts = order.items.map(item => db.prepare(`
        INSERT INTO order_items (
          id, tenant_id, outlet_id, order_id, menu_item_id, name_snapshot, item_type, quantity, unit_price_paise,
          tax_paise, discount_paise, total_paise, station_id, status, note, modifiers_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id, tenantId, order.outletId, item.orderId, item.menuItemId, item.nameSnapshot, item.itemType, item.quantity, item.unitPricePaise,
        item.taxPaise, item.discountPaise, item.totalPaise, item.stationId || null, item.status, item.note || null,
        item.modifiers ? JSON.stringify(item.modifiers) : null, item.createdAt, order.updatedAt
      ))
      await db.batch(stmts)
    }

    c.executionCtx.waitUntil(broadcast(c.env, order.outletId, 'ORDER_CREATED', order))
    return c.json({ ok: true, order })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

ordersRouter.put('/:id', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'DB not configured' }, 500)
  
  const body = orderSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid order' }, 400)
  
  const order = body.data
  const tenantId = tenantIdFromOutlet(order.outletId)
  
  try {
    await db.prepare(`
      UPDATE orders SET
        status = ?, table_id = ?, table_name = ?, customer_id = ?, customer_name = ?, customer_phone = ?,
        captain_user_id = ?, captain_name = ?, cashier_user_id = ?, cashier_name = ?,
        subtotal_paise = ?, discount_paise = ?, tax_paise = ?, charge_paise = ?, total_paise = ?,
        paid_paise = ?, payment_status = ?, notes = ?, updated_at = ?, closed_at = ?,
        cancellation_reason = ?, cancelled_at = ?
      WHERE id = ? AND outlet_id = ?
    `).bind(
      order.status, order.tableId || null, order.tableName || null, order.customerId || null, order.customerName || null, order.customerPhone || null,
      order.captainUserId || null, order.captainName || null, order.cashierUserId || null, order.cashierName || null,
      order.subtotalPaise, order.discountPaise, order.taxPaise, order.chargePaise, order.totalPaise,
      order.paidPaise, order.paymentStatus, order.notes || null, order.updatedAt, order.closedAt || null,
      order.cancellationReason || null, order.cancelledAt || null,
      order.id, order.outletId
    ).run()

    if (order.items) {
      await db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(order.id).run()
      if (order.items.length > 0) {
        const stmts = order.items.map(item => db.prepare(`
          INSERT INTO order_items (
            id, tenant_id, outlet_id, order_id, menu_item_id, name_snapshot, item_type, quantity, unit_price_paise,
            tax_paise, discount_paise, total_paise, station_id, status, note, modifiers_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          item.id, tenantId, order.outletId, item.orderId, item.menuItemId, item.nameSnapshot, item.itemType, item.quantity, item.unitPricePaise,
          item.taxPaise, item.discountPaise, item.totalPaise, item.stationId || null, item.status, item.note || null,
          item.modifiers ? JSON.stringify(item.modifiers) : null, item.createdAt, order.updatedAt
        ))
        await db.batch(stmts)
      }
    }

    c.executionCtx.waitUntil(broadcast(c.env, order.outletId, 'ORDER_UPDATED', order))
    return c.json({ ok: true, order })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'DB error' }, 500)
  }
})

export default ordersRouter
