import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BellRing,
  Clock3,
  IndianRupee,
  LayoutGrid,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Users,
  Wifi,
} from 'lucide-react'
import { clsx } from 'clsx'
import { runCloudLogin } from '../../lib/cloudSync'
import { formatPaise } from '../../lib/money'
import type { KOT, Order, RestaurantTable, TableStatus } from '../../lib/types'
import { useAuthStore } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'

const LIVE_TABLE_STYLES: Record<TableStatus, string> = {
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  occupied: 'border-blue-200 bg-blue-50 text-blue-700',
  kot_sent: 'border-amber-200 bg-amber-50 text-amber-700',
  preparing: 'border-orange-200 bg-orange-50 text-orange-700',
  ready: 'border-teal-200 bg-teal-50 text-teal-700',
  bill_requested: 'border-violet-200 bg-violet-50 text-violet-700',
  payment_pending: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  reserved: 'border-slate-200 bg-slate-100 text-slate-700',
  dirty: 'border-rose-200 bg-rose-50 text-rose-700',
}

function formatClock(value?: string) {
  if (!value) return 'Just now'
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function formatSince(value?: string) {
  if (!value) return 'No recent sync'
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (diffMinutes < 1) return 'Synced now'
  if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  return `Synced ${hours}h ${minutes}m ago`
}

function buildTablePreview(table: RestaurantTable, orders: Order[]) {
  const order = table.activeOrderId ? orders.find((candidate) => candidate.id === table.activeOrderId) : undefined
  return {
    table,
    order,
    amount: order ? formatPaise(order.totalPaise) : 'Ready',
    captain: order?.captainName || 'Unassigned',
    updatedAt: order?.updatedAt || order?.createdAt,
  }
}

function compareNewest(first?: string, second?: string) {
  return new Date(second || 0).getTime() - new Date(first || 0).getTime()
}

export default function OwnerScreen() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useUIStore()
  const {
    outlet,
    cloudSync,
    tables,
    orders,
    kots,
    payments,
    getTodaySummary,
    updateCloudSyncSettings,
  } = useBillingStore()
  const [refreshing, setRefreshing] = useState(false)

  const summary = getTodaySummary()
  const activeOrders = useMemo(
    () => orders.filter((order) => !['paid', 'cancelled', 'void'].includes(order.status)),
    [orders]
  )
  const activeKots = useMemo(
    () => kots.filter((kot) => kot.status !== 'served' && kot.status !== 'cancelled'),
    [kots]
  )
  const paidToday = useMemo(
    () => payments.filter((payment) => payment.status === 'success' && payment.createdAt.startsWith(new Date().toISOString().slice(0, 10))),
    [payments]
  )

  const tableStatusCounts = useMemo(() => {
    const counts = new Map<TableStatus, number>()
    tables.forEach((table) => {
      counts.set(table.status, (counts.get(table.status) ?? 0) + 1)
    })
    return [
      { key: 'available', label: 'Available', value: counts.get('available') ?? 0 },
      { key: 'occupied', label: 'Occupied', value: counts.get('occupied') ?? 0 },
      { key: 'preparing', label: 'Preparing', value: (counts.get('kot_sent') ?? 0) + (counts.get('preparing') ?? 0) },
      { key: 'ready', label: 'Ready', value: counts.get('ready') ?? 0 },
      { key: 'payment_pending', label: 'Payment Due', value: (counts.get('bill_requested') ?? 0) + (counts.get('payment_pending') ?? 0) },
    ]
  }, [tables])

  const captainCards = useMemo(() => {
    const map = new Map<string, { name: string; runningOrders: number; readyKots: number; runningKots: number; valuePaise: number }>()
    activeOrders.forEach((order) => {
      const key = order.captainUserId || order.captainName || 'unassigned'
      const bucket = map.get(key) || {
        name: order.captainName || 'Unassigned',
        runningOrders: 0,
        readyKots: 0,
        runningKots: 0,
        valuePaise: 0,
      }
      bucket.runningOrders += 1
      bucket.valuePaise += order.totalPaise
      map.set(key, bucket)
    })
    activeKots.forEach((kot) => {
      const key = kot.createdByUserId || kot.captainName || 'unassigned'
      const bucket = map.get(key) || {
        name: kot.captainName || 'Unassigned',
        runningOrders: 0,
        readyKots: 0,
        runningKots: 0,
        valuePaise: 0,
      }
      if (kot.status === 'ready') bucket.readyKots += 1
      else bucket.runningKots += 1
      map.set(key, bucket)
    })
    return Array.from(map.values()).sort((left, right) => right.valuePaise - left.valuePaise).slice(0, 5)
  }, [activeKots, activeOrders])

  const tablePreview = useMemo(
    () => tables
      .map((table) => buildTablePreview(table, orders))
      .sort((left, right) => {
        const rightOpen = right.order ? 1 : 0
        const leftOpen = left.order ? 1 : 0
        if (rightOpen !== leftOpen) return rightOpen - leftOpen
        return left.table.name.localeCompare(right.table.name, undefined, { numeric: true })
      }),
    [orders, tables]
  )

  const liveFeed = useMemo(() => {
    const orderFeed = activeOrders.map((order) => ({
      id: `order-${order.id}`,
      title: `${order.orderNo} ${order.tableName ? `• Table ${order.tableName}` : ''}`.trim(),
      subtitle: `${order.captainName || 'Unassigned'} • ${formatPaise(order.totalPaise)}`,
      time: order.updatedAt || order.createdAt,
      badge: order.status.replace(/_/g, ' '),
      tone: 'order' as const,
    }))
    const kotFeed = activeKots.map((kot: KOT) => ({
      id: `kot-${kot.id}`,
      title: `${kot.kotNo} ${kot.tableName ? `• ${kot.tableName}` : ''}`.trim(),
      subtitle: `${kot.captainName || 'Captain'} • ${kot.items.length} items`,
      time: kot.createdAt,
      badge: kot.status.replace(/_/g, ' '),
      tone: 'kot' as const,
    }))
    return [...orderFeed, ...kotFeed].sort((left, right) => compareNewest(left.time, right.time)).slice(0, 8)
  }, [activeKots, activeOrders])

  const paymentMix = useMemo(() => {
    const totals = new Map<string, number>()
    paidToday.forEach((payment) => {
      totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.amountPaise)
    })
    const totalCollected = Array.from(totals.values()).reduce((sum, value) => sum + value, 0)
    return Array.from(totals.entries())
      .map(([method, amount]) => ({
        method: method.toUpperCase(),
        amount,
        share: totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0,
      }))
      .sort((left, right) => right.amount - left.amount)
  }, [paidToday])

  const refreshCloudData = async (showToast: boolean) => {
    if (!user || !cloudSync.enabled || !cloudSync.serverUrl || !cloudSync.accountLogin || !cloudSync.accountSecret) {
      if (showToast) addToast('warning', 'Cloud sync is not configured for this outlet', 'Owner Live')
      return
    }
    setRefreshing(true)
    try {
      const session = await runCloudLogin(cloudSync.serverUrl, cloudSync.accountLogin, cloudSync.accountSecret)
      const tenantId = session.user.tenantId
      const outletId = session.outlets[0]?.id || `out_${tenantId}`
      updateCloudSyncSettings({
        enabled: true,
        tenantId,
        outletId,
        cloudMode: 'delta_v2',
        lastCloudDownloadedAt: new Date().toISOString(),
      })
      if (showToast) addToast('success', 'Cloud account verified. Desktop data remains local source of truth.', 'Owner Snapshot')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Cloud check failed', 'Owner Snapshot')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!user || !['owner', 'admin', 'manager'].includes(user.role)) return
    void refreshCloudData(false)
  }, [user?.id])

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_18%,#f8fafc_48%,#ffffff_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:px-4 lg:px-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-slate-950 text-white shadow-[0_25px_80px_rgba(15,23,42,0.26)]">
          <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1.3fr_0.9fr] lg:px-8 lg:py-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-200">
                  <Activity size={14} />
                  Live owner view
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-white/70">
                  <Wifi size={14} className="text-emerald-300" />
                  LAN realtime source
                </span>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <img src="/brand-icon-clean.webp" alt="BhojPatra" className="h-14 w-14 rounded-2xl bg-white/10 p-1.5 shadow-lg" />
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-200">{outlet.name}</p>
                  <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                    Owner dashboard for tables, captain flow, and live sales.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/75">
                    This desktop view reads local live restaurant data. Cloud receives versioned order deltas every 24 hours and after checkout.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => void refreshCloudData(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={clsx(refreshing && 'animate-spin')} />
                  {refreshing ? 'Checking cloud...' : 'Check cloud account'}
                </button>
                <button
                  onClick={() => navigate('/app/tables')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/14"
                >
                  <LayoutGrid size={16} />
                  Open table control
                </button>
                <button
                  onClick={() => navigate('/app/reports')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/14"
                >
                  <ReceiptText size={16} />
                  View reports
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/45">LAN live summary</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/8 p-3">
                    <p className="text-[11px] font-bold text-white/60">Open orders</p>
                    <p className="mt-2 text-2xl font-black">{activeOrders.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 p-3">
                    <p className="text-[11px] font-bold text-white/60">Active KOTs</p>
                    <p className="mt-2 text-2xl font-black">{activeKots.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 p-3">
                    <p className="text-[11px] font-bold text-white/60">Running tables</p>
                    <p className="mt-2 text-2xl font-black">{summary.openTableCount}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 p-3">
                    <p className="text-[11px] font-bold text-white/60">Last sync</p>
                    <p className="mt-2 text-sm font-black text-emerald-200">{formatSince(cloudSync.lastSyncedAt)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-emerald-300/18 bg-gradient-to-br from-emerald-400/14 to-cyan-400/10 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-100/80">Today collected</p>
                <p className="mt-3 text-3xl font-black text-white">{formatPaise(summary.totalSalesPaise)}</p>
                <p className="mt-2 text-sm font-semibold text-white/70">{summary.orderCount} paid orders and {paidToday.length} successful payments received today.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: IndianRupee, label: 'Revenue today', value: formatPaise(summary.totalSalesPaise), tone: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { icon: ShoppingBag, label: 'Open orders', value: String(activeOrders.length), tone: 'text-blue-600 bg-blue-50 border-blue-100' },
            { icon: BellRing, label: 'Kitchen tickets', value: String(activeKots.length), tone: 'text-amber-600 bg-amber-50 border-amber-100' },
            { icon: Users, label: 'Captain logins live', value: String(captainCards.length), tone: 'text-violet-600 bg-violet-50 border-violet-100' },
          ].map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              <div className={clsx('inline-flex rounded-2xl border p-2.5', tone)}>
                <Icon size={18} />
              </div>
              <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Table preview</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">Live floor status</h2>
              </div>
              <button onClick={() => navigate('/app/tables')} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">
                Manage
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {tableStatusCounts.map((item) => (
                <div key={item.key} className="min-w-[118px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tablePreview.length === 0 ? (
                <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500">
                  Add tables from the admin panel to see the owner snapshot here.
                </div>
              ) : tablePreview.map(({ table, order, amount, captain, updatedAt }) => (
                <button
                  key={table.id}
                  onClick={() => navigate('/app/tables')}
                  className="rounded-[24px] border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-black text-slate-900">{table.name}</p>
                      <p className="text-xs font-bold text-slate-400">{table.seats} seats</p>
                    </div>
                    <span className={clsx('rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]', LIVE_TABLE_STYLES[table.status])}>
                      {table.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-black text-slate-800">{order ? order.orderNo : 'No active order'}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Captain</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{captain}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{order ? 'Bill value' : 'Status'}</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{amount}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-500">
                    <span>{order ? order.status.replace(/_/g, ' ') : 'Available'}</span>
                    <span>{formatClock(updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Activity feed</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">What is happening now</h2>
                </div>
                <Clock3 size={18} className="text-slate-400" />
              </div>
              <div className="mt-4 space-y-3">
                {liveFeed.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                    Live orders and KOTs will appear here after the first captain action.
                  </div>
                ) : liveFeed.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{entry.title}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{entry.subtitle}</p>
                      </div>
                      <span className={clsx(
                        'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                        entry.tone === 'order' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {entry.badge}
                      </span>
                    </div>
                    <p className="mt-3 text-[11px] font-bold text-slate-400">{formatClock(entry.time)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Captain use</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">Multiple staff logins</h2>
              <div className="mt-4 space-y-3">
                {captainCards.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                    Captains will show here as soon as they sign in and send KOTs from their phones.
                  </div>
                ) : captainCards.map((captain) => (
                  <div key={captain.name} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{captain.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{captain.runningOrders} running orders • {captain.runningKots + captain.readyKots} live KOTs</p>
                      </div>
                      <p className="text-sm font-black text-slate-900">{formatPaise(captain.valuePaise)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Payment split</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">Collected today</h2>
              <div className="mt-4 space-y-3">
                {paymentMix.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                    Payment methods appear here after the first paid order.
                  </div>
                ) : paymentMix.map((entry) => (
                  <div key={entry.method}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-black text-slate-600">
                      <span>{entry.method}</span>
                      <span>{formatPaise(entry.amount)} • {entry.share}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500" style={{ width: `${entry.share}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
