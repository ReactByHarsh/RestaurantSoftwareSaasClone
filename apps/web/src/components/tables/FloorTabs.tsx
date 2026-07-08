import { clsx } from 'clsx'
import { Pencil, Trash2 } from 'lucide-react'
import { FLOOR_COLORS } from '../../lib/floorColors'

interface Props {
  floors: { id: string; name: string }[]
  activeFloorId: string
  onSelect: (id: string) => void
  onRename?: (id: string, name: string) => void
  onDelete?: (id: string) => void
}

export default function FloorTabs({ floors, activeFloorId, onSelect, onRename, onDelete }: Props) {
  return (
    <div className="flex gap-1.5 px-3 py-2 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0 scrollbar-hide z-10 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
      <button
        onClick={() => onSelect('all')}
        className={clsx(
          'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-all active:scale-95',
          activeFloorId === 'all'
            ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20'
            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-100 hover:shadow-sm'
        )}
      >
        All Sections
      </button>
      {floors.map((floor, index) => {
        const selected = activeFloorId === floor.id
        const color = FLOOR_COLORS[index % FLOOR_COLORS.length]
        return (
          <div
            key={floor.id}
            className={clsx(
              'group flex flex-shrink-0 items-center rounded-lg border-2 transition-all active:scale-95 overflow-hidden',
              selected
                ? `shadow-md ${color.active}`
                : `hover:shadow-sm ${color.idle}`
            )}
          >
            <button
              onClick={() => onSelect(floor.id)}
              className="px-3 py-1.5 text-xs font-black"
            >
              {floor.name}
            </button>
            {(onRename || onDelete) && (
              <div className={clsx('flex items-center border-l', selected ? 'border-black/15' : 'border-black/10')}>
                {onRename && (
                  <button
                    onClick={() => {
                      const name = window.prompt('Rename section', floor.name)
                      if (name?.trim()) onRename(floor.id, name.trim())
                    }}
                    className={clsx('w-7 h-8 flex items-center justify-center transition-colors', selected ? 'hover:bg-black/10' : 'hover:bg-black/5')}
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
                    className={clsx('w-7 h-8 flex items-center justify-center transition-colors', selected ? 'hover:bg-black/10' : 'hover:bg-red-100 hover:text-red-600')}
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
