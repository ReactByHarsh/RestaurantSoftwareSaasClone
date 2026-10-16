import { useMemo, useState } from 'react'
import { BarChart3, Pencil, Plus, Receipt, Trash2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Expense, ExpensePaymentMode, ExpenseType } from '../../lib/types'
import { formatPaise } from '../../lib/money'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'

const EXPENSE_TYPES: Array<{ value: ExpenseType; label: string }> = [
  { value: 'salary', label: 'Salary' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'transport', label: 'Transport' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
  { value: 'other', label: 'Other' },
]
const PAYMENT_MODES: Array<{ value: ExpensePaymentMode; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]
const FIELD_CLASS = 'w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10'

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function monthKey(date: string) { return date.slice(0, 7) }

export default function ExpenseScreen() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useBillingStore()
  const addToast = useUIStore((state) => state.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [fromDate, setFromDate] = useState(localDate())
  const [toDate, setToDate] = useState(localDate())
  const [typeFilter, setTypeFilter] = useState<ExpenseType | 'all'>('all')

  const filtered = useMemo(() => expenses
    .filter(expense => expense.expenseDate >= fromDate && expense.expenseDate <= toDate)
    .filter(expense => typeFilter === 'all' || expense.type === typeFilter)
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt)), [expenses, fromDate, toDate, typeFilter])
  const totalPaise = filtered.reduce((sum, expense) => sum + expense.amountPaise, 0)
  const dailyData = useMemo(() => {
    const values = new Map<string, number>()
    filtered.forEach(expense => values.set(expense.expenseDate, (values.get(expense.expenseDate) ?? 0) + expense.amountPaise))
    return Array.from(values.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, amountPaise]) => ({ date: date.slice(5), amountPaise }))
  }, [filtered])
  const monthlyData = useMemo(() => {
    const values = new Map<string, number>()
    filtered.forEach(expense => values.set(monthKey(expense.expenseDate), (values.get(monthKey(expense.expenseDate)) ?? 0) + expense.amountPaise))
    return Array.from(values.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, amountPaise]) => ({ month, amountPaise }))
  }, [filtered])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (expense: Expense) => { setEditing(expense); setModalOpen(true) }
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const description = String(data.get('description') ?? '').trim()
    const amount = Number(data.get('amount') ?? 0)
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      addToast('error', 'Enter an expense description and amount')
      return
    }
    const input = {
      expenseDate: String(data.get('expenseDate') ?? localDate()),
      type: String(data.get('type') ?? 'miscellaneous') as ExpenseType,
      description,
      amountPaise: Math.round(amount * 100),
      paymentMode: String(data.get('paymentMode') ?? 'cash') as ExpensePaymentMode,
      referenceNo: String(data.get('referenceNo') ?? '').trim() || undefined,
      notes: String(data.get('notes') ?? '').trim() || undefined,
    }
    if (editing) {
      updateExpense(editing.id, input)
      addToast('success', 'Expense updated')
    } else {
      addExpense(input)
      addToast('success', 'Expense saved')
    }
    setModalOpen(false)
    setEditing(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Receipt className="text-primary" size={21} /><div><h1 className="text-xl font-black text-slate-800">Expenses</h1><p className="text-xs font-bold text-slate-500">Salary, rent, utilities, and miscellaneous expenses</p></div></div>
        <button onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-primary-dark"><Plus size={16} /> Add Expense</button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-sm">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">From<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={`${FIELD_CLASS} mt-1 w-40`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">To<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={`${FIELD_CLASS} mt-1 w-40`} /></label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value as ExpenseType | 'all')} className={`${FIELD_CLASS} mt-1 w-48`}><option value="all">All expense types</option>{EXPENSE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <div className="ml-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Total expenses</p><p className="text-xl font-black text-rose-800">{formatPaise(totalPaise)}</p></div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Daily expenses"><ResponsiveContainer width="100%" height="100%"><BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => [formatPaise(value), 'Expenses']} /><Bar dataKey="amountPaise" fill="#F43F5E" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Monthly expenses"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={value => `₹${value / 100}`} /><Tooltip formatter={(value: number) => [formatPaise(value), 'Expenses']} /><Bar dataKey="amountPaise" fill="#8B5CF6" radius={[5, 5, 0, 0]} isAnimationActive /></BarChart></ResponsiveContainer></ChartCard>
        </div>

        <div className="overflow-auto rounded-2xl border-2 border-slate-100 bg-white shadow-sm"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['Date', 'Type', 'Description', 'Payment', 'Reference', 'Amount', 'Action'].map(label => <th key={label} className="border-b border-slate-200 px-3 py-3 font-black">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center font-bold text-slate-400">No expenses for this range.</td></tr> : filtered.map(expense => <tr key={expense.id} className="hover:bg-slate-50"><td className="px-3 py-2 font-bold text-slate-600">{expense.expenseDate}</td><td className="px-3 py-2 font-black text-slate-700">{EXPENSE_TYPES.find(type => type.value === expense.type)?.label ?? expense.type}</td><td className="px-3 py-2 font-bold text-slate-800">{expense.description}{expense.notes && <span className="block text-[10px] text-slate-400">{expense.notes}</span>}</td><td className="px-3 py-2 font-bold uppercase text-slate-500">{expense.paymentMode}</td><td className="px-3 py-2 font-bold text-slate-500">{expense.referenceNo || '-'}</td><td className="px-3 py-2 text-right font-black text-rose-700">{formatPaise(expense.amountPaise)}</td><td className="px-3 py-2"><div className="flex gap-1"><button onClick={() => openEdit(expense)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={14} /></button><button onClick={() => { if (window.confirm('Delete this expense?')) { deleteExpense(expense.id); addToast('success', 'Expense deleted') } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>
      </div>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><form onSubmit={save} className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-900">{editing ? 'Edit Expense' : 'Add Expense'}</h2><p className="text-xs font-bold text-slate-500">Record a business or miscellaneous expense.</p></div><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg bg-slate-100 p-2 text-slate-500"><X size={17} /></button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Date<input name="expenseDate" type="date" required defaultValue={editing?.expenseDate ?? localDate()} className={`${FIELD_CLASS} mt-1`} /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Expense type<select name="type" defaultValue={editing?.type ?? 'miscellaneous'} className={`${FIELD_CLASS} mt-1`}>{EXPENSE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500 sm:col-span-2">Description<input name="description" required defaultValue={editing?.description} placeholder="e.g. Staff salary, gas cylinder, repair" className={`${FIELD_CLASS} mt-1`} /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Amount (₹)<input name="amount" required type="number" min="0.01" step="0.01" defaultValue={editing ? (editing.amountPaise / 100).toFixed(2) : ''} className={`${FIELD_CLASS} mt-1`} /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Payment mode<select name="paymentMode" defaultValue={editing?.paymentMode ?? 'cash'} className={`${FIELD_CLASS} mt-1`}>{PAYMENT_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Reference no.<input name="referenceNo" defaultValue={editing?.referenceNo} placeholder="Optional" className={`${FIELD_CLASS} mt-1`} /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Notes<input name="notes" defaultValue={editing?.notes} placeholder="Optional note" className={`${FIELD_CLASS} mt-1`} /></label></div><button type="submit" className="w-full rounded-xl bg-primary py-2.5 text-sm font-black text-white hover:bg-primary-dark">{editing ? 'Save Changes' : 'Save Expense'}</button></form></div>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="h-64 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm"><div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><BarChart3 size={16} className="text-primary" />{title}</div><div className="h-52">{children}</div></div>
}
