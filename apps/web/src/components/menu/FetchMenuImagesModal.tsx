import { useRef, useState } from 'react'
import { CheckCircle2, Globe, Loader2, Square, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { MenuItem } from '../../lib/types'
import { fetchMenuItemImageUrl } from '../../lib/menuItemImages'
import { useUIStore } from '../../store/uiStore'
import MenuItemThumb from './MenuItemThumb'

interface Props {
  items: MenuItem[]
  onApply: (updates: Record<string, string>) => void
  onClose: () => void
}

interface RecentImage {
  id: string
  name: string
  url: string
}

export default function FetchMenuImagesModal({ items, onApply, onClose }: Props) {
  const { addToast } = useUIStore()
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [started, setStarted] = useState(false)
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [found, setFound] = useState(0)
  const [failed, setFailed] = useState(0)
  const [recent, setRecent] = useState<RecentImage[]>([])
  const cancelledRef = useRef(false)

  const pending = items.filter(item => replaceExisting || !item.imageUrl).length
  const withImages = items.filter(item => item.imageUrl).length
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  const handleStart = async () => {
    if (running) return
    const targets = items.filter(item => replaceExisting || !item.imageUrl)
    if (targets.length === 0) {
      addToast('warning', 'Every product already has an image. Enable replace to look them up again.', 'Product Images')
      return
    }

    setStarted(true)
    setRunning(true)
    setStopping(false)
    setTotal(targets.length)
    setProcessed(0)
    setFound(0)
    setFailed(0)
    setRecent([])
    cancelledRef.current = false

    let batch: Record<string, string> = {}
    let processedCount = 0
    let foundCount = 0
    let failedCount = 0

    const flush = () => {
      if (Object.keys(batch).length === 0) return
      onApply(batch)
      batch = {}
    }

    for (const item of targets) {
      if (cancelledRef.current) break
      const url = await fetchMenuItemImageUrl(item.name)
      processedCount += 1
      if (url) {
        batch[item.id] = url
        foundCount += 1
        setRecent(current => [{ id: item.id, name: item.name, url }, ...current].slice(0, 6))
      } else {
        failedCount += 1
      }
      if (Object.keys(batch).length >= 12) flush()
      setProcessed(processedCount)
      setFound(foundCount)
      setFailed(failedCount)
    }

    flush()
    setRunning(false)
    setStopping(false)
    addToast(
      foundCount > 0 ? 'success' : 'warning',
      `Web image lookup finished: ${foundCount} attached, ${failedCount} not found`,
      'Product Images',
    )
  }

  const handleStop = () => {
    cancelledRef.current = true
    setStopping(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-sky-50 to-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-100 text-sky-600">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Fetch product images from the web</h2>
              <p className="text-xs font-bold text-slate-500">Look up each product name and attach the best matching image link</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close web image fetch"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Without image</p>
              <p className="mt-1 text-xl font-black text-slate-800">{items.length - withImages}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">With image</p>
              <p className="mt-1 text-xl font-black text-emerald-700">{withImages}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-600">Will process</p>
              <p className="mt-1 text-xl font-black text-sky-700">{running ? total : pending}</p>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={replaceExisting}
              disabled={running}
              onChange={(event) => setReplaceExisting(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-xs font-bold text-slate-600">
              Replace images that already exist
              <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">Leave this off to only fill products without an image.</span>
            </span>
          </label>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
            Images are searched on Wikimedia Commons and Wikipedia using the product name. Only close matches are attached.
            Large menus can take several minutes — you can stop at any time and the images found so far are saved.
          </p>

          {(running || started) && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between text-xs font-black text-slate-600">
                <span className="flex items-center gap-1.5">
                  {running && <Loader2 size={13} className="animate-spin text-sky-600" />}
                  {running ? (stopping ? 'Stopping...' : 'Searching images...') : 'Lookup finished'}
                </span>
                <span>{processed} / {total} · {percent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex gap-4 text-[11px] font-black">
                <span className="text-emerald-600">{found} attached</span>
                <span className="text-slate-400">{failed} not found</span>
              </div>
              {recent.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {recent.map(image => (
                    <div key={image.id} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 py-1 pl-1 pr-2" title={image.name}>
                      <MenuItemThumb src={image.url} alt={image.name} className="h-7 w-7 rounded" iconSize={12} />
                      <span className="max-w-[120px] truncate text-[10px] font-black text-emerald-800">{image.name}</span>
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
                className={clsx(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-black text-white shadow-lg shadow-sky-200 transition-colors hover:bg-sky-700',
                )}
              >
                {started ? <CheckCircle2 size={16} /> : <Globe size={16} />}
                {started ? 'Search again' : `Fetch ${pending} images`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
