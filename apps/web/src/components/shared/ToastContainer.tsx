import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { clsx } from 'clsx'

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS = {
  success: 'border-emerald-300/70 bg-white text-emerald-950 shadow-[0_16px_40px_rgba(16,185,129,0.18)]',
  error: 'border-red-300/70 bg-white text-red-950 shadow-[0_16px_40px_rgba(239,68,68,0.16)]',
  warning: 'border-amber-300/70 bg-white text-amber-950 shadow-[0_16px_40px_rgba(245,158,11,0.16)]',
  info: 'border-sky-300/70 bg-white text-sky-950 shadow-[0_16px_40px_rgba(14,165,233,0.16)]',
}

const ICON_COLORS = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
}

const TITLES = {
  success: 'Success',
  error: 'Error',
  warning: 'Attention',
  info: 'Note',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  return (
    <div className="fixed top-3 right-3 z-[9999] flex w-full max-w-[360px] flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const Icon = ICONS[toast.type]
        
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur-xl animate-slide-in-right',
              COLORS[toast.type]
            )}
          >
            <div className={clsx('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50', ICON_COLORS[toast.type])}>
              <Icon size={16} className={clsx('flex-shrink-0', ICON_COLORS[toast.type])} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                {toast.title || TITLES[toast.type]}
              </p>
              <p className="mt-0.5 text-sm font-bold leading-5 text-slate-700">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="mt-0.5 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
