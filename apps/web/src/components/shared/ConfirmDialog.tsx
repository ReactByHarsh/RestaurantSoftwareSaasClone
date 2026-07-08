import { clsx } from 'clsx'

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-in-up">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm()
              onCancel()
            }}
            className={clsx(
              'px-4 py-2 font-bold text-white rounded-lg transition-colors shadow-sm',
              danger
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-primary-dark'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
