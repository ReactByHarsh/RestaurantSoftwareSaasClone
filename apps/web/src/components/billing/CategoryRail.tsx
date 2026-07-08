import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MenuCategory, MenuItem } from '../../lib/types'
import { clsx } from 'clsx'
import { ChevronDown, ChevronLeft, ChevronRight, Star } from 'lucide-react'

interface Props {
  categories: MenuCategory[]
  items: MenuItem[]
  activeCategoryId: string
  onSelect: (id: string) => void
}

export default function CategoryRail({ categories, items, activeCategoryId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [popupRect, setPopupRect] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth)
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [categories])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
    }
  }

  const openPopup = (categoryId: string, element: HTMLElement) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    const rect = element.getBoundingClientRect()
    const width = Math.min(420, Math.max(260, rect.width + 180))
    setOpenCategoryId(categoryId)
    setPopupRect({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 4,
      width,
      maxHeight: Math.max(220, window.innerHeight - rect.bottom - 20),
    })
  }

  const closePopup = () => {
    setOpenCategoryId(null)
    setPopupRect(null)
  }

  const scheduleClosePopup = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closePopup()
      closeTimerRef.current = null
    }, 120)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const sortByName = <T extends { name: string }>(rows: T[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const activeCategories = sortByName(categories.filter(c => c.isActive))
  const itemCounts = new Map<string, number>()
  items.forEach((item) => itemCounts.set(item.categoryId, (itemCounts.get(item.categoryId) ?? 0) + 1))
  const hasItemsDeep = (category: MenuCategory) => {
    if ((itemCounts.get(category.id) ?? 0) > 0) return true
    return activeCategories.some((candidate) => candidate.parentId === category.id && (itemCounts.get(candidate.id) ?? 0) > 0)
  }
  const parents = sortByName(activeCategories.filter(category => !category.parentId && hasItemsDeep(category)))
  const activeCategory = activeCategories.find(category => category.id === activeCategoryId)
  const activeParentId = activeCategory?.parentId ?? activeCategory?.id
  const childrenByParent = new Map<string, MenuCategory[]>()
  activeCategories.forEach((category) => {
    if (!category.parentId || (itemCounts.get(category.id) ?? 0) <= 0) return
    const list = childrenByParent.get(category.parentId) ?? []
    list.push(category)
    childrenByParent.set(category.parentId, sortByName(list))
  })
  const selectAndClose = (id: string) => {
    onSelect(id)
    closePopup()
  }

  return (
    <div className="relative bg-white border-b border-slate-100 z-10 px-1 py-1">
      <div className="relative flex items-center">
      {canScrollLeft && (
        <button onClick={() => scroll('left')} className="absolute left-0 z-20 h-full px-1 bg-gradient-to-r from-white via-white to-transparent text-slate-400 hover:text-slate-700">
          <ChevronLeft size={20} />
        </button>
      )}

      <div 
        ref={scrollRef} 
        onScroll={checkScroll} 
        className="flex gap-1.5 px-3 py-1.5 overflow-x-auto flex-shrink-0 scrollbar-hide flex-1"
      >
        <button
          onClick={() => onSelect('all')}
          className={clsx(
            'flex-shrink-0 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all active:scale-95',
            activeCategoryId === 'all'
              ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
              : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow-sm'
          )}
        >
          All
        </button>
        <button
          onClick={() => onSelect('favorites')}
          className={clsx(
            'flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all active:scale-95',
            activeCategoryId === 'favorites'
              ? 'bg-yellow-400 text-yellow-900 border-yellow-400 shadow-md shadow-yellow-400/20'
              : 'bg-white border-slate-100 text-yellow-600 hover:border-yellow-300 hover:bg-yellow-50 hover:shadow-sm'
          )}
        >
          <Star size={14} className={activeCategoryId === 'favorites' ? 'fill-yellow-900' : 'fill-yellow-600'} />
          Favs
        </button>
        {parents.map(cat => {
          const children = childrenByParent.get(cat.id) ?? []
          const isActive = activeCategoryId === cat.id || activeParentId === cat.id
          return (
            <div
              key={cat.id}
              className="relative flex-shrink-0"
              onMouseEnter={event => children.length && openPopup(cat.id, event.currentTarget)}
              onMouseLeave={scheduleClosePopup}
            >
              <button
                onClick={event => children.length ? (openCategoryId === cat.id ? closePopup() : openPopup(cat.id, event.currentTarget)) : selectAndClose(cat.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all active:scale-95',
                  isActive
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                    : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow-sm'
                )}
              >
                {cat.name}
                {children.length > 0 && <ChevronDown size={12} />}
              </button>
              {openCategoryId === cat.id && children.length > 0 && popupRect && createPortal(
                <div
                  className="fixed z-[120] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/20"
                  style={{ left: popupRect.left, top: popupRect.top, width: popupRect.width, maxHeight: popupRect.maxHeight }}
                  onMouseEnter={() => {
                    if (closeTimerRef.current) {
                      window.clearTimeout(closeTimerRef.current)
                      closeTimerRef.current = null
                    }
                    setOpenCategoryId(cat.id)
                  }}
                  onMouseLeave={scheduleClosePopup}
                >
                  <button onClick={() => selectAndClose(cat.id)} className={clsx('w-full rounded-lg px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider', activeCategoryId === cat.id ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50')}>
                    All {cat.name}
                  </button>
                  {children.map(child => (
                    <button key={child.id} onClick={() => selectAndClose(child.id)} className={clsx('w-full rounded-lg px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider', activeCategoryId === child.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                      {child.name}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          )
        })}
      </div>

      {canScrollRight && (
        <button onClick={() => scroll('right')} className="absolute right-0 z-20 h-full px-1 bg-gradient-to-l from-white via-white to-transparent text-slate-400 hover:text-slate-700">
          <ChevronRight size={20} />
        </button>
      )}
      </div>
    </div>
  )
}
