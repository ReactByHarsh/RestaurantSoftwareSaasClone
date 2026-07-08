import { useMemo, useState } from 'react'
import { X, Save } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { formatPaise } from '../../lib/money'
import type { Order, PaymentMethod } from '../../lib/types'

interface Props {
  order: Order
  onClose: () => void
}

const CREDIT_PAYMENT_METHODS = new Set<PaymentMethod>(['account', 'due'])

export default function AddPaymentModal({ order, onClose }: Props) {
  const { addPayment, payments } = useBillingStore()
  const { user } = useAuthStore()
  const { addToast } = useUIStore()

  const paidPaise = useMemo(() => payments
    .filter(payment => payment.orderId === order.id && payment.status === 'success' && !CREDIT_PAYMENT_METHODS.has(payment.method))
    .reduce((sum, payment) => sum + payment.amountPaise, 0),
    [order.id, payments]
  )
  const pendingAmt = Math.max(0, order.totalPaise - paidPaise)
  
  const [method, setMethod] = useState<PaymentMethod | ''>('cash')
  const [amountInput, setAmountInput] = useState((Math.max(0, pendingAmt) / 100).toString())

  const handleSave = () => {
    if (!method) {
      addToast('error', 'Please select a payment mode')
      return
    }

    const amtPaise = Math.round(parseFloat(amountInput) * 100)
    if (isNaN(amtPaise) || amtPaise <= 0) {
      addToast('error', 'Please enter a valid amount')
      return
    }

    if (amtPaise > pendingAmt) {
      addToast('error', `Amount cannot exceed pending ${formatPaise(pendingAmt)}`)
      return
    }

    if (pendingAmt <= 0) {
      addToast('error', 'This bill has no pending amount')
      return
    }

    if (!user) {
      addToast('error', 'Not logged in')
      return
    }

    addPayment(order.id, { method, amountPaise: amtPaise, referenceNo: '' }, user.id)
    addToast('success', 'Payment added successfully')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden bg-white shadow-2xl flex flex-col rounded-sm">
        <div className="bg-white flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 text-lg">Enter receipt details</h3>
          <button onClick={onClose} className="hover:bg-slate-100 p-1 rounded transition-colors text-slate-500"><X size={18} /></button>
        </div>
        
        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold text-slate-700 whitespace-nowrap w-32">Payment mode:</label>
            <select 
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
            >
              <option value="" disabled>Select mode</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="wallet">Wallet</option>
              <option value="paytm">Paytm</option>
              <option value="cheque">Cheque</option>
              <option value="aggregator">Aggregator</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 -mt-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap w-32">Pending:</span>
            <span className="flex-1 text-sm font-black text-rose-600">{formatPaise(pendingAmt)}</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold text-slate-700 whitespace-nowrap w-32">Amount received:</label>
            <div className="flex-1 border-b-2 border-[#00bcd4] pb-1">
              <input 
                type="number"
                min="0"
                step="0.01"
                value={amountInput}
                onChange={e => setAmountInput(e.target.value)}
                className="w-full text-sm font-medium text-slate-900 outline-none bg-transparent"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button 
              onClick={handleSave}
              className="px-6 py-2 bg-[#ffc107] text-slate-900 font-bold rounded shadow-sm hover:bg-[#ffb300] transition-colors flex items-center gap-2 text-sm"
            >
              <Save size={16} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
