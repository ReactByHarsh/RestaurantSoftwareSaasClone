import type { MenuItem } from '../../lib/types'
import { formatPaise } from '../../lib/money'
import { Plus, Check } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  item: MenuItem
  cartQty: number
  isKotItem?: boolean
  onAdd: () => void
}

export default function MenuItemCard({ item, cartQty, isKotItem = false, onAdd }: Props) {
  const inCart = cartQty > 0

  return (
    <button
      onClick={onAdd}
      className={clsx(
        'group relative flex flex-col p-2.5 rounded-xl border text-left transition-all active:scale-95 overflow-hidden min-h-[96px]',
        isKotItem
          ? 'border-yellow-200 bg-yellow-50 hover:border-yellow-300 hover:shadow-lg'
          : 'border-slate-100 bg-white hover:border-primary/30 hover:shadow-lg'
      )}
    >
      {/* Top Section */}
      <div className="flex items-start justify-between w-full mb-1">
        {/* Veg/Non-veg indicator */}
        <div className={clsx(
          'w-3 h-3 rounded-[3px] border flex items-center justify-center flex-shrink-0 bg-white',
          item.itemType === 'veg' ? 'border-green-600' : 
          item.itemType === 'nonveg' ? 'border-red-600' : 'border-amber-600'
        )}>
          <div className={clsx(
            'w-1.5 h-1.5 rounded-full',
            item.itemType === 'veg' ? 'bg-green-600' : 
            item.itemType === 'nonveg' ? 'bg-red-600' : 'bg-amber-600'
          )} />
        </div>
        <span className="text-[9px] font-bold text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
          ADD
        </span>
      </div>

      {/* Item name */}
      <p className="text-[13px] sm:text-sm font-black leading-snug mb-1.5 flex-1 tracking-tight text-slate-900">
        {item.name}
      </p>
      {isKotItem && (
        <span className="absolute right-2 top-2 rounded bg-yellow-200 px-1.5 py-0.5 text-[8px] font-black uppercase text-yellow-900">
          KOT
        </span>
      )}

      {/* Bottom Section */}
      <div className="flex items-end justify-between w-full mt-auto">
        <span className="text-xs font-black tracking-tight text-slate-700">
          {formatPaise(item.pricePaise)}
        </span>
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-all shadow-sm bg-slate-50 text-slate-400 group-hover:bg-primary group-hover:text-white border border-slate-200 group-hover:border-primary">
          <Plus size={14} strokeWidth={2.5} />
        </div>
      </div>
    </button>
  )
}
