import { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[200px]">
      <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-bold text-slate-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold shadow-sm hover:bg-primary-dark transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
