import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPaise, getBillableOrderTotalPaise } from '../../lib/money'
import { useBillingStore } from '../../store/billingStore'

interface DateProps { fromDate: string; toDate: string }
function inRange(date: string, fromDate: string, toDate: string) { return date >= fromDate && date <= `${toDate}T23:59:59` }
function ChartBox({ title, children }: { title: string; children: React.ReactNode }) { return <div className="h-64 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm"><h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><BarChart3 size={16} className="text-primary" />{title}</h3><div className="h-52">{children}</div></div> }

export function CancellationReport({ fromDate, toDate }: DateProps) {
  const { orders, kots, orderItems, tables } = useBillingStore()
  const data = useMemo(() => {
    const cancelledKots = kots.filter(kot => kot.status === 'cancelled' && inRange(kot.cancelledAt ?? kot.createdAt, fromDate, toDate))
    const cancelledOrders = orders.filter(order => order.status === 'cancelled' && inRange(order.cancelledAt ?? order.updatedAt, fromDate, toDate))
    const tableName = (orderId: string, fallback?: string) => fallback || tables.find(table => table.activeOrderId === orderId)?.name || '-'
    const kotRows = cancelledKots.map(kot => {
      const amountPaise = kot.items.reduce((sum, item) => {
        const orderItem = orderItems.find(candidate => candidate.id === item.orderItemId)
        return sum + (orderItem ? orderItem.unitPricePaise * item.quantity : 0)
      }, 0)
      return { id: kot.id, no: kot.kotNo, orderNo: kot.orderNo, table: kot.tableName || '-', amountPaise, items: kot.items.reduce((sum, item) => sum + item.quantity, 0), reason: kot.cancellationReason || '-', date: (kot.cancelledAt ?? kot.createdAt).slice(0, 10) }
    })
    const billRows = cancelledOrders.map(order => ({ id: order.id, no: order.orderNo, table: tableName(order.id, order.tableName), amountPaise: getBillableOrderTotalPaise(order), reason: order.cancellationReason || '-', date: (order.cancelledAt ?? order.updatedAt).slice(0, 10) }))
    const chart = new Map<string, { date: string; kotAmount: number; billAmount: number; kots: number; bills: number }>()
    kotRows.forEach(row => { const current = chart.get(row.date) ?? { date: row.date.slice(5), kotAmount: 0, billAmount: 0, kots: 0, bills: 0 }; current.kotAmount += row.amountPaise; current.kots += 1; chart.set(row.date, current) })
    billRows.forEach(row => { const current = chart.get(row.date) ?? { date: row.date.slice(5), kotAmount: 0, billAmount: 0, kots: 0, bills: 0 }; current.billAmount += row.amountPaise; current.bills += 1; chart.set(row.date, current) })
    return { kotRows, billRows, chart: Array.from(chart.values()).sort((a, b) => a.date.localeCompare(b.date)) }
  }, [fromDate, toDate, kots, orders, orderItems, tables])
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Cancelled KOTs" value={String(data.kotRows.length)} tone="amber" /><Stat label="KOT amount" value={formatPaise(data.kotRows.reduce((sum, row) => sum + row.amountPaise, 0))} tone="amber" /><Stat label="Cancelled bills" value={String(data.billRows.length)} tone="red" /><Stat label="Bill amount" value={formatPaise(data.billRows.reduce((sum, row) => sum + row.amountPaise, 0))} tone="red" /></div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><ChartBox title="Cancellation amount by day"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => formatPaise(value)} /><Legend /><Bar dataKey="kotAmount" name="KOT" fill="#F59E0B" isAnimationActive /><Bar dataKey="billAmount" name="Bill" fill="#EF4444" isAnimationActive /></BarChart></ResponsiveContainer></ChartBox><ChartBox title="Cancellation count by day"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar dataKey="kots" name="KOTs" fill="#F59E0B" isAnimationActive /><Bar dataKey="bills" name="Bills" fill="#EF4444" isAnimationActive /></BarChart></ResponsiveContainer></ChartBox></div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><ReportTable title="KOT Cancellation Report" headers={['KOT', 'Bill', 'Table', 'Items', 'Amount', 'Date', 'Reason']} rows={data.kotRows.map(row => [row.no, row.orderNo, row.table, row.items, formatPaise(row.amountPaise), row.date, row.reason])} /><ReportTable title="Bill Cancellation Report" headers={['Bill', 'Table', 'Amount', 'Date', 'Reason']} rows={data.billRows.map(row => [row.no, row.table, formatPaise(row.amountPaise), row.date, row.reason])} /></div>
  </div>
}

export function InventoryAnalyticsReport({ fromDate, toDate }: DateProps) {
  const { inventoryItems, menuItems, orders, orderItems } = useBillingStore()
  const data = useMemo(() => {
    const paidOrderIds = new Set(orders.filter(order => order.paymentStatus === 'paid' && order.businessDate >= fromDate && order.businessDate <= toDate).map(order => order.id))
    return inventoryItems.map(item => {
      const menu = menuItems.find(product => product.id === item.menuItemId || product.name.toLowerCase() === item.name.toLowerCase())
      const sold = orderItems.filter(orderItem => orderItem.menuItemId === menu?.id && paidOrderIds.has(orderItem.orderId) && orderItem.status !== 'cancelled').reduce((sum, orderItem) => sum + orderItem.quantity, 0)
      return { name: item.name.length > 18 ? `${item.name.slice(0, 18)}…` : item.name, stockValue: Math.round(item.currentStock * item.costPerUnit), currentStock: item.currentStock, sold }
    }).sort((a, b) => b.stockValue - a.stockValue).slice(0, 12)
  }, [fromDate, toDate, inventoryItems, menuItems, orders, orderItems])
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Stock items" value={String(inventoryItems.length)} tone="primary" /><Stat label="Stock value" value={formatPaise(inventoryItems.reduce((sum, item) => sum + Math.round(item.currentStock * item.costPerUnit), 0))} tone="primary" /><Stat label="Low stock" value={String(inventoryItems.filter(item => item.currentStock > 0 && item.currentStock <= item.minimumStock).length)} tone="amber" /><Stat label="Out of stock" value={String(inventoryItems.filter(item => item.currentStock <= 0).length)} tone="red" /></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><ChartBox title="Inventory value by item"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 30, right: 10 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={value => `₹${value / 100}`} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9 }} /><Tooltip formatter={(value: number) => formatPaise(value)} /><Bar dataKey="stockValue" fill="#10B981" radius={[0, 5, 5, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartBox><ChartBox title="Sold quantity in selected range"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="sold" name="Sold qty" fill="#2563EB" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartBox></div></div>
}

export function ExpenseReport({ fromDate, toDate }: DateProps) {
  const expenses = useBillingStore(state => state.expenses)
  const data = useMemo(() => {
    const filtered = expenses.filter(expense => expense.expenseDate >= fromDate && expense.expenseDate <= toDate)
    const daily = new Map<string, number>()
    const monthly = new Map<string, number>()
    const byType = new Map<string, number>()
    filtered.forEach(expense => { daily.set(expense.expenseDate, (daily.get(expense.expenseDate) ?? 0) + expense.amountPaise); monthly.set(expense.expenseDate.slice(0, 7), (monthly.get(expense.expenseDate.slice(0, 7)) ?? 0) + expense.amountPaise); byType.set(expense.type, (byType.get(expense.type) ?? 0) + expense.amountPaise) })
    return { filtered, daily: Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, amountPaise]) => ({ date: date.slice(5), amountPaise })), monthly: Array.from(monthly.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, amountPaise]) => ({ month, amountPaise })), byType: Array.from(byType.entries()).sort(([, a], [, b]) => b - a).map(([type, amountPaise]) => ({ type, amountPaise })) }
  }, [expenses, fromDate, toDate])
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Stat label="Expense entries" value={String(data.filtered.length)} tone="primary" /><Stat label="Total expenses" value={formatPaise(data.filtered.reduce((sum, expense) => sum + expense.amountPaise, 0))} tone="red" /><Stat label="Average entry" value={formatPaise(data.filtered.length ? Math.round(data.filtered.reduce((sum, expense) => sum + expense.amountPaise, 0) / data.filtered.length) : 0)} tone="amber" /></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><ChartBox title="Daily expense trend"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => formatPaise(value)} /><Bar dataKey="amountPaise" fill="#EF4444" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartBox><ChartBox title="Monthly expense trend"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => formatPaise(value)} /><Bar dataKey="amountPaise" fill="#F97316" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartBox><ChartBox title="Expense type breakdown"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byType}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="type" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => formatPaise(value)} /><Bar dataKey="amountPaise" fill="#8B5CF6" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartBox></div></div>
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'amber' | 'red' }) { return <div className={`rounded-2xl border-2 p-4 shadow-sm ${tone === 'red' ? 'border-rose-100 bg-rose-50' : tone === 'amber' ? 'border-amber-100 bg-amber-50' : 'border-blue-100 bg-blue-50'}`}><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div> }
function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) { return <div className="overflow-auto rounded-2xl border-2 border-slate-100 bg-white shadow-sm"><div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800">{title}</div><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{headers.map(header => <th key={header} className="border-b border-slate-200 px-3 py-2 font-black">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center font-bold text-slate-400">No records found.</td></tr> : rows.map((row, index) => <tr key={index} className="hover:bg-slate-50">{row.map((value, cellIndex) => <td key={cellIndex} className={`px-3 py-2 ${cellIndex === row.length - 1 ? 'font-bold text-slate-500' : 'font-black text-slate-700'}`}>{value}</td>)}</tr>)}</tbody></table></div> }
