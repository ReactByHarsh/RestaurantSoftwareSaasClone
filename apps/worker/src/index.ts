import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'

import ordersRouter from './api/orders'
import kotsRouter from './api/kots'
import paymentsRouter from './api/payments'
import stateRouter from './api/state'
import {
  applyLegacyOrderMutation,
  applySyncPush,
  compactOperationalSnapshot,
  pullSyncChanges,
  runDailySyncMaintenance,
  syncPushSchema,
} from './sync'
import {
  compactLegacyAppSnapshots,
  dailyBackupSchema,
  listCloudBackups,
  migrateLegacySnapshotHistory,
  writeDailyDesktopBackup,
} from './backups'

type Bindings = {
  DB?: D1Database
  CACHE?: KVNamespace
  R2?: R2Bucket
  SESSION_SECRET?: string
  REALTIME_HUB?: DurableObjectNamespace
  RESEND_API_KEY?: string
  AGENTMAIL_API_KEY?: string
  AGENTMAIL_INBOX_ID?: string
  ALERT_FROM_EMAIL?: string
  ALERT_TO_EMAIL?: string
  ALERT_REPLY_TO_EMAIL?: string
  MAINTENANCE_TOKEN?: string
}

type Role = 'owner' | 'admin' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'inventory' | 'viewer'

type User = {
  id: string
  tenantId: string
  name: string
  email: string
  phone: string
  role: Role
  status: 'active' | 'inactive' | 'halted'
  password: string
  pin: string
  accessStartsAt?: string
  accessEndsAt?: string
  restaurantName?: string
  paymentReceived?: boolean
  renewalPaymentReceived?: boolean
  paymentNote?: string
  paymentAmount?: number
  paymentDate?: string
  renewalAmount?: number
  renewalDate?: string
  createdAt?: string
}

type SnapshotPayload = Record<string, unknown>
type SnapshotRecord = {
  tenantId: string
  payload: SnapshotPayload
  updatedAt: string
}

const SUPPORT_PHONE = '9028414428'

function getDynamicOutlet(user: User) {
  return {
    id: `out_${user.tenantId}`,
    tenantId: user.tenantId,
    name: user.restaurantName || 'My Restaurant',
    code: user.tenantId.slice(0, 3).toUpperCase(),
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    status: 'active' as const,
  }
}

const loginSchema = z.object({
  emailOrPhone: z.string().min(1),
  password: z.string().min(1),
})

const optionalTextField = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.string().optional())

const optionalAmountField = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}, z.number().min(0).optional())

const staffBaseObject = z.object({
  id: z.string().optional(),
  tenantId: z.string().optional(),
  name: z.string().min(1),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.union([z.string().min(4), z.literal('')]).optional(),
  role: z.enum(['owner', 'admin', 'manager', 'cashier', 'captain', 'kitchen', 'inventory', 'viewer']),
  password: z.string().optional(),
  pin: z.string().optional(),
  status: z.enum(['active', 'inactive', 'halted']).optional(),
  accessStartsAt: optionalTextField,
  accessEndsAt: optionalTextField,
  restaurantName: optionalTextField,
  paymentReceived: z.boolean().optional(),
  renewalPaymentReceived: z.boolean().optional(),
  paymentNote: optionalTextField,
  paymentAmount: optionalAmountField,
  paymentDate: optionalTextField,
  renewalAmount: optionalAmountField,
  renewalDate: optionalTextField,
  createdAt: optionalTextField,
})

const staffSchema = staffBaseObject.extend({
  password: z.string().min(1),
}).refine(data => {
  const hasEmail = data.email && data.email.trim() !== ''
  const hasPhone = data.phone && data.phone.trim() !== ''
  return hasEmail || hasPhone
}, {
  message: "Either email or phone is required",
  path: ["email"]
})

const staffUpdateSchema = staffBaseObject.refine(data => {
  const hasEmail = data.email && data.email.trim() !== ''
  const hasPhone = data.phone && data.phone.trim() !== ''
  return hasEmail || hasPhone
}, {
  message: "Either email or phone is required",
  path: ["email"]
})

const appSnapshotSchema = z.object({
  tenantId: z.string().min(1),
  payload: z.record(z.unknown()),
  clientId: z.string().optional(),
  messageId: z.string().optional(),
  expectedUpdatedAt: z.string().optional(),
})

const customerAccountSchema = staffSchema.and(z.object({
  restaurantName: z.string().min(1),
}))

function htmlResponse(html: string) {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function cloudAdminHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BhojPatra Cloud Admin</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#64748b; --brand:#f15a24; --brand-dark:#c2410c; --line:#e2e8f0; --soft:#f8fafc; --ok:#059669; --bad:#dc2626; --warn:#d97706; --blue:#2563eb; --c1:#f0f9ff; --c2:#fef2f2; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f1f5f9; color:var(--ink); min-height:100vh; }
    .login-page { min-height:100vh; display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); }
    .login-card { background:#fff; border-radius:24px; box-shadow:0 48px 120px rgba(0,0,0,.35); width:min(420px, calc(100% - 32px)); padding:40px 32px; }
    .login-card .logo { text-align:center; margin-bottom:8px; }
    .login-card .logo span { background:var(--brand); color:#fff; font-size:28px; font-weight:900; padding:4px 16px; border-radius:12px; letter-spacing:-.03em; }
    .login-card h2 { margin:12px 0 4px; font-size:22px; text-align:center; letter-spacing:-.02em; }
    .login-card p { color:var(--muted); text-align:center; font-size:14px; margin:0 0 24px; }
    .field { margin-bottom:16px; } .field label { display:block; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#475569; margin-bottom:6px; }
    .field input { width:100%; border:2px solid var(--line); border-radius:12px; padding:12px 14px; font:inherit; font-size:15px; outline:none; transition:border-color .16s; }
    .field input:focus { border-color:var(--brand); box-shadow:0 0 0 4px rgba(241,90,36,.12); }
    .login-err { margin-top:12px; padding:10px 14px; border-radius:12px; font-size:13px; font-weight:700; display:none; }
    .login-err.show { display:block; } .login-err.err { color:var(--bad); background:#fef2f2; }
    button { border:0; border-radius:12px; padding:11px 16px; font:inherit; font-weight:800; font-size:13px; cursor:pointer; white-space:nowrap; transition:.14s transform,.14s opacity; letter-spacing:.01em; }
    button:active { transform:scale(.97); } button:disabled { opacity:.5; cursor:not-allowed; }
    .btn-primary { background:var(--brand); color:#fff; width:100%; padding:14px; font-size:15px; }
    .btn-primary:hover { background:var(--brand-dark); }
    .btn-sm { padding:7px 12px; font-size:12px; border-radius:8px; }
    .btn-ghost { background:var(--soft); color:var(--ink); border:1px solid var(--line); }
    .btn-ghost:hover { background:#e2e8f0; }
    .btn-danger { background:var(--bad); color:#fff; } .btn-danger:hover { background:#b91c1c; }
    .btn-warn { background:var(--warn); color:#fff; } .btn-warn:hover { background:#b45309; }
    .btn-blue { background:var(--blue); color:#fff; } .btn-blue:hover { background:#1d4ed8; }
    .btn-green { background:var(--ok); color:#fff; } .btn-green:hover { background:#047857; }
    .btn-dark { background:#0f172a; color:#fff; }
    .admin-body { display:none; }
    .admin-body.active { display:block; }
    .topbar { background:#fff; border-bottom:1px solid var(--line); padding:0 24px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:10; }
    .topbar h1 { font-size:18px; letter-spacing:-.02em; margin:0; display:flex; align-items:center; gap:8px; }
    .topbar h1 span { color:var(--brand); }
    .topbar-actions { display:flex; gap:8px; align-items:center; }
    .main-content { padding:20px 24px 40px; max-width:1400px; margin:0 auto; }
    .stats-row { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:14px; margin-bottom:20px; }
    .stat-card { background:#fff; border-radius:14px; padding:16px; border:1px solid var(--line); }
    .stat-card .stat-val { font-size:28px; font-weight:900; letter-spacing:-.03em; }
    .stat-card .stat-lbl { font-size:12px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-top:2px; }
    .panel { background:#fff; border-radius:16px; border:1px solid var(--line); margin-bottom:16px; }
    .panel-header { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; }
    .panel-header h3 { margin:0; font-size:15px; letter-spacing:-.01em; }
    .panel-body { padding:16px 20px; }
    .form-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; }
    .form-row { display:flex; flex-direction:column; }
    .form-row label { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin-bottom:4px; }
    .form-row input, .form-row select, .form-row textarea { border:1.5px solid var(--line); border-radius:10px; padding:9px 11px; font:inherit; font-size:14px; outline:none; width:100%; }
    .form-row input:focus, .form-row select:focus, .form-row textarea:focus { border-color:var(--brand); box-shadow:0 0 0 3px rgba(241,90,36,.1); }
    .date-tools { margin-top:16px; border:1px solid var(--line); background:linear-gradient(180deg, #fff7ed 0%, #fff 100%); border-radius:16px; padding:14px; }
    .date-tools h4 { margin:0; font-size:13px; letter-spacing:-.01em; }
    .date-tools p { margin:4px 0 0; font-size:12px; color:var(--muted); }
    .date-chip-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .date-chip { border:1px solid #fed7aa; background:#fff; color:#9a3412; border-radius:999px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; }
    .date-chip:hover { background:#fff7ed; }
    .date-helper-summary { margin-top:12px; border-radius:12px; background:#fff; border:1px solid #fdba74; color:#9a3412; padding:10px 12px; font-size:12px; font-weight:700; }
    .chk-row { display:flex; align-items:center; gap:8px; padding:8px 0; } .chk-row label { text-transform:none; letter-spacing:0; font-size:13px; color:var(--ink); font-weight:700; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; padding:10px 12px; border-bottom:2px solid var(--line); text-align:left; background:var(--soft); position:sticky; top:0; }
    td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
    tr:hover td { background:#f8fafc; }
    .pill { display:inline-flex; border-radius:99px; padding:3px 9px; font-size:11px; font-weight:800; letter-spacing:.03em; }
    .pill-active { background:#dcfce7; color:#166534; }
    .pill-inactive { background:#fee2e2; color:#991b1b; }
    .pill-halted { background:#fef3c7; color:#92400e; }
    .pill-paid { background:#dbeafe; color:#1e40af; }
    .actions-cell { display:flex; gap:6px; flex-wrap:wrap; }
    .dropdown { position:relative; display:inline-block; }
    .dropdown-menu { display:none; position:absolute; right:0; top:100%; background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 16px 40px rgba(0,0,0,.15); z-index:20; min-width:180px; padding:6px; }
    .dropdown-menu.show { display:block; }
    .dropdown-menu button { display:block; width:100%; text-align:left; background:none; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700; }
    .dropdown-menu button:hover { background:var(--soft); }
    .dropdown-menu .danger-item { color:var(--bad); }
    .msg { margin:8px 0; padding:10px 14px; border-radius:12px; font-size:13px; font-weight:800; display:none; }
    .msg.show { display:block; }
    .msg-ok { color:#065f46; background:#d1fae5; border:1px solid #a7f3d0; }
    .msg-err { color:#991b1b; background:#fee2e2; border:1px solid #fecaca; }
    .msg-warn { color:#92400e; background:#fef3c7; border:1px solid #fde68a; }
    .creds-box { background:#0f172a; color:#e2e8f0; border-radius:14px; padding:16px 20px; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; line-height:1.7; white-space:pre-wrap; margin-top:12px; display:none; }
    .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:50; align-items:center; justify-content:center; }
    .modal-overlay.show { display:flex; }
    .modal { background:#fff; border-radius:18px; padding:28px; width:min(480px, calc(100% - 32px)); box-shadow:0 32px 80px rgba(0,0,0,.3); }
    .modal h3 { margin:0 0 12px; font-size:17px; }
    .modal .actions { display:flex; gap:8px; margin-top:20px; justify-content:flex-end; }
    @media (max-width: 768px) { .topbar { padding:0 14px; } .main-content { padding:12px 14px 30px; } .form-grid { grid-template-columns:1fr; } .stats-row { grid-template-columns:repeat(2, 1fr); } }
  </style>
</head>
<body>
<div class="login-page" id="loginPage">
  <div class="login-card">
    <div class="logo"><span>BhojPatra</span></div>
    <h2>Cloud Admin</h2>
    <p>Sign in to manage customer SaaS accounts</p>
    <div class="field"><label>Email or phone</label><input id="loginEmail" value="bss@gmail.com" autocomplete="username" /></div>
    <div class="field"><label>Password</label><input id="loginPass" type="password" autocomplete="current-password" /></div>
    <button class="btn-primary" id="loginBtn">Sign In</button>
    <div class="login-err" id="loginErr"></div>
  </div>
</div>

<div class="admin-body" id="adminBody">
  <div class="topbar">
    <h1><span>BhojPatra</span> Cloud Admin</h1>
    <div class="topbar-actions">
      <button class="btn-sm btn-blue" id="btnSendDigest">Send Renewal Alerts</button>
      <button class="btn-sm btn-ghost" id="btnTestEmail">Test Email</button>
      <button class="btn-sm btn-dark" id="btnLogout">Logout</button>
    </div>
  </div>
  <div class="main-content">
    <div class="stats-row" id="statsRow"></div>
    <div class="msg" id="topMsg"></div>

    <div class="panel" id="formPanel">
      <div class="panel-header">
        <h3 id="formTitle">Create Customer Account</h3>
        <div style="display:flex;gap:6px">
          <button class="btn-sm btn-ghost" id="btnCancelForm" style="display:none">Cancel</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="form-row"><label>Restaurant Name *</label><input id="fRestaurantName" placeholder="Grand Spice Kitchen" /></div>
          <div class="form-row"><label>Owner/Admin Name *</label><input id="fName" placeholder="Restaurant Owner" /></div>
          <div class="form-row"><label>Email Login</label><input id="fEmail" type="email" placeholder="owner@restaurant.com" /></div>
          <div class="form-row"><label>Phone Login</label><input id="fPhone" placeholder="9876543210" /></div>
          <div class="form-row"><label>Password <span id="pwHint">*</span></label><input id="fPassword" placeholder="Create password" /></div>
          <div class="form-row"><label>PIN</label><input id="fPin" placeholder="0000" maxlength="6" /></div>
          <div class="form-row"><label>Access Starts</label><input id="fAccessStartsAt" type="date" /></div>
          <div class="form-row"><label>Access Ends</label><input id="fAccessEndsAt" type="date" /></div>
          <div class="form-row"><label>Payment Date</label><input id="fPaymentDate" type="date" /></div>
          <div class="form-row"><label>Payment Amount (Rs)</label><input id="fPaymentAmount" type="number" min="0" step="0.01" placeholder="0.00" /></div>
          <div class="form-row"><label>Renewal Date</label><input id="fRenewalDate" type="date" /></div>
          <div class="form-row"><label>Renewal Amount (Rs)</label><input id="fRenewalAmount" type="number" min="0" step="0.01" placeholder="0.00" /></div>
          <div class="form-row"><label>Payment Note</label><input id="fPaymentNote" placeholder="Optional note" /></div>
        </div>
        <div class="date-tools">
          <h4>Quick Renewal Date Setup</h4>
          <p>Choose a cycle and BhojPatra will fill Access Ends and Renewal Date together.</p>
          <div class="date-chip-row">
            <button type="button" class="date-chip" data-cycle-base="today">Start Today</button>
            <button type="button" class="date-chip" data-cycle-months="1">+1 Month</button>
            <button type="button" class="date-chip" data-cycle-months="3">+3 Months</button>
            <button type="button" class="date-chip" data-cycle-months="6">+6 Months</button>
            <button type="button" class="date-chip" data-cycle-months="12">+12 Months</button>
          </div>
          <div class="date-helper-summary" id="dateHelperSummary">Pick a quick cycle or enter the dates manually.</div>
        </div>
        <div style="display:flex;gap:20px;margin-top:14px;flex-wrap:wrap">
          <div class="chk-row"><input type="checkbox" id="fPaymentReceived" checked /><label>Payment Received</label></div>
          <div class="chk-row"><input type="checkbox" id="fRenewalPaymentReceived" checked /><label>Renewal Payment Received</label></div>
        </div>
        <div class="actions-cell" style="margin-top:16px">
          <button class="btn-primary" id="btnSubmitCustomer">Create Customer Account</button>
          <button class="btn-sm btn-ghost" id="btnClearForm">Clear</button>
        </div>
        <div class="msg" id="formMsg"></div>
        <div class="creds-box" id="credsBox"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Customer Accounts</h3>
        <div style="display:flex;gap:6px">
          <button class="btn-sm btn-ghost" id="btnRefresh">Refresh</button>
        </div>
      </div>
      <div class="panel-body" style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Restaurant</th><th>Login</th><th>Status</th><th>Access</th><th>Payment / Renewal</th><th>Cloud Data</th><th style="min-width:200px">Actions</th>
          </tr></thead>
          <tbody id="staffRows"><tr><td colspan="7" style="color:var(--muted);text-align:center;padding:24px">Enter credentials to load customers.</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modalContent"></div>
</div>

<script src="/admin-client.js" defer></script>
</body>
</html>`
}

function getSnapshotDataScore(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return 0
  const count = (key: string, weight: number): number => {
    const value = payload[key]
    return Array.isArray(value) ? value.length * weight : 0
  }
  const savedCartScore = typeof payload.savedCarts === 'object' && payload.savedCarts
    ? Object.values(payload.savedCarts as Record<string, unknown>)
        .reduce<number>((sum, cart) => sum + (Array.isArray(cart) ? cart.length * 7 : 0), 0)
    : 0
  return [
    count('menuItems', 10),
    count('orders', 8),
    count('orderItems', 6),
    count('payments', 6),
    count('kots', 5),
    savedCartScore,
    count('tables', 3),
    count('floors', 2),
    count('menuCategories', 2),
    count('inventoryItems', 2),
  ].reduce((score, value) => score + value, 0)
}

function wouldEraseCoreRestaurantData(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
) {
  if (!existing) return false
  return ['tables', 'floors', 'menuItems', 'menuCategories'].some((key) => {
    const current = existing[key]
    const next = incoming[key]
    return Array.isArray(current) && current.length > 0 && (!Array.isArray(next) || next.length === 0)
  })
}

function preservesRoleRestrictedCollections(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
) {
  if (!existing) return true
  const protectedKeys = [
    'outlet', 'printSettings', 'cloudSync', 'appUpdate',
    'menuCategories', 'menuItems', 'floors', 'stations',
    'inventoryItems', 'purchaseEntries', 'payments',
  ]
  return protectedKeys.every((key) => JSON.stringify(existing[key] ?? null) === JSON.stringify(incoming[key] ?? null))
}

type SnapshotCounts = {
  menuItems: number
  menuCategories: number
  orders: number
  orderItems: number
  payments: number
  kots: number
  tables: number
  floors: number
  inventoryItems: number
  savedCarts: number
  score: number
  updatedAt?: string
}

function countSnapshotData(payload: Record<string, unknown> | null | undefined, updatedAt?: string): SnapshotCounts {
  const arrayCount = (key: string) => {
    const value = payload?.[key]
    return Array.isArray(value) ? value.length : 0
  }
  const savedCarts = typeof payload?.savedCarts === 'object' && payload.savedCarts
    ? Object.values(payload.savedCarts as Record<string, unknown>)
        .reduce<number>((sum, cart) => sum + (Array.isArray(cart) ? cart.length : 0), 0)
    : 0
  return {
    menuItems: arrayCount('menuItems'),
    menuCategories: arrayCount('menuCategories'),
    orders: arrayCount('orders'),
    orderItems: arrayCount('orderItems'),
    payments: arrayCount('payments'),
    kots: arrayCount('kots'),
    tables: arrayCount('tables'),
    floors: arrayCount('floors'),
    inventoryItems: arrayCount('inventoryItems'),
    savedCarts,
    score: getSnapshotDataScore(payload),
    updatedAt,
  }
}

async function readSnapshotRow(db: D1Database, outletId: string) {
  const row = await db.prepare(
    'SELECT tenant_id, payload_json, updated_at FROM app_snapshots WHERE outlet_id = ?'
  ).bind(outletId).first<{ tenant_id: string; payload_json: string; updated_at: string }>()
  if (!row) return null
  try {
    return {
      tenantId: row.tenant_id,
      updatedAt: row.updated_at,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function booleanNumber(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value ? 1 : 0
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase()) ? 1 : 0
  return fallback ? 1 : 0
}

function jsonString(value: unknown) {
  return value == null ? null : JSON.stringify(value)
}

function errorDetails(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'Error', message: String(error) }
}

type ProjectionDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> }
  }
}

type ProjectionResult = {
  statements: number
  floors: number
  tables: number
  menuItems: number
  orders: number
  orderItems: number
  kots: number
  kotItems: number
  payments: number
  skippedReferences: number
}

function createProjectionCollector(db: D1Database, statements: D1PreparedStatement[]): ProjectionDatabase {
  return {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async run() {
              statements.push(db.prepare(query).bind(...values))
            },
          }
        },
      }
    },
  }
}

async function projectSnapshotToRelational(db: ProjectionDatabase, outletId: string, snapshot: SnapshotPayload, updatedAt: string): Promise<ProjectionResult> {
  const outlet = asRecord(snapshot.outlet) ?? {}
  const printSettings = asRecord(snapshot.printSettings) ?? {}
  const tenantId = stringValue(outlet.tenantId, outletId.startsWith('out_') ? outletId.slice(4) : outletId)
  const outletName = stringValue(outlet.name, 'My Restaurant')
  const outletCode = stringValue(outlet.code, tenantId.slice(0, 3).toUpperCase() || 'OUT')
  const outletAddress = stringValue(outlet.address)
  const outletPhone = stringValue(outlet.phone)
  const outletTimezone = stringValue(outlet.timezone, 'Asia/Kolkata')
  const outletCurrency = stringValue(outlet.currency, 'INR')
  const outletGstin = stringValue(outlet.gstin)
  const outletStatus = stringValue(outlet.status, 'active')
  const floors = asArray(snapshot.floors)
  const tables = asArray(snapshot.tables)
  const categories = asArray(snapshot.menuCategories)
  const menuItems = asArray(snapshot.menuItems)
  const orders = asArray(snapshot.orders)
  const orderItems = asArray(snapshot.orderItems)
  const kots = asArray(snapshot.kots)
  const payments = asArray(snapshot.payments)
  const idsFrom = (values: unknown[]) => new Set(values.map(asRecord).filter(Boolean).map((record) => stringValue(record?.id)).filter(Boolean))
  const floorIds = idsFrom(floors)
  const categoryIds = idsFrom(categories)
  const orderIds = idsFrom(orders)
  const orderItemIds = idsFrom(orderItems)
  const kotIds = idsFrom(kots)
  const projectedStationId = (value: unknown) => {
    const stationId = stringValue(value)
    return stationId ? `${outletId}:${stationId}` : null
  }
  let skippedReferences = 0
  let projectedTables = 0
  let projectedMenuItems = 0
  let projectedOrderItems = 0
  let projectedKots = 0
  let projectedKotItems = 0
  let projectedPayments = 0

  await db.prepare(`
    UPDATE outlets SET
      name = ?, code = ?, address = ?, phone = ?, timezone = ?, currency = ?, gstin = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    outletName,
    outletCode,
    outletAddress || null,
    outletPhone || null,
    outletTimezone,
    outletCurrency,
    outletGstin || null,
    outletStatus,
    updatedAt,
    outletId
  ).run()

  await db.prepare(`
    INSERT INTO print_settings (
      outlet_id, receipt_width, business_name, header_text, footer_text, show_gstin, show_kot_token, auto_print_receipt, auto_print_kot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(outlet_id) DO UPDATE SET
      receipt_width = excluded.receipt_width,
      business_name = excluded.business_name,
      header_text = excluded.header_text,
      footer_text = excluded.footer_text,
      show_gstin = excluded.show_gstin,
      show_kot_token = excluded.show_kot_token,
      auto_print_receipt = excluded.auto_print_receipt,
      auto_print_kot = excluded.auto_print_kot
  `).bind(
    outletId,
    stringValue(printSettings.receiptWidth, '80mm'),
    stringValue(printSettings.businessName, outletName),
    stringValue(printSettings.headerText) || null,
    stringValue(printSettings.footerText) || null,
    booleanNumber(printSettings.showGstin, true),
    booleanNumber(printSettings.showKotToken, true),
    booleanNumber(printSettings.autoPrintReceipt),
    booleanNumber(printSettings.autoPrintKot)
  ).run()

  const scopedDeleteTables = [
    'payments',
    'kot_items',
    'kots',
    'order_items',
    'orders',
    'restaurant_tables',
    'menu_items',
    'floors',
    'stations',
    'menu_categories',
    'inventory_items',
    'audit_logs',
  ]
  for (const table of scopedDeleteTables) {
    await db.prepare(`DELETE FROM ${table} WHERE outlet_id = ?`).bind(outletId).run()
  }

  for (const floor of floors) {
    const record = asRecord(floor)
    if (!record) continue
    await db.prepare(`
      INSERT INTO floors (id, tenant_id, outlet_id, name, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.name, 'Floor'),
      numberValue(record.sortOrder),
      booleanNumber(record.isActive, true),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const table of tables) {
    const record = asRecord(table)
    if (!record) continue
    if (!floorIds.has(stringValue(record.floorId))) {
      skippedReferences += 1
      continue
    }
    projectedTables += 1
    await db.prepare(`
      INSERT INTO restaurant_tables (
        id, tenant_id, outlet_id, floor_id, name, seats, status, active_order_id, assigned_user_id, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.floorId),
      stringValue(record.name, 'Table'),
      numberValue(record.seats, 4),
      stringValue(record.status, 'available'),
      stringValue(record.activeOrderId) || null,
      stringValue(record.assignedUserId) || null,
      numberValue(record.sortOrder),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const station of asArray(snapshot.stations)) {
    const record = asRecord(station)
    if (!record) continue
    await db.prepare(`
      INSERT INTO stations (id, tenant_id, outlet_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      projectedStationId(record.id),
      tenantId,
      outletId,
      stringValue(record.name, 'Station'),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const category of categories) {
    const record = asRecord(category)
    if (!record) continue
    await db.prepare(`
      INSERT INTO menu_categories (id, tenant_id, outlet_id, name, color, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.name, 'Category'),
      stringValue(record.color) || null,
      numberValue(record.sortOrder),
      booleanNumber(record.isActive, true),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const item of menuItems) {
    const record = asRecord(item)
    if (!record) continue
    if (!categoryIds.has(stringValue(record.categoryId))) {
      skippedReferences += 1
      continue
    }
    projectedMenuItems += 1
    await db.prepare(`
      INSERT INTO menu_items (
        id, tenant_id, outlet_id, category_id, name, item_type, price_paise, tax_percent, station_id, is_available, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.categoryId),
      stringValue(record.name, 'Menu Item'),
      stringValue(record.itemType, 'other'),
      numberValue(record.pricePaise),
      numberValue(record.taxPercent),
      projectedStationId(record.stationId),
      booleanNumber(record.isAvailable, true),
      numberValue(record.sortOrder),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const item of asArray(snapshot.inventoryItems)) {
    const record = asRecord(item)
    if (!record) continue
    await db.prepare(`
      INSERT INTO inventory_items (
        id, tenant_id, outlet_id, name, unit, current_stock, minimum_stock, cost_per_unit, supplier, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.name, 'Inventory Item'),
      stringValue(record.unit, 'unit'),
      numberValue(record.currentStock),
      numberValue(record.minimumStock),
      numberValue(record.costPerUnit),
      stringValue(record.supplier) || null,
      stringValue(record.lastUpdatedAt, updatedAt),
    ).run()
  }

  for (const order of orders) {
    const record = asRecord(order)
    if (!record) continue
    await db.prepare(`
      INSERT INTO orders (
        id, tenant_id, outlet_id, order_no, business_date, type, status, table_id, table_name,
        customer_id, customer_name, customer_phone, captain_user_id, captain_name,
        cashier_user_id, cashier_name, subtotal_paise, discount_paise, tax_paise,
        charge_paise, total_paise, paid_paise, payment_status, notes, created_at, updated_at, closed_at, cancellation_reason, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.orderNo),
      stringValue(record.businessDate),
      stringValue(record.type, 'dine_in'),
      stringValue(record.status, 'running'),
      stringValue(record.tableId) || null,
      stringValue(record.tableName) || null,
      stringValue(record.customerId) || null,
      stringValue(record.customerName) || null,
      stringValue(record.customerPhone) || null,
      stringValue(record.captainUserId) || null,
      stringValue(record.captainName) || null,
      stringValue(record.cashierUserId) || null,
      stringValue(record.cashierName) || null,
      numberValue(record.subtotalPaise),
      numberValue(record.discountPaise),
      numberValue(record.taxPaise),
      numberValue(record.chargePaise),
      numberValue(record.totalPaise),
      numberValue(record.paidPaise),
      stringValue(record.paymentStatus, 'unpaid'),
      stringValue(record.notes) || null,
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
      stringValue(record.closedAt) || null,
      stringValue(record.cancellationReason) || null,
      stringValue(record.cancelledAt) || null,
    ).run()
  }

  for (const item of orderItems) {
    const record = asRecord(item)
    if (!record) continue
    if (!orderIds.has(stringValue(record.orderId))) {
      skippedReferences += 1
      continue
    }
    projectedOrderItems += 1
    await db.prepare(`
      INSERT INTO order_items (
        id, tenant_id, outlet_id, order_id, menu_item_id, name_snapshot, item_type, quantity, unit_price_paise,
        tax_paise, discount_paise, total_paise, station_id, status, note, modifiers_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.orderId),
      stringValue(record.menuItemId),
      stringValue(record.nameSnapshot),
      stringValue(record.itemType, 'other'),
      numberValue(record.quantity),
      numberValue(record.unitPricePaise),
      numberValue(record.taxPaise),
      numberValue(record.discountPaise),
      numberValue(record.totalPaise),
      projectedStationId(record.stationId),
      stringValue(record.status, 'draft'),
      stringValue(record.note) || null,
      jsonString(record.modifiers),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
    ).run()
  }

  for (const kot of kots) {
    const record = asRecord(kot)
    if (!record) continue
    if (!orderIds.has(stringValue(record.orderId))) {
      skippedReferences += 1
      continue
    }
    projectedKots += 1
    await db.prepare(`
      INSERT INTO kots (
        id, tenant_id, outlet_id, order_id, kot_no, station_id, status, created_by_user_id, printed_at, created_at, updated_at, order_no, table_name, order_type, captain_name, cancellation_reason, cancelled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.orderId),
      stringValue(record.kotNo),
      projectedStationId(record.stationId),
      stringValue(record.status, 'new'),
      stringValue(record.createdByUserId),
      stringValue(record.printedAt) || null,
      stringValue(record.createdAt, updatedAt),
      stringValue(record.updatedAt, updatedAt),
      stringValue(record.orderNo) || null,
      stringValue(record.tableName) || null,
      stringValue(record.orderType) || null,
      stringValue(record.captainName) || null,
      stringValue(record.cancellationReason) || null,
      stringValue(record.cancelledAt) || null,
    ).run()
  }

  for (const kot of kots) {
    const record = asRecord(kot)
    if (!record) continue
    if (!kotIds.has(stringValue(record.id)) || !orderIds.has(stringValue(record.orderId))) continue
    for (const item of asArray(record.items)) {
      const kotItem = asRecord(item)
      if (!kotItem) continue
      if (!orderItemIds.has(stringValue(kotItem.orderItemId))) {
        skippedReferences += 1
        continue
      }
      projectedKotItems += 1
      await db.prepare(`
        INSERT INTO kot_items (
          id, tenant_id, outlet_id, kot_id, order_item_id, quantity, status, created_at, updated_at, name, note, modifiers, item_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        stringValue(kotItem.id),
        tenantId,
        outletId,
        stringValue(record.id),
        stringValue(kotItem.orderItemId),
        numberValue(kotItem.quantity),
        stringValue(kotItem.status, 'new'),
        stringValue(kotItem.createdAt, stringValue(record.createdAt, updatedAt)),
        stringValue(kotItem.updatedAt, updatedAt),
        stringValue(kotItem.name),
        stringValue(kotItem.note) || null,
        jsonString(kotItem.modifiers),
        stringValue(kotItem.itemType, 'other'),
      ).run()
    }
  }

  for (const payment of payments) {
    const record = asRecord(payment)
    if (!record) continue
    if (!orderIds.has(stringValue(record.orderId))) {
      skippedReferences += 1
      continue
    }
    projectedPayments += 1
    await db.prepare(`
      INSERT INTO payments (
        id, tenant_id, outlet_id, order_id, method, amount_paise, reference_no, status, collected_by_user_id, created_at, status_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.orderId),
      stringValue(record.method, 'cash'),
      numberValue(record.amountPaise),
      stringValue(record.referenceNo) || null,
      stringValue(record.status, 'success'),
      stringValue(record.collectedByUserId),
      stringValue(record.createdAt, updatedAt),
      stringValue(record.statusReason) || null,
    ).run()
  }

  for (const log of asArray(snapshot.auditLogs)) {
    const record = asRecord(log)
    if (!record) continue
    await db.prepare(`
      INSERT INTO audit_logs (
        id, tenant_id, outlet_id, user_id, action, entity_type, entity_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      stringValue(record.id),
      tenantId,
      outletId,
      stringValue(record.userId) || null,
      stringValue(record.action),
      stringValue(record.entityType),
      stringValue(record.entityId) || null,
      jsonString({ userName: record.userName, details: record.details }),
      stringValue(record.createdAt, updatedAt),
    ).run()
  }
  return {
    statements: 0,
    floors: floorIds.size,
    tables: projectedTables,
    menuItems: projectedMenuItems,
    orders: orderIds.size,
    orderItems: projectedOrderItems,
    kots: projectedKots,
    kotItems: projectedKotItems,
    payments: projectedPayments,
    skippedReferences,
  }
}

async function reconcileStoredSnapshot(db: D1Database, outletId: string) {
  const snapshot = await readSnapshotRow(db, outletId)
  if (!snapshot) return null
  const outlet = asRecord(snapshot.payload.outlet) ?? {}
  await ensureTenantAndOutlet(db, snapshot.tenantId, stringValue(outlet.name, 'My Restaurant'))
  const statements: D1PreparedStatement[] = []
  const projection = await projectSnapshotToRelational(
    createProjectionCollector(db, statements),
    outletId,
    snapshot.payload,
    snapshot.updatedAt,
  )
  projection.statements = statements.length
  await db.batch(statements)
  return { snapshot, projection }
}

async function constantTimeTokenMatches(expected: string, candidate: string) {
  const encoder = new TextEncoder()
  const [expectedHash, candidateHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
  ])
  const expectedBytes = new Uint8Array(expectedHash)
  const candidateBytes = new Uint8Array(candidateHash)
  let difference = 0
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ candidateBytes[index]
  }
  return difference === 0
}

async function getTenantSnapshotCounts(db: D1Database, tenantId: string) {
  const { results } = await db.prepare(
    'SELECT outlet_id, payload_json, updated_at FROM app_snapshots WHERE tenant_id = ? ORDER BY updated_at DESC'
  ).bind(tenantId).all<{ outlet_id: string; payload_json: string; updated_at: string }>()

  const empty = countSnapshotData(null)
  return (results || []).reduce<SnapshotCounts & { outlets: number }>((total, row) => {
    let counts = countSnapshotData(null, row.updated_at)
    try {
      counts = countSnapshotData(JSON.parse(row.payload_json) as Record<string, unknown>, row.updated_at)
    } catch {
      // Keep zero counts for corrupt JSON but still show that a snapshot row exists.
    }
    return {
      outlets: total.outlets + 1,
      menuItems: total.menuItems + counts.menuItems,
      menuCategories: total.menuCategories + counts.menuCategories,
      orders: total.orders + counts.orders,
      orderItems: total.orderItems + counts.orderItems,
      payments: total.payments + counts.payments,
      kots: total.kots + counts.kots,
      tables: total.tables + counts.tables,
      floors: total.floors + counts.floors,
      inventoryItems: total.inventoryItems + counts.inventoryItems,
      savedCarts: total.savedCarts + counts.savedCarts,
      score: total.score + counts.score,
      updatedAt: !total.updatedAt || row.updated_at > total.updatedAt ? row.updated_at : total.updatedAt,
    }
  }, { outlets: 0, ...empty })
}

async function clearRealtimeOutlet(env: Bindings, outletId: string) {
  if (!env.REALTIME_HUB) return
  try {
    const stub = env.REALTIME_HUB.get(env.REALTIME_HUB.idFromName(outletId))
    await stub.fetch('https://realtime.internal/state', { method: 'DELETE' })
  } catch (err) {
    console.error('Failed to clear realtime outlet state:', err)
  }
}

export class RealtimeHub {
  private syncTail: Promise<void> = Promise.resolve()

  constructor(private readonly state: DurableObjectState, private readonly env: Bindings) {
    state.blockConcurrencyWhile(async () => {
      state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS outlet_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          tenant_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/sync' && request.method === 'POST') {
      if (!this.env.DB) return Response.json({ error: 'Database binding is not configured' }, { status: 500 })
      const raw = await request.json().catch(() => null)
      const envelope = z.object({
        outletId: z.string().min(1),
        tenantId: z.string().min(1),
        push: syncPushSchema,
      }).safeParse(raw)
      if (!envelope.success) return Response.json({ error: 'Invalid sync payload' }, { status: 400 })
      const result = await this.serializeSync(() => applySyncPush(
        this.env.DB!,
        envelope.data.outletId,
        envelope.data.tenantId,
        envelope.data.push,
      ))
      const accepted = 'accepted' in result.body && Array.isArray(result.body.accepted)
        ? result.body.accepted
        : []
      if (result.status === 200 && accepted.length > 0) {
        const message = JSON.stringify({
          type: 'SYNC_DELTA_AVAILABLE',
          cursor: result.body.cursor,
          timestamp: result.body.serverTime,
          clientId: envelope.data.push.deviceId,
        })
        for (const socket of this.state.getWebSockets()) {
          try { socket.send(message) } catch { /* ignore disconnected socket */ }
        }
      }
      return Response.json(result.body, { status: result.status })
    }
    if (url.pathname === '/state' && request.method === 'GET') {
      const rows = this.state.storage.sql.exec<{ tenant_id: string; payload_json: string; updated_at: string }>(
        'SELECT tenant_id, payload_json, updated_at FROM outlet_state WHERE id = 1'
      ).toArray()
      const row = rows[0]
      if (!row) return Response.json({ exists: false })
      return Response.json({
        exists: true,
        tenantId: row.tenant_id,
        updatedAt: row.updated_at,
        payload: JSON.parse(row.payload_json),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (url.pathname === '/state' && request.method === 'PUT') {
      const body = appSnapshotSchema.safeParse(await request.json())
      if (!body.success) return Response.json({ error: 'Invalid state payload' }, { status: 400 })
      const updatedAt = this.persistAndBroadcast(body.data)
      return Response.json({ ok: true, updatedAt })
    }

    if (url.pathname === '/state' && request.method === 'DELETE') {
      this.state.storage.sql.exec('DELETE FROM outlet_state WHERE id = 1')
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(JSON.stringify({ type: 'STATE_DELETED', timestamp: new Date().toISOString() })) } catch { /* ignore */ }
      }
      return Response.json({ ok: true })
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.text()
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(message) } catch { /* ignore */ }
      }
      return Response.json({ ok: true })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server)
    server.send(JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() }))
    return new Response(null, { status: 101, webSocket: client })
  }

  private serializeSync<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.syncTail.then(operation, operation)
    this.syncTail = result.then(() => undefined, () => undefined)
    return result
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return
    if (message === 'ping') {
      socket.send('pong')
      return
    }
    try {
      const raw = JSON.parse(message) as Record<string, unknown>
      if (raw.type !== 'SAVE_STATE') return
      const body = appSnapshotSchema.safeParse(raw)
      if (!body.success) {
        socket.send(JSON.stringify({ type: 'SAVE_REJECTED', messageId: raw.messageId }))
        return
      }
      this.persistAndBroadcast(body.data)
    } catch {
      socket.send(JSON.stringify({ type: 'SAVE_REJECTED' }))
    }
  }

  private persistAndBroadcast(data: z.infer<typeof appSnapshotSchema>) {
    const operationalPayload = compactOperationalSnapshot(data.payload)
    const rows = this.state.storage.sql.exec<{ payload_json: string; updated_at: string }>(
      'SELECT payload_json, updated_at FROM outlet_state WHERE id = 1'
    ).toArray()
    const existing = rows[0]
    if (existing) {
      try {
        const existingPayload = JSON.parse(existing.payload_json) as Record<string, unknown>
        if ((getSnapshotDataScore(operationalPayload) === 0 && getSnapshotDataScore(existingPayload) > 0)
          || wouldEraseCoreRestaurantData(existingPayload, operationalPayload)) {
          const message = JSON.stringify({
            type: 'STATE_UPDATED',
            updatedAt: existing.updated_at,
            clientId: data.clientId,
            messageId: data.messageId,
            skipped: true,
            payload: existingPayload,
          })
          for (const socket of this.state.getWebSockets()) {
            try { socket.send(message) } catch { /* ignore */ }
          }
          return existing.updated_at
        }
      } catch {
        // If the stored payload is corrupt, let the new valid payload replace it.
      }
    }

    const updatedAt = new Date().toISOString()
    this.state.storage.sql.exec(`
      INSERT INTO outlet_state (id, tenant_id, payload_json, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `, data.tenantId, JSON.stringify(operationalPayload), updatedAt)
    let message = JSON.stringify({
      type: 'STATE_UPDATED',
      updatedAt,
      clientId: data.clientId,
      messageId: data.messageId,
      payload: operationalPayload,
    })
    if (message.length > 750_000) {
      message = JSON.stringify({
        type: 'STATE_UPDATED',
        updatedAt,
        clientId: data.clientId,
        messageId: data.messageId,
      })
    }
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        try { socket.close(1011, 'Broadcast failed') } catch { /* Socket already closed. */ }
      }
    }
    return updatedAt
  }
}

function publicUser(user: User) {
  const { password: _password, pin: _pin, ...safeUser } = user
  return { ...safeUser, restaurantName: user.restaurantName }
}

type UserRow = {
  id: string; tenant_id: string; name: string; email: string | null; phone: string | null
  password_hash: string; pin_hash: string | null; role: Role; status: User['status']
  access_starts_at: string | null; access_ends_at: string | null; restaurant_name: string | null
  payment_received: number | null; renewal_payment_received: number | null; payment_note: string | null
  payment_amount: number | null; payment_date: string | null; renewal_amount: number | null; renewal_date: string | null
  created_at: string
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id, tenantId: row.tenant_id, name: row.name, email: row.email ?? '',
    phone: row.phone ?? '', password: row.password_hash, pin: row.pin_hash ?? '',
    role: row.role, status: row.status, accessStartsAt: row.access_starts_at ?? undefined,
    accessEndsAt: row.access_ends_at ?? undefined, restaurantName: row.restaurant_name ?? undefined,
    paymentReceived: row.payment_received === null ? undefined : Boolean(row.payment_received),
    renewalPaymentReceived: row.renewal_payment_received === null ? undefined : Boolean(row.renewal_payment_received),
    paymentNote: row.payment_note ?? undefined,
    paymentAmount: row.payment_amount ?? undefined,
    paymentDate: row.payment_date ?? undefined,
    renewalAmount: row.renewal_amount ?? undefined,
    renewalDate: row.renewal_date ?? undefined,
    createdAt: row.created_at,
  }
}

const USER_COLUMNS = `id, tenant_id, name, email, phone, password_hash, pin_hash, role, status,
  access_starts_at, access_ends_at, restaurant_name, payment_received, renewal_payment_received, payment_note,
  payment_amount, payment_date, renewal_amount, renewal_date, created_at`

async function listUsers(db: D1Database) {
  const result = await db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC`).all<UserRow>()
  return result.results.map(rowToUser)
}

async function ensureTenantAndOutlet(db: D1Database, tenantId: string, restaurantName: string) {
  const now = new Date().toISOString()
  // Auto-create tenant row if missing (silently ignore if already exists)
  await db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, slug, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).bind(tenantId, restaurantName, tenantId, now, now).run()

  // Auto-create outlet row if missing
  const outletId = `out_${tenantId}`
  await db.prepare(`
    INSERT OR IGNORE INTO outlets (id, tenant_id, name, code, timezone, currency, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Asia/Kolkata', 'INR', 'active', ?, ?)
  `).bind(outletId, tenantId, restaurantName, tenantId.slice(0, 6).toUpperCase(), now, now).run()
}

async function upsertUser(db: D1Database, user: User) {
  const now = new Date().toISOString()
  const passwordHash = await normalizeSecretForStorage(user.password)
  const pinHash = await normalizeSecretForStorage(user.pin || '')

  // Ensure tenant + outlet exist BEFORE inserting user (avoids FK violation)
  await ensureTenantAndOutlet(db, user.tenantId, user.restaurantName || user.name)

  await db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, phone, password_hash, pin_hash, role, status,
      access_starts_at, access_ends_at, restaurant_name, payment_received, renewal_payment_received, payment_note,
      payment_amount, payment_date, renewal_amount, renewal_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id=excluded.tenant_id, name=excluded.name, email=excluded.email, phone=excluded.phone,
      password_hash=CASE WHEN excluded.password_hash = '' THEN users.password_hash ELSE excluded.password_hash END,
      pin_hash=CASE WHEN excluded.pin_hash IS NULL THEN users.pin_hash ELSE excluded.pin_hash END,
      role=excluded.role, status=excluded.status,
      access_starts_at=excluded.access_starts_at, access_ends_at=excluded.access_ends_at,
      restaurant_name=excluded.restaurant_name, payment_received=excluded.payment_received,
      renewal_payment_received=excluded.renewal_payment_received, payment_note=excluded.payment_note,
      payment_amount=excluded.payment_amount, payment_date=excluded.payment_date,
      renewal_amount=excluded.renewal_amount, renewal_date=excluded.renewal_date,
      updated_at=excluded.updated_at
  `).bind(
    user.id, user.tenantId, user.name, user.email || null, user.phone || null, passwordHash,
    pinHash || null, user.role, user.status, user.accessStartsAt || null, user.accessEndsAt || null,
    user.restaurantName || null, user.paymentReceived === false ? 0 : 1,
    user.renewalPaymentReceived === false ? 0 : 1, user.paymentNote || null,
    user.paymentAmount ?? null, user.paymentDate || null, user.renewalAmount ?? null, user.renewalDate || null,
    user.createdAt || now, now
  ).run()
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseAlertRecipients(rawValue?: string) {
  const entries = (rawValue || '')
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []

  for (const entry of entries) {
    const normalized = entry.replace(/^.*<([^>]+)>.*$/, '$1').trim()
    if (EMAIL_ADDRESS_PATTERN.test(normalized)) {
      valid.push(normalized)
    } else {
      invalid.push(entry)
    }
  }

  return { valid, invalid }
}

function getAlertRecipients(env: Bindings) {
  return parseAlertRecipients(env.ALERT_TO_EMAIL).valid
}

function parseDateBoundary(value?: string, boundary: 'start' | 'end' = 'end') {
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

function formatAlertDate(value?: string) {
  const parsed = parseDateBoundary(value, 'start')
  return parsed === null ? 'Not set' : new Date(parsed).toLocaleDateString('en-IN')
}

function formatAlertAmount(value?: number) {
  return value === undefined
    ? 'Not set'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

function getUserAccessIssue(user: Pick<User, 'accessStartsAt' | 'accessEndsAt' | 'renewalDate'>) {
  const currentTime = Date.now()
  const accessStartsAt = parseDateBoundary(user.accessStartsAt, 'start')
  if (accessStartsAt !== null && accessStartsAt > currentTime) {
    return { code: 'not_started', message: 'This login is not active yet' }
  }

  const renewalDate = parseDateBoundary(user.renewalDate, 'end')
  if (renewalDate !== null && renewalDate < currentTime) {
    return { code: 'renewal_expired', message: `Renewal date has expired. Contact ${SUPPORT_PHONE} to renew access.` }
  }

  const accessEndsAt = parseDateBoundary(user.accessEndsAt, 'end')
  if (accessEndsAt !== null && accessEndsAt < currentTime) {
    return { code: 'access_expired', message: 'This login has expired' }
  }

  return null
}

function getAlertEmailConfig(env: Bindings) {
  const apiKey = env.AGENTMAIL_API_KEY?.trim()
  if (!apiKey) throw new Error('AgentMail API key is not configured')
  const recipients = parseAlertRecipients(env.ALERT_TO_EMAIL)
  const to = recipients.valid
  if (to.length === 0) throw new Error('Alert recipient email is not configured')
  if (recipients.invalid.length > 0) {
    throw new Error(`Invalid alert recipient email: ${recipients.invalid.join(', ')}`)
  }
  const replyToRecipients = parseAlertRecipients(env.ALERT_REPLY_TO_EMAIL)
  if (replyToRecipients.invalid.length > 0) {
    throw new Error(`Invalid reply-to email: ${replyToRecipients.invalid.join(', ')}`)
  }
  return {
    apiKey,
    to,
    replyTo: replyToRecipients.valid,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const AGENTMAIL_ALERTS_CLIENT_ID = 'bhojpatra-alerts-inbox-v1'
const AGENTMAIL_ALERTS_CACHE_KEY = 'agentmail:alerts:inbox'

type AgentMailInboxRecord = {
  inboxId: string
  email?: string
}

async function getCachedAgentMailInbox(env: Bindings) {
  if (env.AGENTMAIL_INBOX_ID?.trim()) {
    return { inboxId: env.AGENTMAIL_INBOX_ID.trim() } satisfies AgentMailInboxRecord
  }
  if (!env.CACHE) return null
  const raw = await env.CACHE.get(AGENTMAIL_ALERTS_CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AgentMailInboxRecord
    return parsed?.inboxId ? parsed : null
  } catch {
    return null
  }
}

async function ensureAgentMailInbox(env: Bindings) {
  const cached = await getCachedAgentMailInbox(env)
  if (cached?.inboxId) return cached

  const config = getAlertEmailConfig(env)
  const response = await fetch('https://api.agentmail.to/v0/inboxes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'bhojpatra-alerts',
      display_name: 'BhojPatra Alerts',
      client_id: AGENTMAIL_ALERTS_CLIENT_ID,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`AgentMail inbox setup failed (${response.status}): ${details || response.statusText}`)
  }

  const payload = await response.json<any>().catch(() => ({}))
  const record: AgentMailInboxRecord = {
    inboxId: typeof payload?.inbox_id === 'string' ? payload.inbox_id : '',
    email: typeof payload?.email === 'string' ? payload.email : undefined,
  }
  if (!record.inboxId) {
    throw new Error('AgentMail inbox setup failed: inbox id missing in response')
  }
  if (env.CACHE) {
    await env.CACHE.put(AGENTMAIL_ALERTS_CACHE_KEY, JSON.stringify(record))
  }
  return record
}

async function sendAlertEmail(env: Bindings, subject: string, html: string, text: string) {
  const config = getAlertEmailConfig(env)
  const inbox = await ensureAgentMailInbox(env)

  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox.inboxId)}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: config.to,
      subject,
      html,
      text,
      reply_to: config.replyTo.length ? config.replyTo : undefined,
      labels: ['bhojpatra', 'renewal-alert'],
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`AgentMail email failed (${response.status}): ${details || response.statusText}`)
  }

  return true
}

async function sendCustomerChangeAlert(env: Bindings, action: 'created' | 'updated' | 'deleted', user: User) {
  const subject = `BhojPatra customer ${action}: ${user.restaurantName || user.name}`
  const lines = [
    `Restaurant: ${user.restaurantName || user.name}`,
    `Owner/Admin: ${user.name}`,
    `Login: ${user.email || user.phone || '-'}`,
    `Tenant ID: ${user.tenantId}`,
    `Status: ${user.status}`,
    `Access ends: ${formatAlertDate(user.accessEndsAt)}`,
    `Payment date: ${formatAlertDate(user.paymentDate)}`,
    `Payment amount: ${formatAlertAmount(user.paymentAmount)}`,
    `Renewal date: ${formatAlertDate(user.renewalDate)}`,
    `Renewal amount: ${formatAlertAmount(user.renewalAmount)}`,
    `Payment received: ${user.paymentReceived === false ? 'No' : 'Yes'}`,
    `Renewal payment received: ${user.renewalPaymentReceived === false ? 'No' : 'Yes'}`,
    `Note: ${user.paymentNote || '-'}`,
  ]
  const text = [`Customer ${action} in BhojPatra Cloud Admin`, '', ...lines].join('\n')
  const html = `
    <h2>Customer ${action} in BhojPatra Cloud Admin</h2>
    <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
  `
  return sendAlertEmail(env, subject, html, text)
}

type ExpiringCustomerRow = {
  restaurant_name: string | null
  name: string
  email: string | null
  phone: string | null
  tenant_id: string
  access_ends_at: string | null
  renewal_date: string | null
  renewal_amount: number | null
}

async function sendRenewalDigest(env: Bindings) {
  if (!env.DB) return
  getAlertEmailConfig(env)

  const now = new Date()
  const tenDaysFromNow = new Date(now)
  tenDaysFromNow.setDate(now.getDate() + 10)
  const today = now.toISOString().slice(0, 10)
  const cutoff = tenDaysFromNow.toISOString().slice(0, 10)
  const { results } = await env.DB.prepare(`
    SELECT restaurant_name, name, email, phone, tenant_id, access_ends_at, renewal_date, renewal_amount
    FROM users
    WHERE tenant_id != 'platform'
      AND status = 'active'
      AND (
        (access_ends_at IS NOT NULL AND access_ends_at != '' AND access_ends_at BETWEEN ? AND ?)
        OR (renewal_date IS NOT NULL AND renewal_date != '' AND renewal_date BETWEEN ? AND ?)
      )
    ORDER BY COALESCE(renewal_date, access_ends_at) ASC
  `).bind(today, cutoff, today, cutoff).all<ExpiringCustomerRow>()

  if (!results.length) return

  const textLines = results.map((row) => {
    const login = row.email || row.phone || '-'
    const renewalAmount = row.renewal_amount === null ? 'Not set' : formatAlertAmount(row.renewal_amount)
    return `${row.restaurant_name || row.name} | ${login} | access ends ${formatAlertDate(row.access_ends_at || undefined)} | renewal ${formatAlertDate(row.renewal_date || undefined)} | amount ${renewalAmount}`
  })

  const htmlRows = results.map((row) => {
    const login = row.email || row.phone || '-'
    return `<tr>
      <td>${escapeHtml(row.restaurant_name || row.name)}</td>
      <td>${escapeHtml(login)}</td>
      <td>${escapeHtml(formatAlertDate(row.access_ends_at || undefined))}</td>
      <td>${escapeHtml(formatAlertDate(row.renewal_date || undefined))}</td>
      <td>${escapeHtml(row.renewal_amount === null ? 'Not set' : formatAlertAmount(row.renewal_amount))}</td>
    </tr>`
  }).join('')

  await sendAlertEmail(
    env,
    `BhojPatra renewal digest: ${results.length} customer${results.length === 1 ? '' : 's'} need attention`,
    `<h2>Upcoming access and renewal dates</h2><table border="1" cellpadding="8" cellspacing="0"><thead><tr><th>Restaurant</th><th>Login</th><th>Access ends</th><th>Renewal date</th><th>Renewal amount</th></tr></thead><tbody>${htmlRows}</tbody></table>`,
    ['Upcoming access and renewal dates', '', ...textLines].join('\n'),
  )
}

async function deleteUserOnly(db: D1Database, userId: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run()
  await db.prepare('DELETE FROM user_outlets WHERE user_id = ?').bind(userId).run()
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
}

async function deleteTenantData(env: Bindings, tenantId: string) {
  if (!env.DB) throw new Error('Database binding is not configured')
  const db = env.DB
  const { results: outletRows } = await db.prepare('SELECT id FROM outlets WHERE tenant_id = ?').bind(tenantId).all<{ id: string }>()
  const outletIds = outletRows.map((row) => row.id)

  for (const outletId of outletIds) {
    await clearRealtimeOutlet(env, outletId)
  }

  await db.prepare('DELETE FROM app_snapshots WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)').bind(tenantId).run()
  await db.prepare('DELETE FROM user_outlets WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?) OR outlet_id IN (SELECT id FROM outlets WHERE tenant_id = ?)').bind(tenantId, tenantId).run()
  await db.prepare('DELETE FROM kot_items WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM kots WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM payments WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM order_items WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM orders WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM restaurant_tables WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM floors WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM stations WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM menu_items WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM menu_categories WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM inventory_items WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM print_settings WHERE outlet_id IN (SELECT id FROM outlets WHERE tenant_id = ?)').bind(tenantId).run()
  await db.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM users WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM outlets WHERE tenant_id = ?').bind(tenantId).run()
  await db.prepare('DELETE FROM tenants WHERE id = ?').bind(tenantId).run()
}

function normalizeLogin(value: string) {
  return value.trim().toLowerCase()
}

const HASH_PREFIX = 'sha256$'
const SESSION_COOKIE = 'rf_session'
const ADMIN_SESSION_COOKIE = 'rf_admin_session'
const SESSION_MAX_AGE = 60 * 60 * 12

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  let decoded = value.replace(/-/g, '+').replace(/_/g, '/')
  while (decoded.length % 4) decoded += '='
  return atob(decoded)
}

async function sha256Hex(value: string) {
  const payload = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('')
}

function wouldRegressCompletedOrders(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
) {
  if (!existing) return false
  const incomingOrders = new Map(
    asArray(incoming.orders)
      .map(asRecord)
      .filter((order): order is Record<string, unknown> => Boolean(order))
      .map((order) => [stringValue(order.id), order]),
  )

  return asArray(existing.orders).some((value) => {
    const current = asRecord(value)
    if (!current) return false
    const currentStatus = stringValue(current.status)
    if (!['paid', 'cancelled', 'void'].includes(currentStatus)) return false
    const next = incomingOrders.get(stringValue(current.id))
    if (!next || ['paid', 'cancelled', 'void'].includes(stringValue(next.status))) return false
    const currentUpdatedAt = Date.parse(stringValue(current.updatedAt)) || 0
    const nextUpdatedAt = Date.parse(stringValue(next.updatedAt)) || 0
    return currentUpdatedAt >= nextUpdatedAt
  })
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

async function verifyPbkdf2Secret(stored: string, candidate: string) {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  // Current production hashes use the printable salt text as PBKDF2 salt.
  // Keep the hex-byte fallback for hashes created by older installers.
  const saltText = new TextEncoder().encode(parts[2])
  const saltBytes = hexToBytes(parts[2])
  const expected = parts[3]
  if (!Number.isSafeInteger(iterations) || iterations < 1 || !/^[0-9a-f]+$/i.test(expected) || expected.length % 2 !== 0) return false
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(candidate), 'PBKDF2', false, ['deriveBits'])
    const derive = async (salt: Uint8Array) => crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations }, key, expected.length * 4)
    const matches = (derived: ArrayBuffer) => Array.from(new Uint8Array(derived)).map((item) => item.toString(16).padStart(2, '0')).join('').toLowerCase() === expected.toLowerCase()
    if (matches(await derive(saltText))) return true
    return saltBytes ? matches(await derive(saltBytes)) : false
  } catch {
    return false
  }
}

async function createSessionToken(userId: string, secret: string) {
  const payload = `${userId}:${Date.now()}:${crypto.randomUUID()}`
  const signature = await sha256Hex(`${payload}:${secret}`)
  return `${base64UrlEncode(payload)}.${signature}`
}

async function verifySessionToken(token: string, secret: string) {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const payload = base64UrlDecode(parts[0])
  const expectedSig = await sha256Hex(`${payload}:${secret}`)
  if (expectedSig !== parts[1]) return null
  const [userId] = payload.split(':')
  return userId || null
}

async function normalizeSecretForStorage(value: string) {
  const secret = value.trim()
  if (!secret) return ''
  if (secret.startsWith(HASH_PREFIX)) return secret
  return `${HASH_PREFIX}${await sha256Hex(secret)}`
}

async function verifySecret(storedValue: string | undefined, candidate: string) {
  const stored = storedValue?.trim() ?? ''
  if (!stored) return false
  if (stored.startsWith('pbkdf2$')) return verifyPbkdf2Secret(stored, candidate)
  if (stored.startsWith(HASH_PREFIX)) {
    return stored === `${HASH_PREFIX}${await sha256Hex(candidate)}`
  }
  return stored === candidate
}

async function findUserByLogin(db: D1Database, value: string) {
  const login = normalizeLogin(value)
  const row = await db.prepare(`SELECT ${USER_COLUMNS} FROM users
    WHERE lower(email) = ? OR lower(phone) = ? LIMIT 1`).bind(login, login).first<UserRow>()
  return row ? rowToUser(row) : undefined
}

async function findUserById(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`).bind(id).first<UserRow>()
  return row ? rowToUser(row) : undefined
}

async function findUserByBasicAuth(db: D1Database, authorization?: string | null) {
  if (!authorization?.toLowerCase().startsWith('basic ')) return undefined
  try {
    const decoded = atob(authorization.slice(6).trim())
    const separator = decoded.indexOf(':')
    if (separator <= 0) return undefined
    const login = decoded.slice(0, separator)
    const password = decoded.slice(separator + 1)
    return findUserByCredentials(db, login, password)
  } catch {
    return undefined
  }
}

async function findUserByCredentials(db: D1Database, login: string, password: string) {
  const user = await findUserByLogin(db, login)
  if (!user || user.status !== 'active') return undefined
  const passwordMatch = await verifySecret(user.password, password)
  const pinMatch = await verifySecret(user.pin, password)
  if (!passwordMatch && !pinMatch) return undefined
  return user
}

async function recordDailyLastLogin(db: D1Database, userId: string) {
  const loggedInAt = new Date().toISOString()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    await db.prepare(`
      UPDATE users SET last_login_at = ?, updated_at = ?
      WHERE id = ? AND (last_login_at IS NULL OR last_login_at < ?)
    `).bind(loggedInAt, loggedInAt, userId, cutoff).run()
  } catch (error) {
    // Login telemetry is optional. Authentication must continue when D1 is
    // temporarily read-only (for example while storage cleanup is pending).
    console.warn(JSON.stringify({
      level: 'warning',
      message: 'Could not record daily last login',
      userId,
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}

async function getAuthenticatedUser(c: { env: Bindings; req: any }) {
  if (!c.env.DB) return { response: Response.json({ error: 'Database binding is not configured' }, { status: 500 }) }
  const basicUser = await findUserByBasicAuth(c.env.DB, c.req.header?.('Authorization') ?? c.req.raw?.headers?.get?.('Authorization'))
  if (basicUser) {
    const issue = getUserAccessIssue(basicUser)
    if (!issue) return { user: basicUser }
    return { response: Response.json({ error: issue.message }, { status: 403 }) }
  }

  const requestUrl = c.req.url ? new URL(c.req.url) : new URL(c.req.raw?.url)
  const queryLogin = requestUrl.searchParams.get('login')
  const querySecret = requestUrl.searchParams.get('secret')
  if (queryLogin && querySecret) {
    const queryUser = await findUserByCredentials(c.env.DB, queryLogin, querySecret)
    if (queryUser) {
      const issue = getUserAccessIssue(queryUser)
      if (!issue) return { user: queryUser }
    }
  }

  const sessionToken = getCookie(c as any, SESSION_COOKIE)
  if (sessionToken) {
    const secret = c.env.SESSION_SECRET || 'dev-fallback-secret-change-in-production'
    const userId = await verifySessionToken(sessionToken, secret)
    if (userId) {
      const user = await findUserById(c.env.DB, userId)
      if (user && user.status === 'active') {
        const issue = getUserAccessIssue(user)
        if (!issue) return { user }
        deleteCookie(c as any, SESSION_COOKIE, { path: '/' })
        return { response: Response.json({ error: issue.message }, { status: 403 }) }
      }
    }
  }

  return { response: Response.json({ error: 'Unauthenticated' }, { status: 401 }) }
}

async function getPlatformAdmin(c: { env: Bindings; req: any }) {
  if (!c.env.DB) return { response: Response.json({ error: 'Database binding is not configured' }, { status: 500 }) }

  // Platform administration has its own cookie so a restaurant login from the
  // Pages app cannot replace an open Cloud Admin session on the Worker origin.
  // Accept the old shared cookie only when it still identifies a platform admin
  // so existing admin sessions survive this deployment.
  const adminToken = getCookie(c as any, ADMIN_SESSION_COOKIE)
  const legacyToken = adminToken ? undefined : getCookie(c as any, SESSION_COOKIE)
  const token = adminToken || legacyToken
  if (token) {
    const secret = c.env.SESSION_SECRET || 'dev-fallback-secret-change-in-production'
    const userId = await verifySessionToken(token, secret)
    const user = userId ? await findUserById(c.env.DB, userId) : undefined
    if (user?.status === 'active' && user.tenantId === 'platform' && user.role === 'admin') {
      const issue = getUserAccessIssue(user)
      if (!issue) return { user }
    }
    if (adminToken) deleteCookie(c as any, ADMIN_SESSION_COOKIE, { path: '/' })
  }

  return { response: Response.json({ error: 'Admin session expired. Please sign in again.' }, { status: 401 }) }
}

async function getTenantStaffAdmin(c: { env: Bindings; req: any }) {
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth
  if (!['owner', 'admin', 'manager'].includes(auth.user.role)) {
    return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

function canAccessOutlet(user: User, outletId: string) {
  return user.tenantId === 'platform' || outletId === `out_${user.tenantId}`
}

async function broadcastStaffUpdated(env: Bindings, tenantId: string, payload: any) {
  if (!env.REALTIME_HUB || !env.DB) return
  try {
    const { results } = await env.DB.prepare('SELECT id FROM outlets WHERE tenant_id = ?').bind(tenantId).all<{ id: string }>()
    if (!results || results.length === 0) return
    const event = {
      type: 'STAFF_UPDATED',
      timestamp: new Date().toISOString(),
      payload
    }
    const message = JSON.stringify(event)
    for (const row of results) {
      const stub = env.REALTIME_HUB.get(env.REALTIME_HUB.idFromName(row.id))
      await stub.fetch('https://realtime.internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: message
      })
    }
  } catch (err) {
    console.error('Failed to broadcast staff update:', err)
  }
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin
    if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') return origin
    if (origin === 'http://tauri.localhost' || origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return origin
    if (/^https:\/\/[a-z0-9-]+\.workers\.dev$/i.test(origin)) return origin
    return undefined
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true,
}))
app.use('*', logger())

app.get('/', (c) => htmlResponse(cloudAdminHtml()))
app.get('/admin', (c) => htmlResponse(cloudAdminHtml()))
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }))

app.post('/api/v1/auth/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid login payload' }, 400)

  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const user = await findUserByCredentials(c.env.DB, body.data.emailOrPhone, body.data.password)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  if (user.tenantId === 'platform') return c.json({ error: 'Invalid credentials' }, 401)
  const issue = getUserAccessIssue(user)
  if (issue) return c.json({ error: issue.message }, 403)
  c.executionCtx.waitUntil(recordDailyLastLogin(c.env.DB, user.id))

  const secret = c.env.SESSION_SECRET || 'dev-fallback-secret-change-in-production'
  const token = await createSessionToken(user.id, secret)

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'None',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  return c.json({ user: publicUser(user), outlets: [getDynamicOutlet(user)] })
})

app.post('/api/v1/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.post('/api/v1/admin/login', async (c) => {
  const body = loginSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid login payload' }, 400)

  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const user = await findUserByCredentials(c.env.DB, body.data.emailOrPhone, body.data.password)
  if (!user || user.tenantId !== 'platform') return c.json({ error: 'Invalid credentials' }, 401)
  const issue = getUserAccessIssue(user)
  if (issue) return c.json({ error: issue.message }, 403)
  c.executionCtx.waitUntil(recordDailyLastLogin(c.env.DB, user.id))

  const secret = c.env.SESSION_SECRET || 'dev-fallback-secret-change-in-production'
  const token = await createSessionToken(user.id, secret)

  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'None',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  return c.json({ user: publicUser(user), outlets: [getDynamicOutlet(user)] })
})

app.post('/api/v1/admin/logout', (c) => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/v1/me', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  return c.json({ user: publicUser(auth.user) })
})

app.get('/api/v1/outlets', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  return c.json({ outlets: [getDynamicOutlet(auth.user)] })
})

app.get('/api/v1/outlets/:outletId/bootstrap', async (c) => {
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const expectedPrefix = 'out_'
  if (!outletId.startsWith(expectedPrefix)) return c.json({ error: 'Outlet not found' }, 404)
  const tenantId = outletId.substring(expectedPrefix.length)

  // Try to find the restaurant name from any user with this tenantId
  let restaurantName = 'My Restaurant'
  if (c.env.DB) {
    const row = await c.env.DB.prepare(
      `SELECT restaurant_name FROM users WHERE tenant_id = ? AND restaurant_name IS NOT NULL LIMIT 1`
    ).bind(tenantId).first<{ restaurant_name: string }>()
    if (row?.restaurant_name) restaurantName = row.restaurant_name
  }

  const mockUserForOutlet = { tenantId, restaurantName } as User

  // Only return users belonging to this tenant (not all tenants)
  const allUsers = c.env.DB ? (await listUsers(c.env.DB)) : []
  const tenantUsers = allUsers.filter(u => u.tenantId === tenantId).map(publicUser)

  return c.json({
    outlet: getDynamicOutlet(mockUserForOutlet),
    users: tenantUsers,
    realtime: { status: 'live', transport: 'websocket', manualSyncRequired: false },
  })
})

app.get('/api/v1/outlets/:outletId/state', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)

  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const dbState = await readSnapshotRow(db, outletId)

  if (!dbState) {
    return c.json({ exists: false, outletId })
  }

  return c.json({
    exists: true,
    outletId,
    tenantId: dbState.tenantId,
    updatedAt: dbState.updatedAt,
    payload: compactOperationalSnapshot(dbState.payload),
  })
})

app.post('/api/v1/outlets/:outletId/backups/daily', bodyLimit({ maxSize: 16 * 1024 * 1024 }), async (c) => {
  const db = c.env.DB
  const bucket = c.env.R2
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)
  if (!bucket) return c.json({ error: 'R2 backup binding is not configured' }, 503)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  if (!['owner', 'admin', 'manager'].includes(auth.user.role)) {
    return c.json({ error: 'This role cannot create cloud backups' }, 403)
  }
  let raw: unknown
  try { raw = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const parsed = dailyBackupSchema.safeParse(raw)
  if (!parsed.success) return c.json({ error: 'Invalid backup payload', details: parsed.error.flatten() }, 400)
  if (auth.user.tenantId !== 'platform' && parsed.data.tenantId !== auth.user.tenantId) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (outletId !== `out_${parsed.data.tenantId}`) return c.json({ error: 'Outlet does not belong to tenant' }, 403)
  const result = await writeDailyDesktopBackup(
    db,
    bucket,
    outletId,
    parsed.data.tenantId,
    parsed.data.payload,
    parsed.data.clientId,
    parsed.data.createdAt,
  )
  console.log(JSON.stringify({ event: 'r2_daily_backup_completed', outletId, ...result }))
  return c.json(result)
})

app.get('/api/v1/outlets/:outletId/backups', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '30', 10) || 30))
  const backups = await listCloudBackups(db, outletId, limit)
  return c.json({ ok: true, outletId, backups: backups.results })
})

app.get('/api/v1/outlets/:outletId/backups/:backupId/download', async (c) => {
  const db = c.env.DB
  const bucket = c.env.R2
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)
  if (!bucket) return c.json({ error: 'R2 backup binding is not configured' }, 503)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const metadata = await db.prepare(`
    SELECT object_key FROM cloud_backups WHERE id = ? AND outlet_id = ?
  `).bind(c.req.param('backupId'), outletId).first<{ object_key: string }>()
  if (!metadata) return c.json({ error: 'Backup not found' }, 404)
  const object = await bucket.get(metadata.object_key)
  if (!object) return c.json({ error: 'Backup object not found' }, 404)
  const headers = new Headers({ 'Cache-Control': 'private, no-store', ETag: object.httpEtag })
  object.writeHttpMetadata(headers)
  return new Response(object.body, { headers })
})

app.get('/api/v1/outlets/:outletId/realtime', async (c) => {
  if (!c.env.REALTIME_HUB) return c.json({ error: 'Realtime binding is not configured' }, 503)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const stub = c.env.REALTIME_HUB.get(c.env.REALTIME_HUB.idFromName(outletId))
  return stub.fetch(c.req.raw)
})

app.post('/api/v2/outlets/:outletId/sync/push', bodyLimit({ maxSize: 1536 * 1024 }), async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)

  let raw: unknown
  try { raw = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const parsed = syncPushSchema.safeParse(raw)
  if (!parsed.success) return c.json({ error: 'Invalid sync payload', details: parsed.error.flatten() }, 400)
  const tenantId = auth.user.tenantId === 'platform'
    ? (outletId.startsWith('out_') ? outletId.slice(4) : outletId)
    : auth.user.tenantId
  if (outletId !== `out_${tenantId}`) return c.json({ error: 'Outlet does not belong to tenant' }, 403)
  if (!c.env.REALTIME_HUB) return c.json({ error: 'Sync coordinator is not configured' }, 503)

  const stub = c.env.REALTIME_HUB.get(c.env.REALTIME_HUB.idFromName(outletId))
  const response = await stub.fetch('https://realtime.internal/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outletId, tenantId, push: parsed.data }),
  })
  const body = await response.json()
  console.log(JSON.stringify({
    event: 'sync_push_completed',
    outletId,
    deviceId: parsed.data.deviceId,
    batchId: parsed.data.batchId,
    status: response.status,
    changeCount: parsed.data.changes.length,
  }))
  return c.json(body, response.status as 200 | 400 | 409 | 500 | 503)
})

app.get('/api/v2/outlets/:outletId/sync/pull', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)
  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId)) return c.json({ error: 'Forbidden' }, 403)
  const cursor = Math.max(0, Number.parseInt(c.req.query('cursor') ?? '0', 10) || 0)
  const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '100', 10) || 100))
  return c.json(await pullSyncChanges(db, outletId, cursor, limit))
})

app.post('/api/v1/maintenance/reconcile/:outletId', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  if (!c.env.MAINTENANCE_TOKEN) return c.json({ error: 'Maintenance reconciliation is disabled' }, 503)
  const authorization = c.req.header('Authorization') ?? ''
  const candidate = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
  if (!candidate || !(await constantTimeTokenMatches(c.env.MAINTENANCE_TOKEN, candidate))) {
    return c.json({ error: 'Unauthenticated' }, 401)
  }
  const outletId = c.req.param('outletId')
  try {
    const result = await reconcileStoredSnapshot(c.env.DB, outletId)
    if (!result) return c.json({ error: 'Snapshot not found' }, 404)
    console.log(JSON.stringify({
      event: 'snapshot_reconciled',
      outletId,
      snapshotUpdatedAt: result.snapshot.updatedAt,
      ...result.projection,
    }))
    return c.json({ ok: true, outletId, updatedAt: result.snapshot.updatedAt, projection: result.projection })
  } catch (error) {
    const details = errorDetails(error)
    console.error(JSON.stringify({
      event: 'snapshot_reconciliation_failed',
      outletId,
      ...details,
    }))
    return c.json({ error: 'Snapshot reconciliation failed', outletId, details }, 500)
  }
})

// Bounded storage migration only: this endpoint never sends renewal emails.
app.post('/api/v1/admin/storage-migration/:outletId', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  if (!c.env.DB || !c.env.R2) return c.json({ error: 'D1 and R2 bindings are required' }, 503)
  return c.json(await compactLegacyAppSnapshots(c.env.DB, c.env.R2, 1, c.req.param('outletId')))
})

app.post('/api/v1/admin/storage-history-migration', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  if (!c.env.DB || !c.env.R2) return c.json({ error: 'D1 and R2 bindings are required' }, 503)
  return c.json(await migrateLegacySnapshotHistory(c.env.DB, c.env.R2, 1))
})

app.post('/api/v1/admin/storage-maintenance', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  await runScheduledDataMaintenance(c.env)
  return c.json({ ok: true })
})

function routeLegacyStateThroughV2() { return true }

app.put('/api/v1/outlets/:outletId/state', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database binding is not configured' }, 500)

  const body = appSnapshotSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid state payload' }, 400)

  const outletId = c.req.param('outletId')
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  if (!canAccessOutlet(auth.user, outletId) || (auth.user.tenantId !== 'platform' && body.data.tenantId !== auth.user.tenantId)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (outletId !== `out_${body.data.tenantId}`) return c.json({ error: 'Outlet does not belong to tenant' }, 403)

  const existing = await readSnapshotRow(db, outletId)
  const mobileOperationalRoles: Role[] = ['captain', 'kitchen']
  if (!['owner', 'admin', 'manager', ...mobileOperationalRoles].includes(auth.user.role)) {
    return c.json({ error: 'This role cannot update restaurant state' }, 403)
  }
  if (mobileOperationalRoles.includes(auth.user.role) && !preservesRoleRestrictedCollections(existing?.payload, body.data.payload)) {
    return c.json({ error: 'This role can only update tables, orders, and kitchen workflow' }, 403)
  }
  if (body.data.expectedUpdatedAt && existing?.updatedAt && body.data.expectedUpdatedAt !== existing.updatedAt) {
    return c.json({
      error: 'Restaurant data changed on another device. Refresh and retry.',
      outletId,
      updatedAt: existing.updatedAt,
      payload: existing.payload,
    }, 409)
  }
  const incomingScore = getSnapshotDataScore(body.data.payload)
  const existingScore = getSnapshotDataScore(existing?.payload)
  if ((incomingScore === 0 && existingScore > 0) || wouldEraseCoreRestaurantData(existing?.payload, body.data.payload)) {
    return c.json({
      ok: true,
      outletId,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
      skipped: true,
      reason: 'Ignored a snapshot that would erase existing restaurant setup data',
      payload: existing?.payload,
    })
  }
  if (wouldRegressCompletedOrders(existing?.payload, body.data.payload)) {
    return c.json({
      ok: true,
      outletId,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
      skipped: true,
      reason: 'Ignored a stale snapshot that would reopen a completed order',
      payload: existing?.payload,
    })
  }

  if (body.data.payload.snapshotKind === 'operational') {
    if (existing && existing.payload.snapshotKind !== 'operational') {
      return c.json({ error: 'Cloud history migration is pending; local data is safe. Retry after maintenance.' }, 503)
    }
    const incoming = body.data.payload
    const canonical = existing?.payload ?? {}
    const canonicalTables = new Map(asArray(canonical.tables).map(table => [table.id, table]))
    const merged = compactOperationalSnapshot({
      ...incoming,
      orders: canonical.orders ?? [], orderItems: canonical.orderItems ?? [],
      kots: canonical.kots ?? [], payments: canonical.payments ?? [],
      tables: asArray(incoming.tables).map(table => {
        const current = canonicalTables.get(table.id)
        return current ? { ...table, activeOrderId: current.activeOrderId, status: current.status } : table
      }),
      savedCarts: incoming.savedCarts ?? canonical.savedCarts ?? {},
      cloudSync: { ...(asRecord(incoming.cloudSync) ?? {}), accountSecret: '' },
    })
    const updatedAt = new Date().toISOString()
    const saved = await db.prepare(`
      INSERT INTO app_snapshots (outlet_id, tenant_id, payload_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(outlet_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
      WHERE app_snapshots.updated_at = ?
    `).bind(outletId, body.data.tenantId, JSON.stringify(merged), updatedAt, existing?.updatedAt ?? null).run()
    if (!saved.meta.changes) return c.json({ error: 'Cloud data changed during setup upload. Please retry.' }, 409)
    return c.json({ ok: true, outletId, updatedAt, payload: merged })
  }

  if (routeLegacyStateThroughV2()) {
    const orders = asArray(body.data.payload.orders).map(asRecord).filter((order): order is Record<string, unknown> => Boolean(order))
    const incomingItems = asArray(body.data.payload.orderItems).map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    const incomingKots = asArray(body.data.payload.kots).map(asRecord).filter((kot): kot is Record<string, unknown> => Boolean(kot))
    const incomingPayments = asArray(body.data.payload.payments).map(asRecord).filter((payment): payment is Record<string, unknown> => Boolean(payment))
    const incomingTables = asArray(body.data.payload.tables).map(asRecord).filter((table): table is Record<string, unknown> => Boolean(table))
    const conflicts: unknown[] = []
    for (const order of orders) {
      const orderUuid = stringValue(order.id)
      if (!orderUuid) continue
      const tableId = stringValue(order.tableId)
      const result = await applyLegacyOrderMutation(db, outletId, body.data.tenantId, orderUuid, {
        order,
        orderItems: incomingItems.filter((item) => stringValue(item.orderId) === orderUuid),
        kots: incomingKots.filter((kot) => stringValue(kot.orderId) === orderUuid),
        payments: incomingPayments.filter((payment) => stringValue(payment.orderId) === orderUuid),
        table: tableId ? incomingTables.find((table) => stringValue(table.id) === tableId) : undefined,
        deviceId: `legacy_snapshot_${body.data.clientId || auth.user.id}`,
      })
      if (result.status !== 200) return c.json(result.body, result.status as 404 | 409 | 500)
      if ('conflicts' in result.body) conflicts.push(...result.body.conflicts)
    }

    const canonical = await readSnapshotRow(db, outletId)
    const operational = canonical?.payload ?? existing?.payload ?? body.data.payload
    const mergedPayload = compactOperationalSnapshot({
      ...body.data.payload,
      orders: operational.orders,
      orderItems: operational.orderItems,
      kots: operational.kots,
      payments: operational.payments,
      tables: operational.tables,
      savedCarts: operational.savedCarts,
    })
    const updatedAt = new Date().toISOString()
    await db.prepare(`
      INSERT INTO app_snapshots (outlet_id, tenant_id, payload_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(outlet_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).bind(outletId, body.data.tenantId, JSON.stringify(mergedPayload), updatedAt).run()
    if (c.env.REALTIME_HUB) {
      const stub = c.env.REALTIME_HUB.get(c.env.REALTIME_HUB.idFromName(outletId))
      c.executionCtx.waitUntil(stub.fetch('https://realtime.internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'SYNC_DELTA_AVAILABLE', payload: { legacy: true } }),
      }).catch((error) => console.error('Legacy delta notice failed:', error)))
    }
    return c.json({ ok: true, outletId, updatedAt, conflicts, compatibilityMode: 'delta_v2', payload: mergedPayload })
  }

  const compactPayload = compactOperationalSnapshot(body.data.payload)
  const incomingPayloadJson = JSON.stringify(compactPayload)
  const forceProjection = body.data.clientId?.includes('manual') === true
  if (!forceProjection && existing && JSON.stringify(existing.payload) === incomingPayloadJson) {
    return c.json({
      ok: true,
      outletId,
      updatedAt: existing.updatedAt,
      skipped: true,
      reason: 'Identical snapshot already saved',
      payload: existing.payload,
    })
  }

  const updatedAt = new Date().toISOString()
  const transaction: D1PreparedStatement[] = []
  transaction.push(db.prepare(`
    INSERT INTO app_snapshots (outlet_id, tenant_id, payload_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(outlet_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(outletId, body.data.tenantId, incomingPayloadJson, updatedAt))
  const outlet = asRecord(body.data.payload.outlet) ?? {}
  const outletName = stringValue(outlet.name, 'My Restaurant')
  await ensureTenantAndOutlet(db, body.data.tenantId, outletName)
  const projection = await projectSnapshotToRelational(
    createProjectionCollector(db, transaction),
    outletId,
    body.data.payload,
    updatedAt,
  )
  projection.statements = transaction.length

  try {
    await db.batch(transaction)
  } catch (error) {
    const details = errorDetails(error)
    console.error(JSON.stringify({
      event: 'snapshot_projection_failed',
      outletId,
      statementCount: transaction.length,
      skippedReferences: projection.skippedReferences,
      ...details,
    }))
    return c.json({
      error: 'Restaurant snapshot could not be saved transactionally',
      outletId,
      projection,
      details,
    }, 500)
  }

  console.log(JSON.stringify({ event: 'snapshot_projection_completed', outletId, updatedAt, ...projection }))

  if (c.env.REALTIME_HUB) {
    const stub = c.env.REALTIME_HUB.get(c.env.REALTIME_HUB.idFromName(outletId))
    c.executionCtx.waitUntil(stub.fetch('https://realtime.internal/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.data),
    }).catch((error) => console.error('Optional realtime mirror failed:', error)))
  }

  return c.json({ ok: true, outletId, updatedAt, projection, payload: compactPayload })
})

app.get('/api/v1/staff/sync', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getTenantStaffAdmin(c)
  if ('response' in auth) return auth.response
  const users = (await listUsers(c.env.DB))
    .filter((user) => auth.user.tenantId === 'platform' || user.tenantId === auth.user.tenantId)
  return c.json({ staff: users })
})

app.post('/api/v1/staff/sync', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getTenantStaffAdmin(c)
  if ('response' in auth) return auth.response
  let rawBody: unknown
  try { rawBody = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const body = z.object({ staff: z.array(z.unknown()) }).safeParse(rawBody)
  if (!body.success) return c.json({ error: 'Invalid staff sync payload' }, 400)

  let savedCount = 0
  const touchedTenants = new Set<string>()
  for (const entry of body.data.staff) {
    const parsed = staffSchema.safeParse(entry)
    if (!parsed.success || !parsed.data.id) continue
    const tenantId = parsed.data.tenantId ?? auth.user.tenantId
    if (auth.user.tenantId !== 'platform' && tenantId !== auth.user.tenantId) continue
    try {
      await upsertUser(c.env.DB, {
        id: parsed.data.id,
        tenantId,
        name: parsed.data.name,
        email: parsed.data.email ?? '',
        phone: parsed.data.phone ?? '',
        role: parsed.data.role,
        status: parsed.data.status ?? 'active',
        password: parsed.data.password,
        pin: parsed.data.pin ?? '',
        accessStartsAt: parsed.data.accessStartsAt,
        accessEndsAt: parsed.data.accessEndsAt,
        restaurantName: parsed.data.restaurantName ?? auth.user.restaurantName,
        paymentReceived: parsed.data.paymentReceived,
        renewalPaymentReceived: parsed.data.renewalPaymentReceived,
        paymentNote: parsed.data.paymentNote,
        createdAt: parsed.data.createdAt,
      })
      savedCount++
      touchedTenants.add(tenantId)
    } catch (err) {
      console.error('Failed to upsert tenant staff during sync:', err)
    }
  }

  for (const tenantId of touchedTenants) {
    c.executionCtx.waitUntil(broadcastStaffUpdated(c.env, tenantId, { tenantId, savedCount }))
  }

  const users = (await listUsers(c.env.DB))
    .filter((user) => auth.user.tenantId === 'platform' || user.tenantId === auth.user.tenantId)
  return c.json({ staff: users })
})

app.get('/api/v1/admin/staff', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const staff = await Promise.all((await listUsers(c.env.DB)).map(async (user) => ({
    ...publicUser(user),
    dataCounts: await getTenantSnapshotCounts(c.env.DB!, user.tenantId),
  })))
  return c.json({ staff })
})

app.post('/api/v1/admin/staff', async (c) => {
  const body = customerAccountSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid staff payload' }, 400)

  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const now = crypto.randomUUID()
  const user: User = {
    id: body.data.id ?? `usr_${now}`,
    tenantId: body.data.tenantId ?? `ten_${now}`,
    name: body.data.name,
    email: body.data.email ?? '',
    phone: body.data.phone ?? '',
    role: body.data.role,
    status: body.data.status ?? 'active',
    password: body.data.password,
    pin: body.data.pin ?? '',
    accessStartsAt: body.data.accessStartsAt,
    accessEndsAt: body.data.accessEndsAt,
    restaurantName: body.data.restaurantName,
    paymentReceived: body.data.paymentReceived,
    renewalPaymentReceived: body.data.renewalPaymentReceived,
    paymentNote: body.data.paymentNote,
    paymentAmount: body.data.paymentAmount,
    paymentDate: body.data.paymentDate,
    renewalAmount: body.data.renewalAmount,
    renewalDate: body.data.renewalDate,
    createdAt: body.data.createdAt,
  }
  await upsertUser(c.env.DB, user)
  c.executionCtx.waitUntil(broadcastStaffUpdated(c.env, user.tenantId, { user: publicUser(user) }))
  c.executionCtx.waitUntil(sendCustomerChangeAlert(c.env, 'created', user).catch((error) => {
    console.error('Customer create alert failed:', error)
  }))
  const serverUrl = new URL(c.req.url).origin
  const outletId = `out_${user.tenantId}`
  const setupJson = {
    serverUrl,
    tenantId: user.tenantId,
    outletId,
    login: user.email || user.phone,
    password: body.data.password,
    mode: 'cloud_owner',
    cloudMode: 'daily_snapshot',
  }
  return c.json({
    user: publicUser(user),
    serverUrl,
    tenantId: user.tenantId,
    outletId,
    login: user.email || user.phone,
    password: body.data.password,
    setupJson,
  }, 201)
})

app.post('/api/v1/admin/staff/sync', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  let rawBody: unknown
  try { rawBody = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const body = z.object({ staff: z.array(z.unknown()) }).safeParse(rawBody)
  if (!body.success) return c.json({ error: 'Invalid staff sync payload' }, 400)

  // Process each entry individually - skip invalid ones gracefully
  let savedCount = 0
  for (const entry of body.data.staff) {
    const parsed = staffSchema.safeParse(entry)
    if (!parsed.success || !parsed.data.id) continue // skip invalid
    try {
      await upsertUser(c.env.DB, {
        id: parsed.data.id,
        tenantId: parsed.data.tenantId ?? 'ten_1',
        name: parsed.data.name,
        email: parsed.data.email ?? '',
        phone: parsed.data.phone ?? '',
        role: parsed.data.role,
        status: parsed.data.status ?? 'active',
        password: parsed.data.password,
        pin: parsed.data.pin ?? '',
        accessStartsAt: parsed.data.accessStartsAt,
        accessEndsAt: parsed.data.accessEndsAt,
        restaurantName: parsed.data.restaurantName,
        paymentReceived: parsed.data.paymentReceived,
        renewalPaymentReceived: parsed.data.renewalPaymentReceived,
        paymentNote: parsed.data.paymentNote,
        paymentAmount: parsed.data.paymentAmount,
        paymentDate: parsed.data.paymentDate,
        renewalAmount: parsed.data.renewalAmount,
        renewalDate: parsed.data.renewalDate,
        createdAt: parsed.data.createdAt,
      })
      savedCount++
    } catch (err) {
      console.error('Failed to upsert staff during sync:', err)
    }
  }
  console.log(`Staff sync: processed ${body.data.staff.length} entries, saved ${savedCount}`)
  return c.json({ staff: (await listUsers(c.env.DB)).map(publicUser) })
})

app.put('/api/v1/admin/staff/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const body = staffUpdateSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid staff payload' }, 400)
  const existingUser = await findUserById(c.env.DB, c.req.param('id'))
  if (!existingUser) return c.json({ error: 'Customer not found' }, 404)
  const user: User = {
    id: c.req.param('id'), tenantId: body.data.tenantId ?? existingUser.tenantId, name: body.data.name,
    email: body.data.email ?? '', phone: body.data.phone ?? '', role: body.data.role,
    status: body.data.status ?? 'active', password: body.data.password ?? '', pin: body.data.pin ?? '',
    accessStartsAt: body.data.accessStartsAt, accessEndsAt: body.data.accessEndsAt,
    restaurantName: body.data.restaurantName, createdAt: body.data.createdAt,
    paymentReceived: body.data.paymentReceived, renewalPaymentReceived: body.data.renewalPaymentReceived,
    paymentNote: body.data.paymentNote,
    paymentAmount: body.data.paymentAmount, paymentDate: body.data.paymentDate,
    renewalAmount: body.data.renewalAmount, renewalDate: body.data.renewalDate,
  }
  await upsertUser(c.env.DB, user)
  c.executionCtx.waitUntil(broadcastStaffUpdated(c.env, user.tenantId, { user: publicUser({ ...existingUser, ...user }) }))
  c.executionCtx.waitUntil(sendCustomerChangeAlert(c.env, 'updated', { ...existingUser, ...user }).catch((error) => {
    console.error('Customer update alert failed:', error)
  }))
  return c.json({ user: publicUser({ ...existingUser, ...user }) })
})

app.delete('/api/v1/admin/staff/:id', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding is not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response

  const userId = c.req.param('id')
  if (userId === 'usr_super_admin') return c.json({ error: 'The platform admin account cannot be deleted' }, 400)

  const target = await findUserById(c.env.DB, userId)
  if (!target) return c.json({ error: 'Account not found' }, 404)
  if (target.tenantId === 'platform') return c.json({ error: 'Platform accounts cannot be deleted here' }, 400)

  const scope = new URL(c.req.url).searchParams.get('scope') === 'user' ? 'user' : 'tenant'
  if (scope === 'tenant') {
    await deleteTenantData(c.env, target.tenantId)
  } else {
    await deleteUserOnly(c.env.DB, userId)
  }

  c.executionCtx.waitUntil(broadcastStaffUpdated(c.env, target.tenantId, { deletedUserId: userId, tenantId: target.tenantId, scope }))
  c.executionCtx.waitUntil(sendCustomerChangeAlert(c.env, 'deleted', target).catch((error) => {
    console.error('Customer delete alert failed:', error)
  }))
  return c.json({ ok: true, deletedUserId: userId, tenantId: target.tenantId, scope })
})

// ---- Admin: Toggle customer status (active/halted/inactive) ----
app.put('/api/v1/admin/staff/:id/status', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const userId = c.req.param('id')
  if (userId === 'usr_super_admin') return c.json({ error: 'Cannot change platform admin status' }, 400)
  const body = z.object({ status: z.enum(['active', 'inactive', 'halted']) }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Invalid status' }, 400)
  const now = new Date().toISOString()
  await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind(body.data.status, now, userId).run()
  const user = await findUserById(c.env.DB, userId)
  if (user) c.executionCtx.waitUntil(sendCustomerChangeAlert(c.env, 'updated', user).catch(() => {}))
  return c.json({ ok: true, status: body.data.status })
})

// ---- Admin: Change customer password ----
app.put('/api/v1/admin/staff/:id/password', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const userId = c.req.param('id')
  const body = z.object({ password: z.string().min(1) }).safeParse(await c.req.json())
  if (!body.success) return c.json({ error: 'Password required' }, 400)
  const hash = await normalizeSecretForStorage(body.data.password)
  const now = new Date().toISOString()
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(hash, now, userId).run()
  return c.json({ ok: true, password: body.data.password })
})

// ---- Admin: Download customer cloud data as JSON ----
app.get('/api/v1/admin/staff/:id/data', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const userId = c.req.param('id')
  const user = await findUserById(c.env.DB, userId)
  if (!user) return c.json({ error: 'Customer not found' }, 404)
  const outletId = `out_${user.tenantId}`
  const snapshot = await readSnapshotRow(c.env.DB, outletId)
  return c.json({
    customer: publicUser(user),
    snapshot: snapshot ? { tenantId: snapshot.tenantId, updatedAt: snapshot.updatedAt, payload: snapshot.payload } : null,
  })
})

// ---- Admin: Delete customer cloud data only (keep account) ----
app.delete('/api/v1/admin/staff/:id/data', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const userId = c.req.param('id')
  const user = await findUserById(c.env.DB, userId)
  if (!user) return c.json({ error: 'Customer not found' }, 404)
  const outletId = `out_${user.tenantId}`
  const scopedTables = ['restaurant_tables','floors','stations','menu_items','menu_categories','inventory_items','payments','kot_items','kots','order_items','orders','audit_logs','print_settings','app_snapshots']
  for (const table of scopedTables) {
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE outlet_id = ?`).bind(outletId).run()
  }
  await clearRealtimeOutlet(c.env, outletId)
  return c.json({ ok: true, outletId })
})

// ---- Admin: Manually send renewal alert to a single customer ----
app.post('/api/v1/admin/staff/:id/alert', async (c) => {
  if (!c.env.DB) return c.json({ error: 'Database binding not configured' }, 500)
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const userId = c.req.param('id')
  const user = await findUserById(c.env.DB, userId)
  if (!user) return c.json({ error: 'Customer not found' }, 404)
  try {
    await sendCustomerChangeAlert(c.env, 'updated', user)
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ error: 'Alert failed: ' + (err?.message || 'unknown') }, 500)
  }
})

// ---- Admin: Trigger renewal digest manually ----
app.post('/api/v1/admin/send-renewal-alerts', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  try {
    await sendRenewalDigest(c.env)
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ error: 'Digest failed: ' + (err?.message || 'unknown') }, 500)
  }
})

// ---- Admin: Test email configuration ----
app.post('/api/v1/admin/test-email', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  try {
    const result = await sendAlertEmail(c.env, 'BhojPatra - Test Email', '<h2>Email configuration is working!</h2>', 'Email configuration is working!')
    return c.json({ ok: true, sent: result })
  } catch (err: any) {
    return c.json({ error: 'Test failed: ' + (err?.message || 'unknown') }, 500)
  }
})

// ---- Admin: Get email configuration status ----
app.get('/api/v1/admin/email-config', async (c) => {
  const auth = await getPlatformAdmin(c)
  if ('response' in auth) return auth.response
  const recipients = parseAlertRecipients(c.env.ALERT_TO_EMAIL)
  const inbox = await getCachedAgentMailInbox(c.env)
  return c.json({
    configured: !!(c.env.AGENTMAIL_API_KEY && recipients.valid.length > 0),
    provider: 'agentmail',
    from: inbox?.inboxId || c.env.AGENTMAIL_INBOX_ID || '(auto-created on first send)',
    to: recipients.valid,
    invalidTo: recipients.invalid,
    replyTo: c.env.ALERT_REPLY_TO_EMAIL || '(not set)',
  })
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack }))
  return c.json({ error: 'Internal server error' }, 500)
})

app.route('/api/v1/orders', ordersRouter)
app.route('/api/v1/kots', kotsRouter)
app.route('/api/v1/payments', paymentsRouter)
// Reuse the main login verifier (including PBKDF2 and current access rules) for
// history/bootstrap, instead of the legacy router's older password verifier.
app.use('/api/v1/state/*', async (c, next) => {
  const auth = await getAuthenticatedUser(c)
  if ('response' in auth) return auth.response
  ;(c as any).set('user', { tenant_id: auth.user.tenantId, role: auth.user.role, id: auth.user.id })
  await next()
})
app.route('/api/v1/state', stateRouter)

async function runScheduledDataMaintenance(env: Bindings) {
  if (!env.DB) return
  const startedAt = new Date().toISOString()
  const claim = await env.DB.prepare(`
    INSERT INTO sync_maintenance (id, last_started_at, last_error)
    VALUES ('daily', ?, NULL)
    ON CONFLICT(id) DO UPDATE SET last_started_at = excluded.last_started_at, last_error = NULL
    WHERE COALESCE(substr(sync_maintenance.last_completed_at, 1, 10), '') < substr(excluded.last_started_at, 1, 10)
      AND (sync_maintenance.last_started_at IS NULL OR sync_maintenance.last_started_at < ?)
  `).bind(startedAt, new Date(Date.now() - 10 * 60_000).toISOString()).run()
  if (!claim.meta.changes) return
  try {
    const retention = await runDailySyncMaintenance(env.DB)
    const compaction = env.R2
      ? await compactLegacyAppSnapshots(env.DB, env.R2, 1)
      : { compacted: 0, skipped: 0, remainingMayExist: false }
    const legacy = env.R2
      ? await migrateLegacySnapshotHistory(env.DB, env.R2, 1)
      : { migrated: 0, remainingMayExist: false }
    const completedAt = new Date().toISOString()
    await env.DB.prepare(`
      UPDATE sync_maintenance
      SET last_completed_at = ?, changes_deleted = ?, batches_deleted = ?,
        conflicts_deleted = ?, legacy_backups_migrated = legacy_backups_migrated + ?, last_error = NULL
      WHERE id = 'daily'
    `).bind(
      completedAt,
      retention.changesDeleted,
      retention.batchesDeleted,
      retention.conflictsDeleted,
      legacy.migrated,
    ).run()
    console.log(JSON.stringify({ event: 'daily_data_maintenance_completed', ...retention, ...compaction, ...legacy, completedAt }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await env.DB.prepare("UPDATE sync_maintenance SET last_error = ? WHERE id = 'daily'").bind(message).run()
    console.error(JSON.stringify({ event: 'daily_data_maintenance_failed', error: message }))
    throw error
  }
}

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(sendRenewalDigest(env).catch((error) => {
      console.error('Renewal digest failed:', error)
    }))
    ctx.waitUntil(runScheduledDataMaintenance(env))
  },
}
