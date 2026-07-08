import { clsx } from 'clsx'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  floors: { id: string; name: string }[]
  activeFloorId: string
  onSelect: (id: string) => void
  onRename?: (id: string, name: string) => void
  onDelete?: (id: string) => void
}

const TAB_COLORS = [
  {
    active: 'bg-blue-600 text-white border-blue-600 shadow-blue-600/20',
    idle: 'bg-blue-50 border-blue-100 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
  },
  {
    active: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/20',
    idle: 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
  },
  {
    active: 'bg-amber-500 text-white border-amber-500 shadow-amber-500/20',
    idle: 'bg-amber-50 border-amber-100 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
  },
  {
    active: 'bg-violet-600 text-white border-violet-600 shadow-violet-600/20',
    idle: 'bg-violet-50 border-violet-100 text-violet-700 hover:border-violet-300 hover:bg-violet-100',
  },
  {
    active: 'bg-rose-600 text-white border-rose-600 shadow-rose-600/20',
    idle: 'bg-rose-50 border-rose-100 text-rose-700 hover:border-rose-300 hover:bg-rose-100',
  },
  {
    active: 'bg-cyan-600 text-white border-cyan-600 shadow-cyan-600/20',
    idle: 'bg-cyan-50 border-cyan-100 text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100',
  },
]

export default function FloorTabs({ floors, activeFloorId, onSelect, onRename, onDelete }: Props) {
  return (
    <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0 scrollbar-hide z-10 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
      <button
        onClick={() => onSelect('all')}
        className={clsx(
          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95',
          activeFloorId === 'all'
            ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20'
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:shadow-sm'
        )}
      >
        All Floors
      </button>
      {floors.map((floor, index) => {
        const selected = activeFloorId === floor.id
        const color = TAB_COLORS[index % TAB_COLORS.length]
        return (
          <div
            key={floor.id}
            className={clsx(
              'group flex flex-shrink-0 items-center rounded-lg border transition-all active:scale-95 overflow-hidden',
              selected
                ? `shadow-md ${color.active}`
                : `hover:shadow-sm ${color.idle}`
            )}
          >
            <button
              onClick={() => onSelect(floor.id)}
              className="px-3 py-1.5 text-xs font-bold"
            >
              {floor.name}
            </button>
            {(onRename || onDelete) && (
              <div className={clsx('flex items-center border-l', selected ? 'border-white/15' : 'border-slate-100')}>
                {onRename && (
                  <button
                    onClick={() => {
                      const name = window.prompt('Rename section', floor.name)
                      if (name?.trim()) onRename(floor.id, name.trim())
                    }}
                    className={clsx('w-7 h-8 flex items-center justify-center transition-colors', selected ? 'hover:bg-white/10' : 'hover:bg-slate-50')}
                    title="Rename section"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${floor.name}?`)) onDelete(floor.id)
                    }}
                    className={clsx('w-7 h-8 flex items-center justify-center transition-colors', selected ? 'hover:bg-white/10 text-red-200' : 'hover:bg-red-50 hover:text-red-600')}
                    title="Delete section"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
