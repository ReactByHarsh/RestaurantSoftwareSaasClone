import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  itemName: string
  maxQty: number
  onClose: () => void
  onConfirm: (qty: number, reason: string) => void
}

export default function CancelItemDialog({
  itemName,
  maxQty,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState(maxQty.toString())
  const trimmedReason = reason.trim()

  const numQty = parseInt(qty, 10)
  const isValidQty = !isNaN(numQty) && numQty > 0 && numQty <= maxQty

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-black text-slate-900">Cancel Item: {itemName}</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Cancel quantity from KOT. Max available: {maxQty}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-xs font-black uppercase text-slate-600">Quantity to cancel</label>
            <input
              type="number"
              autoFocus
              min="1"
              max={maxQty}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-black uppercase text-slate-600">Reason is required</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter the reason for cancellation..."
              className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-xl bg-white py-2.5 text-sm font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
            Back
          </button>
          <button
            disabled={!trimmedReason || !isValidQty}
            onClick={() => onConfirm(numQty, trimmedReason)}
            className="rounded-xl bg-red-600 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel {isValidQty ? numQty : ''} Qty
          </button>
        </div>
      </div>
    </div>
  )
}
