import { useState } from 'react'
import { X, XCircle } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import type { Order } from '../../lib/types'
import { formatPaise } from '../../lib/money'

interface Props {
  order: Order
  onClose: () => void
}

export default function CancelOrderModal({ order, onClose }: Props) {
  const { cancelOrder } = useBillingStore()
  const { addToast } = useUIStore()

  const [reason, setReason] = useState('')
  const [addBack, setAddBack] = useState(false)

  const handleCancel = () => {
    if (!reason.trim()) {
      addToast('error', 'Please enter a cancellation reason')
      return
    }

    // Pass reason and optionally handle the 'add back to inventory' flag if supported
    cancelOrder(order.id, reason)
    addToast('success', 'Order cancelled successfully')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden bg-white shadow-2xl flex flex-col rounded-sm">
        <div className="bg-white flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 text-lg">Order cancellation</h3>
          <button onClick={onClose} className="hover:bg-slate-100 p-1 rounded transition-colors text-slate-500"><X size={18} /></button>
        </div>
        
        <div className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm font-medium text-slate-600">Receipt no</span>
              <span className="text-sm font-bold text-slate-800">{order.orderNo}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm font-medium text-slate-600">Order amount</span>
              <span className="text-sm font-bold text-slate-800">{formatPaise(order.totalPaise)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm font-medium text-slate-600">Paid amount</span>
              <span className="text-sm font-bold text-slate-800">{formatPaise(order.paidPaise)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={addBack}
              onChange={(e) => setAddBack(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Add Items Back to Inventory</span>
          </label>

          <div className="flex items-start gap-4">
            <label className="text-sm font-bold text-slate-700 w-32 shrink-0">Cancellation reason:</label>
            <div className="flex-1 border-b-2 border-slate-300 focus-within:border-slate-500 pb-1">
              <input 
                type="text"
                placeholder="Cancellation reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full text-sm font-medium text-slate-900 outline-none bg-transparent placeholder-slate-400"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button 
              onClick={handleCancel}
              className="px-6 py-2 bg-[#ffc107] text-slate-900 font-bold rounded shadow-sm hover:bg-[#ffb300] transition-colors flex items-center gap-2 text-sm"
            >
              <XCircle size={16} /> Cancel Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
