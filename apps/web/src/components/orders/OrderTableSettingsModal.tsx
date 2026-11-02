import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { clsx } from 'clsx'
import {
  defaultOrdersTablePreferences,
  defaultSortDirection,
  ORDER_COLUMN_META,
  ORDER_SORT_FIELDS,
  type OrderColumnKey,
  type OrderSortField,
  type OrdersTablePreferences,
} from '../../lib/ordersTablePrefs'

interface Props {
  preferences: OrdersTablePreferences
  onApply: (preferences: OrdersTablePreferences) => void
  onClose: () => void
}

export default function OrderTableSettingsModal({ preferences, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<OrdersTablePreferences>(() => ({
    columns: preferences.columns.map((column) => ({ ...column })),
    sortField: preferences.sortField,
    sortDirection: preferences.sortDirection,
  }))

  const moveColumn = (index: number, delta: number) => {
    setDraft((current) => {
      const target = index + delta
      if (target < 0 || target >= current.columns.length) return current
      const columns = [...current.columns]
      const [moved] = columns.splice(index, 1)
      columns.splice(target, 0, moved)
      return { ...current, columns }
    })
  }

  const toggleColumn = (key: OrderColumnKey) => {
    setDraft((current) => {
      const visibleCount = current.columns.filter((column) => column.visible).length
      const target = current.columns.find((column) => column.key === key)
      if (!target) return current
      if (target.visible && visibleCount <= 1) return current
      return {
        ...current,
        columns: current.columns.map((column) => column.key === key ? { ...column, visible: !column.visible } : column),
      }
    })
  }

  const changeSortField = (field: OrderSortField) => {
    setDraft((current) => ({
      ...current,
      sortField: field,
      sortDirection: current.sortField === field ? current.sortDirection : defaultSortDirection(field),
    }))
  }

  const labelByKey = new Map(ORDER_COLUMN_META.map((column) => [column.key, column.label]))
  const visibleCount = draft.columns.filter((column) => column.visible).length

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <SlidersHorizontal size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Sales order view settings</h2>
              <p className="text-xs font-bold text-slate-500">Choose the column sequence, visible columns and order sorting</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Close settings">
            <X size={22} />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Column sequence</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{visibleCount} of {draft.columns.length} shown</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {draft.columns.map((column, index) => (
                <div
                  key={column.key}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2',
                    index > 0 && 'border-t border-slate-100',
                    column.visible ? 'bg-white' : 'bg-slate-50',
                  )}
                >
                  <span className="w-6 text-center text-[10px] font-black text-slate-400">{index + 1}</span>
                  <span className={clsx('flex-1 text-sm font-bold', column.visible ? 'text-slate-800' : 'text-slate-400 line-through')}>
                    {labelByKey.get(column.key) ?? column.key}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${labelByKey.get(column.key)} up`}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === draft.columns.length - 1}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${labelByKey.get(column.key)} down`}
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleColumn(column.key)}
                    disabled={column.visible && visibleCount <= 1}
                    className={clsx(
                      'rounded-md border p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                      column.visible
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-100',
                    )}
                    aria-label={`${column.visible ? 'Hide' : 'Show'} ${labelByKey.get(column.key)}`}
                    title={column.visible ? 'Hide column' : 'Show column'}
                  >
                    {column.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-400">Use the arrows to move a column forward or backward. Hidden columns keep their position.</p>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Order sorting</h3>
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Sort by</span>
                <select
                  value={draft.sortField}
                  onChange={(event) => changeSortField(event.target.value as OrderSortField)}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  {ORDER_SORT_FIELDS.map((field) => (
                    <option key={field.value} value={field.value}>{field.label}</option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Direction</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, sortDirection: 'asc' }))}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-black transition-colors',
                      draft.sortDirection === 'asc'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300',
                    )}
                  >
                    <ArrowUp size={14} /> Ascending
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, sortDirection: 'desc' }))}
                    className={clsx(
                      'flex items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-black transition-colors',
                      draft.sortDirection === 'desc'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300',
                    )}
                  >
                    <ArrowDown size={14} /> Descending
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                {draft.sortField === 'txnTime'
                  ? `Orders are ordered by transaction time ${draft.sortDirection === 'asc' ? 'oldest first' : 'newest first'}.`
                  : `Orders are ordered by ${ORDER_SORT_FIELDS.find((field) => field.value === draft.sortField)?.label.toLowerCase()} ${draft.sortDirection === 'asc' ? 'ascending' : 'descending'}.`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDraft(defaultOrdersTablePreferences())}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
            >
              <RotateCcw size={14} /> Reset to default
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-200">
            Cancel
          </button>
          <button
            onClick={() => onApply(draft)}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Apply settings
          </button>
        </div>
      </div>
    </div>
  )
}
