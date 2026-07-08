import { Clock } from 'lucide-react'
import type { RestaurantTable } from '../../lib/types'
import { clsx } from 'clsx'

interface Props {
  tables: RestaurantTable[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function AssignedTables({ tables, selectedId, onSelect }: Props) {
  // Only show occupied or available tables for simplicity in Captain view
  const visible = tables.filter(t => t.status === 'occupied' || t.status === 'available' || t.status === 'kot_sent')
  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-2 bg-white border-b border-slate-100 scrollbar-hide flex-shrink-0 shadow-sm z-10">
      {visible.map(table => {
        const isSelected = selectedId === table.id
        const isOccupied = table.activeOrderId != null
        
        return (
          <button
            key={table.id}
            onClick={() => onSelect(table.id)}
            className={clsx(
              'flex-shrink-0 flex flex-col min-w-[70px] p-2.5 rounded-xl border-2 transition-all active:scale-95 text-left',
              isSelected
                ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                : isOccupied
                  ? 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300 shadow-sm'
                  : 'border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:shadow-md'
            )}
          >
            <span className="text-sm font-black block mb-1 tracking-tight truncate">{table.name}</span>
            <div className="flex items-center justify-between mt-auto gap-1">
              <span className={clsx(
                'text-[9px] font-black uppercase tracking-wider truncate',
                isSelected ? 'text-primary-100' : isOccupied ? 'text-blue-600' : 'text-slate-400'
              )}>
                {table.status.replace('_', ' ')}
              </span>
              {isOccupied && (
                <Clock size={12} strokeWidth={3} className={isSelected ? 'text-primary-200' : 'text-blue-400'} />
              )}
            </div>
          </button>
        )
      })}
      
      {visible.length === 0 && (
        <div className="text-sm font-bold text-slate-400 italic py-2">No assigned tables</div>
      )}
    </div>
  )
}
