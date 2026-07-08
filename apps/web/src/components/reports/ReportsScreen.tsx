import { useState } from 'react'
import { BarChart3, TrendingUp, IndianRupee, Users, ShoppingBag, FileText, Calendar } from 'lucide-react'
import { formatPaise } from '../../lib/money'
import { useBillingStore } from '../../store/billingStore'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts'
import { clsx } from 'clsx'
import BusinessSummaryReport from './BusinessSummaryReport'
import SalesSummaryReport from './SalesSummaryReport'

type DateRange = 'today' | 'week' | 'month' | 'custom'

const COLORS = ['#2563EB', '#F97316', '#8B5CF6', '#06B6D4']

export default function ReportsScreen() {
  const [tab, setTab] = useState<'overview' | 'summary' | 'sales'>('sales')
  const [dateRange, setDateRange] = useState<DateRange>('today')
  
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  const [customFrom, setCustomFrom] = useState(todayStr)
  const [customTo, setCustomTo] = useState(todayStr)

  const summary = useBillingStore(s => s.getTodaySummary())
  const orders = useBillingStore(s => s.orders)

  const paymentData = [
    { name: 'Cash', value: summary.paymentModes.find(m => m.method === 'cash')?.amountPaise || 0 },
    { name: 'UPI', value: summary.paymentModes.find(m => m.method === 'upi')?.amountPaise || 0 },
    { name: 'Card', value: summary.paymentModes.find(m => m.method === 'card')?.amountPaise || 0 },
  ].filter(d => d.value > 0)

  const topItems = summary.topItems
  const recentOrders = orders.filter(order => order.paymentStatus === 'paid').slice(0, 5)

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b-2 border-slate-100 px-4 py-2 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="text-primary">
            <BarChart3 size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">Reports & Analytics</h1>
            <p className="text-xs font-bold text-slate-500 mt-0.5">Business performance overview</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setTab('sales')}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5',
                tab === 'sales' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              )}
            >
              <ShoppingBag size={14} /> Sales Summary
            </button>
            <button
              onClick={() => setTab('overview')}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5',
                tab === 'overview' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              )}
            >
              <BarChart3 size={14} /> Overview
            </button>
            <button
              onClick={() => setTab('summary')}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5',
                tab === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              )}
            >
              <FileText size={14} /> Business Summary
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-2 py-1 bg-white focus-within:border-primary/50 transition-colors">
              <Calendar size={14} className="text-slate-400" />
              <div className="flex items-center gap-1">
                <input 
                  type="date" 
                  className="text-xs font-bold text-slate-700 outline-none bg-transparent w-24"
                  value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setDateRange('custom'); }}
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="date" 
                  className="text-xs font-bold text-slate-700 outline-none bg-transparent w-24"
                  value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setDateRange('custom'); }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {tab === 'sales' ? (
          <SalesSummaryReport fromDate={customFrom} toDate={customTo} />
        ) : tab === 'summary' ? (
          <BusinessSummaryReport fromDate={customFrom} toDate={customTo} />
        ) : (
          <>
            {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col group hover:border-emerald-200 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <IndianRupee size={16} strokeWidth={3} className="text-emerald-500 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Total Revenue</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{formatPaise(summary.totalSalesPaise)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Settled bills</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col group hover:border-blue-200 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <ShoppingBag size={16} strokeWidth={3} className="text-blue-500 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Total Orders</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{summary.orderCount}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Completed orders</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col group hover:border-purple-200 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <TrendingUp size={16} strokeWidth={3} className="text-purple-500 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Avg Order Value</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{formatPaise(summary.avgOrderValuePaise)}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Consistent weekly</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col group hover:border-amber-200 transition-colors">
            <div className="flex items-center gap-2 text-slate-500 mb-2">
              <Users size={16} strokeWidth={3} className="text-amber-500 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Open Tables</span>
            </div>
            <p className="text-2xl font-black text-slate-800 tracking-tighter">{summary.openTableCount}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Occupied</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Chart */}
          <div className="lg:col-span-2 bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-black text-slate-800 tracking-tight mb-4">Hourly Revenue (₹)</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.hourlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 'bold' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 'bold' }} tickFormatter={(val) => `₹${val/100}`} />
                  <Tooltip
                    cursor={{ fill: '#F1F5F9' }}
                    formatter={(value: number) => [formatPaise(value), 'Revenue']}
                    labelStyle={{ color: '#2563EB', fontWeight: 'bold', fontSize: 12 }}
                    contentStyle={{ borderRadius: '0.5rem', border: '2px solid #E2E8F0', padding: '8px', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="sales" fill="#2563EB" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payment Split */}
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col">
            <h3 className="text-sm font-black text-slate-800 tracking-tight mb-2">Payment Methods</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.1" />
                    </filter>
                  </defs>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={true}
                    cornerRadius={6}
                    filter="url(#shadow)"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [formatPaise(value), 'Amount']} 
                    contentStyle={{ borderRadius: '0.5rem', border: '2px solid #E2E8F0', padding: '8px', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-auto">
              {paymentData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shadow-inner" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-600 font-bold">{d.name}</span>
                  </div>
                  <span className="font-black text-slate-800 text-sm">{formatPaise(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Items */}
          <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="p-4 border-b-2 border-slate-100">
              <h3 className="text-sm font-black text-slate-800 tracking-tight">Top Selling Items</h3>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50/80 text-slate-500 border-b-2 border-slate-100">
                <tr>
                  <th className="px-4 py-2 font-black uppercase tracking-widest text-[10px]">Item Name</th>
                  <th className="px-4 py-2 font-black uppercase tracking-widest text-[10px] text-right">Qty</th>
                  <th className="px-4 py-2 font-black uppercase tracking-widest text-[10px] text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
              {topItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 font-bold">No item sales yet.</td>
                </tr>
              ) : topItems.map(item => (
                  <tr key={item.name} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-2.5 font-black text-slate-800">{item.name}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-600">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 inline-block min-w-[2rem] text-center">{item.qty}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-primary">{formatPaise(item.revenuePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
            <div className="p-4 border-b-2 border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 tracking-tight">Recent Orders</h3>
            </div>
            <div className="divide-y-2 divide-slate-50 flex-1 overflow-auto max-h-[200px]">
              {recentOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs">No paid orders yet.</div>
              ) : recentOrders.map(order => (
                <div key={order.id} className="p-3 px-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors group">
                  <div>
                    <p className="font-black text-slate-800 text-sm group-hover:text-primary transition-colors">{order.orderNo}</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                      {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {order.tableName && <span className="ml-1.5 px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px]">Table {order.tableName}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-800 text-sm">{formatPaise(order.totalPaise)}</p>
                    <span className={clsx(
                      'text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border inline-block mt-0.5',
                      order.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                    )}>
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  )
}
