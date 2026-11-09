import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Settings2, Trash2 } from 'lucide-react'
import { FLOOR_COLORS } from '../../lib/floorColors'

interface Props {
  floors: { id: string; name: string; priceAdjustmentType?: 'percentage' | 'amount'; priceAdjustmentValue?: number; menuPriceOption?: string; sortOrder?: number }[]
  activeFloorId: string
  onSelect: (id: string) => void
  onRename?: (id: string, name: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onReorder?: (orderedIds: string[]) => void
}

export default function FloorTabs({ floors, activeFloorId, onSelect, onRename, onEdit, onDelete, onReorder }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const orderedFloors = [...floors].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const move = (id: string, delta: number) => {
    if (!onReorder) return
    const index = orderedFloors.findIndex(floor => floor.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= orderedFloors.length) return
    const ids = orderedFloors.map(floor => floor.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    onReorder(ids)
  }

  const dropOn = (targetId: string) => {
    if (!onReorder) return
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }
    const ids = orderedFloors.map(floor => floor.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    setDraggedId(null)
    if (from < 0 || to < 0) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    onReorder(ids)
  }

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
      {orderedFloors.map((floor, index) => {
        const selected = activeFloorId === floor.id
        const color = FLOOR_COLORS[index % FLOOR_COLORS.length]
        return (
          <div
            key={floor.id}
            draggable={Boolean(onReorder)}
            onDragStart={event => {
              if (!onReorder) return
              setDraggedId(floor.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={event => { if (onReorder) event.preventDefault() }}
            onDrop={event => {
              if (!onReorder) return
              event.preventDefault()
              dropOn(floor.id)
            }}
            className={clsx(
              'group flex flex-shrink-0 items-center rounded-lg border-2 transition-all active:scale-95 overflow-hidden',
              selected
                ? `shadow-md ${color.active}`
                : `hover:shadow-sm ${color.idle}`,
              onReorder && 'cursor-grab active:cursor-grabbing',
              draggedId === floor.id && 'opacity-40'
            )}
          >
            <button
              onClick={() => onSelect(floor.id)}
              className="flex items-center px-3 py-1.5 text-xs font-black"
            >
              {onReorder && <GripVertical size={12} className="mr-1 opacity-40" />}
              {floor.name}
              {floor.menuPriceOption && floor.menuPriceOption !== 'regular' && (
                <span className="ml-1.5 text-[10px] opacity-75">{floor.menuPriceOption.toUpperCase()}</span>
              )}
              {Boolean(floor.priceAdjustmentValue && floor.priceAdjustmentValue > 0) && (
                <span className="ml-1.5 text-[10px] opacity-75">
                  +{floor.priceAdjustmentType === 'amount' ? `₹${((floor.priceAdjustmentValue ?? 0) / 100).toFixed(2)}` : `${floor.priceAdjustmentValue}%`}
                </span>
              )}
            </button>
            {(onRename || onEdit || onDelete || onReorder) && (
              <div className={clsx('flex items-center border-l', selected ? 'border-black/15' : 'border-black/10')}>
                {onReorder && (
                  <>
                    <button
                      onClick={() => move(floor.id, -1)}
                      disabled={index === 0}
                      className={clsx('w-6 h-8 flex items-center justify-center transition-colors disabled:opacity-25', selected ? 'hover:bg-black/10' : 'hover:bg-black/5')}
                      title="Move section left"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      onClick={() => move(floor.id, 1)}
                      disabled={index === orderedFloors.length - 1}
                      className={clsx('w-6 h-8 flex items-center justify-center transition-colors disabled:opacity-25', selected ? 'hover:bg-black/10' : 'hover:bg-black/5')}
                      title="Move section right"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </>
                )}
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
                {onEdit && (
                  <button
                    onClick={() => onEdit(floor.id)}
                    className={clsx('w-7 h-8 flex items-center justify-center transition-colors', selected ? 'hover:bg-black/10' : 'hover:bg-black/5')}
                    title="Section pricing"
                  >
                    <Settings2 size={13} />
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
