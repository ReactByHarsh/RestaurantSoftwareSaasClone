import { useState, useEffect } from 'react'
import { Ban, Clock, CheckCircle2, ChefHat } from 'lucide-react'
import type { KOT } from '../../lib/types'
import { clsx } from 'clsx'

interface Props {
  kot: KOT
  onItemStatusChange: (itemId: string, status: 'preparing' | 'ready') => void
  onKOTStatusChange: (status: 'preparing' | 'ready') => void
  onCancel: () => void
}

const TYPE_COLORS: Record<string, string> = {
  dine_in: 'bg-blue-900/30 text-blue-400 border-blue-900/50',
  takeaway: 'bg-amber-900/30 text-amber-400 border-amber-900/50',
  delivery: 'bg-purple-900/30 text-purple-400 border-purple-900/50',
}

export default function KOTCard({ kot, onItemStatusChange, onKOTStatusChange, onCancel }: Props) {
  const [elapsedMins, setElapsedMins] = useState(0)

  useEffect(() => {
    const calc = () => {
      const diff = Date.now() - new Date(kot.createdAt).getTime()
      setElapsedMins(Math.floor(diff / 60000))
    }
    calc()
    const timer = setInterval(calc, 60000)
    return () => clearInterval(timer)
  }, [kot.createdAt])

  // Timer color
  let timeColor = 'text-green-500 border-green-500/50'
  if (elapsedMins >= 10) timeColor = 'text-red-500 border-red-500/50'
  else if (elapsedMins >= 5) timeColor = 'text-amber-500 border-amber-500/50'

  const allReady = kot.items.every(i => i.status === 'ready')

  return (
    <div className={clsx(
      'bg-slate-800 rounded-xl overflow-hidden flex flex-col border border-slate-700 shadow-lg transition-all min-w-0',
      timeColor,
      kot.status === 'new' ? 'animate-pulse ring-2 ring-primary/30 shadow-primary/10' : ''
    )}>
      {/* Header */}
      <div className="p-2 sm:p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-start gap-2 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 min-w-0">
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight truncate">{kot.kotNo}</h3>
            <span className={clsx('text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border flex-shrink-0', TYPE_COLORS[kot.orderType] || 'bg-slate-800 text-slate-300 border-slate-700')}>
              {kot.orderType.replace('_', ' ')}
            </span>
          </div>
          {kot.tableName && (
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 truncate">Table <span className="text-white">{kot.tableName}</span></p>
          )}
        </div>
        
        <div className={clsx('flex flex-shrink-0 items-center gap-1 font-mono text-xs sm:text-sm font-black px-1.5 py-1 rounded bg-slate-800 border shadow-inner', timeColor)}>
          <Clock size={12} strokeWidth={3} />
          {elapsedMins}m
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto min-h-[100px] max-h-[300px]">
        {kot.items.map(item => (
          <div
            key={item.id}
            onClick={() => onItemStatusChange(item.id, item.status === 'ready' ? 'preparing' : 'ready')}
            className={clsx(
              'flex items-start gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-lg cursor-pointer transition-all border active:scale-[0.98] min-w-0',
              item.status === 'ready'
                ? 'bg-emerald-900/20 border-emerald-800/30 opacity-60 text-emerald-100'
                : 'bg-slate-700/50 border-slate-600 hover:border-slate-500 hover:bg-slate-700 text-white'
            )}
          >
            <div className="flex-shrink-0 mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-slate-800 border-[1.5px] border-slate-600 flex items-center justify-center font-black text-xs sm:text-sm text-primary-400">
              {item.quantity}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className={clsx(
                "font-bold text-sm sm:text-base leading-tight mb-0.5 break-words",
                item.status === 'ready' ? "line-through text-emerald-400" : ""
              )}>{item.name}</p>
              
              {item.modifiers && item.modifiers.length > 0 && (
                <p className="text-[10px] sm:text-xs font-medium text-slate-400 mb-0.5 break-words">
                  + {item.modifiers.join(', ')}
                </p>
              )}
              
              {item.note && (
                <p className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 inline-block px-1.5 py-0.5 rounded shadow-sm break-words">
                  Note: {item.note}
                </p>
              )}
            </div>
            
            {/* Checkbox circle */}
            <div className="flex-shrink-0 mt-0.5">
              {item.status === 'ready' ? (
                <CheckCircle2 size={20} className="text-emerald-500" />
              ) : (
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[2px] border-slate-500 bg-slate-800" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer action */}
      <div className="grid grid-cols-[auto_1fr] gap-2 p-2 bg-slate-900 border-t border-slate-800">
        <button
          onClick={onCancel}
          className="flex items-center justify-center rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 text-red-400 hover:bg-red-950/70"
          title="Cancel KOT"
        >
          <Ban size={16} />
        </button>
        <button
          onClick={() => onKOTStatusChange(allReady ? 'preparing' : 'ready')}
          className={clsx(
            'w-full py-2 rounded-lg text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
            allReady
              ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-900/50'
          )}
        >
          {allReady ? (
            <>
              <ChefHat size={16} strokeWidth={2.5} />
              UNDO
            </>
          ) : (
            <>
              <CheckCircle2 size={16} strokeWidth={3} />
              ALL READY
            </>
          )}
        </button>
      </div>
    </div>
  )
}
