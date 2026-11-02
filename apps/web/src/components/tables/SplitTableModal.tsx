import { useState } from 'react'
import { GitMerge, Info, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { RestaurantTable } from '../../lib/types'

interface Props {
  table: RestaurantTable
  baseName: string
  currentParts: number
  onClose: () => void
  onSplit: (parts: number) => void
}

const SPLIT_OPTIONS = [2, 3, 4]

export default function SplitTableModal({ table, baseName, currentParts, onClose, onSplit }: Props) {
  const [parts, setParts] = useState(() => Math.min(4, Math.max(2, currentParts + 1)))
  const alreadyAtLimit = currentParts >= 4

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-100 text-violet-600">
              <GitMerge size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Split table</h2>
              <p className="text-xs font-bold text-slate-500">Share <span className="text-violet-600">{baseName}</span> across separate tables</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" aria-label="Close split table">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Info size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">
              Each part becomes its own table with its own order and KOTs. The current order stays on <strong>{table.name}</strong>,
              and you can transfer KOTs to any part from the table menu.
            </p>
          </div>

          {alreadyAtLimit ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm font-black text-slate-700">This table is already split into 4 parts.</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Remove a part first if you want a different number of tables.</p>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Number of tables</p>
              <div className="grid grid-cols-3 gap-2">
                {SPLIT_OPTIONS.map(option => {
                  const disabled = option <= currentParts
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={disabled}
                      onClick={() => setParts(option)}
                      className={clsx(
                        'rounded-xl border-2 px-2 py-3 text-center transition-all',
                        parts === option
                          ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50',
                        disabled && 'cursor-not-allowed opacity-40 hover:border-slate-200 hover:bg-white',
                      )}
                    >
                      <span className="block text-2xl font-black leading-none">{option}</span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-wider">tables</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Table names</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from({ length: Math.max(parts, currentParts) }, (_, index) => {
                    const name = `${baseName} (${String.fromCharCode(97 + index)})`
                    const exists = index < currentParts
                    return (
                      <span
                        key={name}
                        className={clsx(
                          'rounded-lg border px-2 py-1 text-xs font-black',
                          exists ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-white text-violet-700',
                        )}
                      >
                        {name}{exists ? ' · existing' : ' · new'}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-black text-slate-600 transition-colors hover:bg-slate-200">
              Cancel
            </button>
            <button
              onClick={() => onSplit(parts)}
              disabled={alreadyAtLimit || parts <= currentParts}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white shadow-lg shadow-violet-200 transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GitMerge size={15} className="mr-1.5 inline" />
              Split into {parts}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
