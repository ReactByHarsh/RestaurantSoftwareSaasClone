import { useState, useMemo } from 'react'
import { X, Percent, IndianRupee, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { useBillingStore } from '../../store/billingStore'

interface Props {
  isOpen: boolean
  onClose: () => void
  onApply: (type: 'percentage' | 'amount', value: number, categoryIds: string[]) => void
}

export default function DiscountModal({ isOpen, onClose, onApply }: Props) {
  const { menuCategories } = useBillingStore()
  const [value, setValue] = useState('')
  const [type, setType] = useState<'percentage' | 'amount'>('percentage')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const isAllSelected = selectedCategories.length === 0 || selectedCategories.includes('all')

  const toggleCategory = (id: string) => {
    if (id === 'all') {
      setSelectedCategories(['all'])
      return
    }

    setSelectedCategories((prev) => {
      const filtered = prev.filter(c => c !== 'all')
      if (filtered.includes(id)) {
        return filtered.filter(c => c !== id)
      } else {
        return [...filtered, id]
      }
    })
  }

  const handleApply = () => {
    const numericValue = parseFloat(value) || 0
    if (numericValue <= 0) return
    onApply(type, numericValue, isAllSelected ? ['all'] : selectedCategories)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-slide-in-up">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Percent size={20} className="text-primary" />
            Apply Discount
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Discount value</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {type === 'percentage' ? <Percent size={16} /> : <IndianRupee size={16} />}
              </div>
              <input
                type="number"
                min="0"
                step={type === 'percentage' ? '1' : '0.01'}
                placeholder="Enter value"
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full pl-9 pr-3 py-3 text-lg font-black border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Discount type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('percentage')}
                className={clsx(
                  "flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors",
                  type === 'percentage' ? "border-primary bg-primary/5 text-primary" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200"
                )}
              >
                Percentage
              </button>
              <button
                onClick={() => setType('amount')}
                className={clsx(
                  "flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors",
                  type === 'amount' ? "border-primary bg-primary/5 text-primary" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200"
                )}
              >
                Amount
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Applied Categories</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => toggleCategory('all')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-colors",
                  isAllSelected ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"
                )}
              >
                All
              </button>
              {menuCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-xs font-black border-2 transition-colors",
                    selectedCategories.includes(cat.id) ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <div className="w-5 h-5 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Check size={14} strokeWidth={3} />
            </div>
            <span className="text-xs font-bold text-slate-600">Apply for each matching item in cart</span>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-black text-sm border border-slate-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!value || parseFloat(value) <= 0}
            className="px-8 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-black text-sm shadow-sm transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
