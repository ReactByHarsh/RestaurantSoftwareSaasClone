import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export default function ReasonDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-black text-slate-900">{title}</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <label className="mb-2 block text-xs font-black uppercase text-slate-600">Reason is required</label>
          <textarea
            autoFocus
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Enter the reason for this change..."
            className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-xl bg-white py-2.5 text-sm font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
            Back
          </button>
          <button
            disabled={!trimmedReason}
            onClick={() => onConfirm(trimmedReason)}
            className="rounded-xl bg-red-600 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
