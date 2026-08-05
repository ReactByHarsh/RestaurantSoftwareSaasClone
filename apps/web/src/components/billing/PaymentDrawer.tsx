import { useState } from 'react'
import { X, Trash2, Printer, Check } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { clsx } from 'clsx'

interface Props {
  onClose: () => void
}

const TENDER_QUICK_CASH = [100, 500, 1000, 2000]
const TENDER_QUICK_SMALL = [1, 5, 10, 20, 50]

const PAYMENT_MODES = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'account', label: 'Account' },
  { id: 'upi', label: 'UPI' },
  { id: 'paytm', label: 'PayTM' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'aggregator', label: 'Aggregator' },
  { id: 'complementary', label: 'Complementary' },
]

const FAST_PAYMENT_MODES = [
  { id: 'cash', label: 'Cash', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  { id: 'upi', label: 'UPI', className: 'bg-sky-600 hover:bg-sky-700 text-white' },
  { id: 'card', label: 'Card', className: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  { id: 'account', label: 'Account', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
]

export default function PaymentDrawer({ onClose }: Props) {
  const { user } = useAuthStore()
  const { addToast } = useUIStore()
  const { currentOrder, orderItems, cart, outlet, getCartTotal, settlePayment } = useBillingStore()

  const totals = getCartTotal()
  const savedItemCount = currentOrder
    ? orderItems.filter(item => item.orderId === currentOrder.id && item.status !== 'cancelled').length
    : 0
  const hasBillableItems = cart.length > 0 || savedItemCount > 0
  const orderTotal = currentOrder ? currentOrder.totalPaise + totals.total : totals.total
  const finalTotalPaise = orderTotal
  const finalTotal = finalTotalPaise / 100

  const [payments, setPayments] = useState<{ method: string; amount: number; tender: number; returnAmt: number; ref: string }[]>([])
  const [tenderInput, setTenderInput] = useState('')
  const [isSettling, setIsSettling] = useState(false)

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remainingPayable = Math.max(0, finalTotal - totalPaid)
  const currentTender = parseFloat(tenderInput) || 0
  const currentReturn = currentTender > remainingPayable ? currentTender - remainingPayable : 0

  const handleAddTender = (val: number) => {
    setTenderInput((prev) => ((parseFloat(prev) || 0) + val).toString())
  }

  const handleClearTender = () => {
    setTenderInput('')
  }

  const addPaymentMode = (method: string) => {
    if (remainingPayable <= 0) {
      addToast('error', 'Bill is already fully paid.')
      return
    }

    const tender = currentTender > 0 ? currentTender : remainingPayable
    const amount = Math.min(remainingPayable, tender)
    const returnAmt = tender - amount

    setPayments(prev => [...prev, { method, amount, tender, returnAmt, ref: '' }])
    setTenderInput('')
  }

  const removePayment = (idx: number) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  const isPaid = remainingPayable === 0

  const handleSettle = async (printAfter: boolean) => {
    if (!isPaid) {
      addToast('error', `Payment short by ₹${remainingPayable.toFixed(2)}`)
      return
    }
    if (!user || !hasBillableItems) {
      addToast('error', 'Add at least one item before checkout')
      return
    }

    setIsSettling(true)
    try {
      const settled = await settlePayment(
        currentOrder ? currentOrder.id : null,
        payments.map(p => ({ method: p.method, amountPaise: Math.round(p.amount * 100), referenceNo: p.ref || undefined })),
        0,
        user.id,
        user.name,
        printAfter
      )
      if (!settled) {
        addToast('error', 'Checkout could not be completed. Please verify the order and payment total.')
        return
      }
      addToast('success', `Bill settled! ₹${totalPaid.toFixed(2)} collected`)
      onClose()
    } finally {
      setIsSettling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white">
          <h3 className="text-lg font-bold text-slate-800">Payment details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-slate-50/50 space-y-6">
          
          {/* Top Summary Blocks */}
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Net Payable</p>
              <p className="text-2xl font-black text-slate-800">₹ {finalTotal.toFixed(2)}</p>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Remaining Payable</p>
              <p className="text-2xl font-black text-slate-800">₹ {remainingPayable.toFixed(2)}</p>
            </div>
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm relative">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Tender Amount</p>
              <div className="flex justify-center items-center gap-1 text-2xl font-black text-slate-800">
                <span>₹</span>
                <input 
                  type="number" 
                  value={tenderInput} 
                  onChange={e => setTenderInput(e.target.value)} 
                  placeholder="0"
                  className="w-24 text-center outline-none bg-transparent"
                />
              </div>
            </div>
            <button onClick={handleClearTender} className="w-12 h-12 bg-rose-500 hover:bg-rose-600 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors shrink-0">
              <Trash2 size={20} />
            </button>
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Return Amount</p>
              <p className="text-2xl font-black text-slate-800">₹ {currentReturn.toFixed(2)}</p>
            </div>
          </div>

          {/* Quick Tenders */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-bold text-slate-600">Choose Tender:</p>
              <p className="text-[11px] font-bold text-slate-400">Enter partial amount, then tap Cash / UPI / Card for quick split.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TENDER_QUICK_CASH.map(val => (
                <button 
                  key={val} 
                  onClick={() => handleAddTender(val)}
                  className="px-4 py-2 bg-[#FFC000] hover:bg-[#FFD966] text-yellow-900 font-black rounded text-sm shadow-sm transition-colors"
                >
                  ₹ {val}
                </button>
              ))}
              {TENDER_QUICK_SMALL.map(val => (
                <button 
                  key={val} 
                  onClick={() => handleAddTender(val)}
                  className="px-4 py-2 bg-[#00B0F0] hover:bg-[#5DCAFA] text-white font-black rounded text-sm shadow-sm transition-colors"
                >
                  ₹ {val}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FAST_PAYMENT_MODES.filter(mode => mode.id !== 'account' || outlet.enableCreditAccounts).map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => addPaymentMode(mode.id)}
                  disabled={remainingPayable <= 0}
                  className={clsx('rounded-lg px-4 py-2.5 text-sm font-black shadow-sm transition-colors disabled:opacity-40', mode.className)}
                >
                  {currentTender > 0 ? `Add ${mode.label} ${currentTender.toFixed(2)}` : `${mode.label} remaining`}
                </button>
              ))}
            </div>
          </div>

          {/* Payments Table Area */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h4 className="font-bold text-slate-700 text-sm">Payment Breakdown</h4>
              <button 
                onClick={() => {
                  if (remainingPayable <= 0) {
                    addToast('error', 'Bill is already fully paid.')
                    return
                  }
                  const tender = currentTender > 0 ? currentTender : remainingPayable
                  const amount = Math.min(remainingPayable, tender)
                  const returnAmt = tender - amount
                  setPayments(prev => [...prev, { method: 'cash', amount, tender, returnAmt, ref: '' }])
                  setTenderInput('')
                }}
                className="px-3 py-1.5 bg-primary hover:bg-primary-dark text-white font-black rounded text-xs shadow-sm transition-colors"
              >
                + Add Payment
              </button>
            </div>
            
            {payments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm font-medium">
                No payments added. Click "Add Payment" or select a mode below.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="py-2 px-3 text-left font-bold text-slate-500 w-1/3">Mode</th>
                    <th className="py-2 px-3 text-right font-bold text-slate-500">Amount</th>
                    <th className="py-2 px-3 text-right font-bold text-slate-500 hidden sm:table-cell">Tender</th>
                    <th className="py-2 px-3 text-right font-bold text-slate-500 hidden sm:table-cell">Return</th>
                    <th className="py-2 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="py-1.5 px-3">
                        <select 
                          value={p.method}
                          onChange={(e) => {
                            const newMethod = e.target.value;
                            setPayments(prev => prev.map((item, i) => i === idx ? { ...item, method: newMethod } : item))
                          }}
                          className="w-full bg-slate-100 border-none rounded py-1.5 px-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                        >
                          <option value="" disabled>Select mode...</option>
                          {PAYMENT_MODES.map(mode => (
                            <option key={mode.id} value={mode.id}>{mode.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="number"
                          value={p.amount || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setPayments(prev => prev.map((item, i) => {
                              if (i !== idx) return item
                              // If the row was an exact-tender payment, editing its amount
                              // means the cashier is changing the tender itself (for example
                              // Cash remaining -> ₹500), not asking for change.
                              const tender = item.tender === item.amount ? val : item.tender
                              return { ...item, amount: val, tender, returnAmt: Math.max(0, tender - val) }
                            }))
                          }}
                          className="w-full bg-slate-100 border-none rounded py-1.5 px-2 text-sm text-right font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </td>
                      <td className="py-1.5 px-3 hidden sm:table-cell">
                        <input
                          type="number"
                          value={p.tender || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setPayments(prev => prev.map((item, i) => i === idx ? { ...item, tender: val, returnAmt: Math.max(0, val - item.amount) } : item))
                          }}
                          className="w-full bg-slate-100 border-none rounded py-1.5 px-2 text-sm text-right font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right hidden sm:table-cell">
                        <span className="font-bold text-slate-600">{p.returnAmt.toFixed(2)}</span>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <button 
                          onClick={() => removePayment(idx)} 
                          className="w-7 h-7 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center">
          <p className="text-xs font-bold text-slate-500">
            Total Paid: <span className={clsx("text-base", isPaid ? "text-emerald-600 font-black" : "text-slate-800 font-bold")}>₹ {totalPaid.toFixed(2)}</span>
          </p>
          <div className="flex gap-3">
            <button 
              onClick={() => handleSettle(false)} 
              disabled={isSettling || !hasBillableItems || !isPaid || payments.some(p => !p.method)}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Check size={16} />
              {isSettling ? 'SAVING...' : 'CHECKOUT'}
            </button>
            <button 
              onClick={() => handleSettle(true)} 
              disabled={isSettling || !hasBillableItems || !isPaid || payments.some(p => !p.method)}
              className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-black rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Printer size={16} />
              CHECKOUT & PRINT
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
