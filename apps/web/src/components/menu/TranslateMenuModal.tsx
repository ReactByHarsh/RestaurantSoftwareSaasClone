import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Languages, Loader2, Square, X } from 'lucide-react'
import type { MenuCategory, MenuItem } from '../../lib/types'
import {
  isAutoTranslatableLanguage,
  menuLanguageDisplay,
  menuLanguageLabel,
  MENU_LANGUAGES,
  translateMenuChunk,
} from '../../lib/menuTranslate'
import { useUIStore } from '../../store/uiStore'

interface Props {
  items: MenuItem[]
  categories: MenuCategory[]
  defaultLanguage: string
  onApplyItems: (language: string, updates: Record<string, string>) => void
  onApplyCategories: (language: string, updates: Record<string, string>) => void
  onClose: () => void
}

interface RecentTranslation {
  source: string
  value: string
}

export default function TranslateMenuModal({ items, categories, defaultLanguage, onApplyItems, onApplyCategories, onClose }: Props) {
  const { addToast } = useUIStore()
  const [language, setLanguage] = useState(() => {
    const preferred = defaultLanguage === 'en' ? 'mr' : defaultLanguage
    return MENU_LANGUAGES.some(option => option.code === preferred) ? preferred : 'mr'
  })
  const [parentFilter, setParentFilter] = useState('all')
  const [subcategoryFilter, setSubcategoryFilter] = useState('all')
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [started, setStarted] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [total, setTotal] = useState(0)
  const [translated, setTranslated] = useState(0)
  const [failed, setFailed] = useState(0)
  const [recent, setRecent] = useState<RecentTranslation[]>([])
  const cancelledRef = useRef(false)

  const categoryById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const parentCategories = useMemo(
    () => categories.filter(category => !category.parentId).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  )
  const subcategories = useMemo(
    () => categories
      .filter(category => category.parentId && (parentFilter === 'all' || category.parentId === parentFilter))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, parentFilter],
  )

  const scopedItems = useMemo(() => items.filter((item) => {
    if (subcategoryFilter !== 'all') return item.categoryId === subcategoryFilter
    if (parentFilter === 'all') return true
    if (item.categoryId === parentFilter) return true
    return categoryById.get(item.categoryId)?.parentId === parentFilter
  }), [items, subcategoryFilter, parentFilter, categoryById])

  const alreadyTranslated = scopedItems.filter(item => item.nameTranslations?.[language]).length
  const remaining = scopedItems.filter(item => overwrite || !item.nameTranslations?.[language]).length
  const autoAvailable = isAutoTranslatableLanguage(language)
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  const scopedCategoryTargets = () => {
    const ids = new Set<string>()
    scopedItems.forEach((item) => {
      const leaf = categoryById.get(item.categoryId)
      if (!leaf) return
      ids.add(leaf.id)
      if (leaf.parentId) ids.add(leaf.parentId)
    })
    if (parentFilter !== 'all') ids.add(parentFilter)
    if (subcategoryFilter !== 'all') ids.add(subcategoryFilter)
    return Array.from(ids)
      .map(id => categoryById.get(id))
      .filter((category): category is MenuCategory => Boolean(category))
      .filter(category => overwrite || !category.nameTranslations?.[language])
  }

  const categoryRemaining = scopedCategoryTargets().length
  const translatable = remaining + categoryRemaining

  const handleStart = async () => {
    if (running) return
    if (!autoAvailable) {
      addToast('warning', `Automatic translation is not available for ${menuLanguageLabel(language)}. Add those names manually.`, 'Menu Language')
      return
    }

    const itemTargets = scopedItems.filter(item => overwrite || !item.nameTranslations?.[language])
    const categoryTargets = scopedCategoryTargets()
    if (itemTargets.length === 0 && categoryTargets.length === 0) {
      addToast('warning', 'Everything in this scope is already translated. Enable replace to translate again.', 'Menu Language')
      return
    }

    setStarted(true)
    setRunning(true)
    setStopping(false)
    setProcessed(0)
    setTranslated(0)
    setFailed(0)
    setRecent([])
    setTotal(itemTargets.length + categoryTargets.length)
    cancelledRef.current = false

    let processedCount = 0
    let translatedCount = 0
    let failedCount = 0
    let pendingItemUpdates: Record<string, string> = {}

    const flushItems = () => {
      if (Object.keys(pendingItemUpdates).length === 0) return
      onApplyItems(language, pendingItemUpdates)
      pendingItemUpdates = {}
    }

    try {
      for (let index = 0; index < categoryTargets.length; index += 10) {
        if (cancelledRef.current) break
        const chunk = categoryTargets.slice(index, index + 10)
        const values = await translateMenuChunk(chunk.map(category => category.name), language)
        const updates: Record<string, string> = {}
        const preview: RecentTranslation[] = []
        chunk.forEach((category, position) => {
          const value = String(values[position] ?? '').trim()
          if (value) {
            updates[category.id] = value
            translatedCount += 1
            preview.push({ source: category.name, value })
          } else {
            failedCount += 1
          }
        })
        if (Object.keys(updates).length > 0) onApplyCategories(language, updates)
        if (preview.length > 0) setRecent(current => [...preview, ...current].slice(0, 5))
        processedCount += chunk.length
        setProcessed(processedCount)
        setTranslated(translatedCount)
        setFailed(failedCount)
      }

      for (let index = 0; index < itemTargets.length; index += 10) {
        if (cancelledRef.current) break
        const chunk = itemTargets.slice(index, index + 10)
        const values = await translateMenuChunk(chunk.map(item => item.name), language)
        const preview: RecentTranslation[] = []
        chunk.forEach((item, position) => {
          const value = String(values[position] ?? '').trim()
          if (value) {
            pendingItemUpdates[item.id] = value
            translatedCount += 1
            preview.push({ source: item.name, value })
          } else {
            failedCount += 1
          }
        })
        if (preview.length > 0) setRecent(current => [...preview, ...current].slice(0, 5))
        if (Object.keys(pendingItemUpdates).length >= 30) flushItems()
        processedCount += chunk.length
        setProcessed(processedCount)
        setTranslated(translatedCount)
        setFailed(failedCount)
      }
      flushItems()
      addToast(
        translatedCount > 0 ? 'success' : 'warning',
        `Translated ${translatedCount} names to ${menuLanguageLabel(language)}${failedCount ? ` · ${failedCount} could not be translated` : ''}`,
        'Menu Language',
      )
    } catch (error) {
      flushItems()
      addToast('error', error instanceof Error ? error.message : 'Could not translate the menu names', 'Menu Language')
    } finally {
      setRunning(false)
      setStopping(false)
    }
  }

  const handleStop = () => {
    cancelledRef.current = true
    setStopping(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-100 text-violet-600">
              <Languages size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Translate menu names</h2>
              <p className="text-xs font-bold text-slate-500">English stays unchanged. Translations are saved on each product and category.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close translation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Language</span>
              <select
                value={language}
                disabled={running}
                onChange={(event) => setLanguage(event.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
              >
                {MENU_LANGUAGES.filter(option => option.code !== 'en').map(option => (
                  <option key={option.code} value={option.code}>{menuLanguageDisplay(option.code)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Category</span>
              <select
                value={parentFilter}
                disabled={running}
                onChange={(event) => { setParentFilter(event.target.value); setSubcategoryFilter('all') }}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
              >
                <option value="all">All categories</option>
                {parentCategories.map(category => (
                  <option key={category.id} value={category.id}>{category.nameTranslations?.[language] || category.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Subcategory</span>
              <select
                value={subcategoryFilter}
                disabled={running}
                onChange={(event) => setSubcategoryFilter(event.target.value)}
                className="w-full rounded-xl border-2 border-slate-200 bg-white px-2 py-2 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
              >
                <option value="all">All subcategories</option>
                {subcategories.map(category => (
                  <option key={category.id} value={category.id}>{category.nameTranslations?.[language] || category.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Products</p>
              <p className="mt-1 text-xl font-black text-slate-800">{scopedItems.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Translated</p>
              <p className="mt-1 text-xl font-black text-emerald-700">{alreadyTranslated}</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">Will translate</p>
              <p className="mt-1 text-xl font-black text-violet-700">{running ? total : translatable}</p>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={overwrite}
              disabled={running}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-xs font-bold text-slate-600">
              Replace existing translations
              <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">Leave this off to only translate names that have no {menuLanguageLabel(language)} translation yet.</span>
            </span>
          </label>

          {!autoAvailable && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Automatic translation is not available for {menuLanguageLabel(language)}. Select another language, or type the {menuLanguageLabel(language)} names in each product form.
            </div>
          )}

          {(running || started) && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between text-xs font-black text-slate-600">
                <span className="flex items-center gap-1.5">
                  {running && <Loader2 size={13} className="animate-spin text-violet-600" />}
                  {running ? (stopping ? 'Stopping...' : 'Translating...') : 'Translation finished'}
                </span>
                <span>{processed} / {total} · {percent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex gap-4 text-[11px] font-black">
                <span className="text-emerald-600">{translated} translated</span>
                <span className="text-slate-400">{failed} skipped</span>
              </div>
              {recent.length > 0 && (
                <div className="space-y-1 pt-1">
                  {recent.map((entry, index) => (
                    <div key={`${entry.source}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
                      <span className="truncate font-bold text-slate-500">{entry.source}</span>
                      <span className="text-slate-300">→</span>
                      <span className="truncate font-black text-slate-800">{entry.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          {running ? (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-100 py-2.5 text-sm font-black text-rose-600 transition-colors hover:bg-rose-200 disabled:opacity-50"
            >
              <Square size={14} /> {stopping ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <>
              <button onClick={onClose} className="flex-1 rounded-xl bg-slate-200 py-2.5 text-sm font-black text-slate-600 transition-colors hover:bg-slate-300">
                Close
              </button>
              <button
                onClick={handleStart}
                disabled={!autoAvailable || translatable === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white shadow-lg shadow-violet-200 transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {started ? <CheckCircle2 size={16} /> : <Languages size={16} />}
                {started ? 'Translate again' : `Translate ${translatable}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
