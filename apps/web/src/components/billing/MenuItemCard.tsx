import { useEffect, useState } from 'react'
import type { MenuItem } from '../../lib/types'
import { formatPaise } from '../../lib/money'
import { Plus, UtensilsCrossed } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  item: MenuItem
  cartQty: number
  isKotItem?: boolean
  displayPricePaise?: number
  onAdd: () => void
}

export default function MenuItemCard({ item, cartQty, isKotItem = false, displayPricePaise, onAdd }: Props) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [item.imageUrl])

  const showImage = Boolean(item.imageUrl) && !imageFailed

  return (
    <button
      onClick={onAdd}
      className={clsx(
        'group relative flex min-h-[132px] flex-col overflow-hidden rounded-xl border text-left transition-all active:scale-95',
        isKotItem
          ? 'border-yellow-200 bg-yellow-50 hover:border-yellow-300 hover:shadow-lg'
          : 'border-slate-100 bg-white hover:border-primary/30 hover:shadow-lg'
      )}
    >
      <div className="relative h-[72px] w-full shrink-0 overflow-hidden bg-slate-100">
        {showImage ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300">
            <UtensilsCrossed size={26} strokeWidth={1.8} />
          </div>
        )}

        <div className={clsx(
          'absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-[4px] border bg-white/95 shadow-sm',
          item.itemType === 'veg' ? 'border-green-600' :
          item.itemType === 'nonveg' ? 'border-red-600' : 'border-amber-600'
        )}>
          <div className={clsx(
            'h-2 w-2 rounded-full',
            item.itemType === 'veg' ? 'bg-green-600' :
            item.itemType === 'nonveg' ? 'bg-red-600' : 'bg-amber-600'
          )} />
        </div>

        {isKotItem ? (
          <span className="absolute right-1.5 top-1.5 rounded bg-yellow-200 px-1.5 py-0.5 text-[8px] font-black uppercase text-yellow-900 shadow-sm">
            KOT
          </span>
        ) : (
          <span className="absolute right-1.5 top-1.5 rounded bg-white/85 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
            ADD
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2">
        <p className="mb-1 line-clamp-2 flex-1 text-[13px] font-black leading-snug tracking-tight text-slate-900 sm:text-sm">
          {item.name}
        </p>

        <div className="mt-auto flex w-full items-end justify-between">
          <span className="text-xs font-black tracking-tight text-slate-700">
            {formatPaise(displayPricePaise ?? item.pricePaise)}
          </span>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 shadow-sm transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-white">
            <Plus size={14} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </button>
  )
}
