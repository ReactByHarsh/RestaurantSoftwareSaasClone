import { useState, useMemo } from 'react'
import { Search, SendHorizonal, ReceiptText, Plus, Minus, Tag } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { QUICK_NOTES } from '../../lib/data'
import { formatPaise } from '../../lib/money'
import AssignedTables from './AssignedTables'
import { clsx } from 'clsx'

export default function CaptainScreen() {
  const { user } = useAuthStore()
  const { addToast } = useUIStore()
  const {
    tables,
    selectedTableId,
    selectTable,
    cart,
    addToCart,
    removeFromCart,
    updateQty,
    sendKOT,
    setItemNote,
    menuCategories,
    menuItems,
  } = useBillingStore()

  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null) // For note entry

  const filteredItems = useMemo(() => {
    let items = menuItems.filter(i => i.isAvailable)
    if (activeCategoryId !== 'all') {
      items = items.filter(i => i.categoryId === activeCategoryId)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(i => i.name.toLowerCase().includes(q))
    }
    return items
  }, [activeCategoryId, searchQuery, menuItems])

  const handleSendKOT = () => {
    if (!user) return
    if (cart.length === 0) {
      addToast('warning', 'Add items first')
      return
    }
    if (!selectedTableId) {
      addToast('warning', 'Select a table first')
      return
    }
    
    const kot = sendKOT(user.id, user.name)
    if (kot) {
      addToast('success', `KOT ${kot.kotNo} sent!`)
      setSelectedItemId(null)
    }
  }

  const handleAddNote = (note: string) => {
    if (selectedItemId) {
      setItemNote(selectedItemId, note)
      setSelectedItemId(null)
      addToast('info', 'Note added')
    }
  }

  const tableSelected = selectedTableId != null

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* Tables Strip */}
      <AssignedTables
        tables={tables}
        selectedId={selectedTableId}
        onSelect={selectTable}
      />

      {tableSelected ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search & Categories */}
          <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 bg-white border-b border-slate-100 flex-shrink-0 scrollbar-hide z-10 shadow-sm relative">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-colors flex-shrink-0 w-[140px] sm:w-[200px]">
              <Search size={14} strokeWidth={2.5} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-xs font-bold placeholder:text-slate-400 text-slate-800 w-full"
              />
            </div>
            
            <div className="w-px h-6 bg-slate-200 flex-shrink-0 mx-1" />

            <button
              onClick={() => setActiveCategoryId('all')}
              className={clsx(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all active:scale-95',
                activeCategoryId === 'all'
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                  : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              )}
            >
              All
            </button>
            {menuCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={clsx(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all active:scale-95',
                  activeCategoryId === cat.id
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                    : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu List */}
          <div className="flex-1 overflow-y-auto px-2 py-2 pb-24 bg-slate-50/50">
            <div className="space-y-1.5">
              {menuItems.length === 0 ? (
                <div className="p-8 text-center text-sm font-bold text-slate-400">No menu items yet. Ask admin to add the menu first.</div>
              ) : filteredItems.map(item => {
                const cartItem = cart.find(c => c.menuItemId === item.id)
                const qty = cartItem?.quantity || 0

                return (
                  <div key={item.id} className="bg-white rounded-lg p-2 border border-slate-200 flex flex-row items-center justify-between gap-2 shadow-sm transition-all hover:border-slate-300">
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <div className={clsx(
                        'w-3 h-3 rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0',
                        item.itemType === 'veg' ? 'border-green-600' : 'border-red-600'
                      )}>
                        <div className={clsx(
                          'w-1.5 h-1.5 rounded-full',
                          item.itemType === 'veg' ? 'bg-green-600' : 'bg-red-600'
                        )} />
                      </div>
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                        <p className="font-black text-slate-800 text-sm tracking-tight truncate">{item.name}</p>
                        <p className="text-primary font-black text-sm whitespace-nowrap">{formatPaise(item.pricePaise)}</p>
                      </div>
                    </div>
                    {cartItem?.note && (
                      <div className="w-full mt-1 hidden">
                        <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                          <Tag size={10} strokeWidth={2.5} /> {cartItem.note}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {qty > 0 ? (
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-lg">
                          <button
                            onClick={() => setSelectedItemId(item.id)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-all"
                          >
                            <Tag size={14} strokeWidth={2.5} />
                          </button>
                          <div className="w-px h-4 bg-slate-200 mx-0.5" />
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="w-7 h-7 rounded-md bg-white shadow-sm border border-slate-200 text-slate-600 flex items-center justify-center hover:text-primary active:scale-95 transition-all"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className="w-5 text-center font-black text-sm">{qty}</span>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            className="w-7 h-7 rounded-md bg-primary text-white shadow-sm flex items-center justify-center active:scale-95 hover:bg-primary-dark transition-all"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-primary text-slate-600 hover:text-white font-black text-xs active:scale-95 transition-all shadow-sm border border-slate-200 hover:border-primary"
                        >
                          ADD
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <ReceiptText size={32} className="text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">Select a Table</h2>
          <p className="text-sm">Tap on a table above to start taking orders.</p>
        </div>
      )}

      {/* Note Modal */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 pb-safe animate-slide-in-up">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Add Cooking Note</h3>
            <div className="flex flex-wrap gap-2 mb-6">
              {QUICK_NOTES.map(note => (
                <button
                  key={note}
                  onClick={() => handleAddNote(note)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
                >
                  {note}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectedItemId(null)}
              className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      {tableSelected && (
        <div className="fixed bottom-[56px] md:bottom-0 left-0 md:left-64 right-0 p-3 bg-white/80 backdrop-blur-xl border-t border-slate-200/50 z-30 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              disabled
              className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold text-sm shadow-sm disabled:opacity-50"
            >
              <ReceiptText size={18} strokeWidth={2.5} />
              Request Bill
            </button>
            <button
              onClick={handleSendKOT}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-2 py-3 bg-accent text-white rounded-xl font-bold text-sm active:scale-95 transition-all shadow-md shadow-accent/20 disabled:opacity-50 disabled:shadow-none"
            >
              <SendHorizonal size={18} strokeWidth={2.5} />
              Send KOT ({cart.length})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
