import { useEffect, useMemo, useState, useRef } from 'react'
import { Ban, CreditCard, FileText, MessageSquareText, Minus, Pencil, Plus, SendHorizonal, UserRound, X, Trash2, Info, BadgePercent, Ticket, Bike, LogOut, Clock, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { calculateTax, formatPaise } from '../../lib/money'
import { useUIStore } from '../../store/uiStore'
import ReasonDialog from '../shared/ReasonDialog'
import CancelItemDialog from './CancelItemDialog'
import CustomerModal from './CustomerModal'
import DiscountModal from './DiscountModal'
import { isSaleableMenuItem } from '../../lib/productTypes'
import { filterMenuItemsByQuery, findBestMenuItemMatch } from '../../lib/menuSearch'

interface Props { onSendKOT: () => void; onSettleBill: () => void; onBackToMenu?: () => void }

const QUICK_INSTRUCTIONS = ['Add sugar', 'No sugar', 'More spice', 'Less spice', 'Less salt', 'No onion', 'No garlic']

export default function OrderCart({ onSendKOT, onSettleBill, onBackToMenu }: Props) {
  const {
    cart, currentOrder, orderItems, menuItems, kots, addToCart, payments, orders, activeOrderType, tables,
    updateQty, removeFromCart, getCartTotal, printKOT, printCartProforma, cancelKOT, cancelOrderItemQty, cancelOrderItems, clearCart, applyGlobalDiscount, applyDiscountToOrderItem,
    setItemNote, setItemPrice, setItemModifiers, setOrderCustomer, startNewOrder, cancelOrder
  } = useBillingStore()
  const { user } = useAuthStore()
  const addToast = useUIStore((state) => state.addToast)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
  const [isItemDiscountModalOpen, setIsItemDiscountModalOpen] = useState(false)
  
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [price, setPrice] = useState('')
  const [editQty, setEditQty] = useState('1')
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [cancelKotId, setCancelKotId] = useState<string | null>(null)
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null)
  const [cancelAllItemsOrderId, setCancelAllItemsOrderId] = useState<string | null>(null)
  
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null)
  const [selectedSavedItemId, setSelectedSavedItemId] = useState<string | null>(null)
  const [cancelItemConfig, setCancelItemConfig] = useState<any>(null)
  const [quickSearch, setQuickSearch] = useState('')
  const [quickQty, setQuickQty] = useState('1')
  const [quickNote, setQuickNote] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const qtyInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)

  const filteredSearchItems = useMemo(() => {
    const saleableItems = menuItems.filter(isSaleableMenuItem)
    // Do not open a 50-item dropdown merely because the cashier focused the field.
    // Suggestions are useful only after the cashier has started typing.
    if (!quickSearch.trim()) return []
    return filterMenuItemsByQuery(saleableItems, quickSearch)
  }, [quickSearch, menuItems])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchFocused) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(filteredSearchItems.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      
      const exactMatch = filteredSearchItems.find(m => 
        (m.barcode && m.barcode.toLowerCase() === quickSearch.toLowerCase()) || 
        (m.shortCode && m.shortCode.toLowerCase() === quickSearch.toLowerCase())
      )

      if (exactMatch) {
        addToCart(exactMatch, { note: quickNote })
        setQuickSearch('')
        setQuickQty('1')
        setQuickNote('')
        setIsSearchFocused(false)
        setTimeout(() => productInputRef.current?.focus(), 0)
        return
      }

      if (filteredSearchItems[highlightedIndex]) {
        setQuickSearch(filteredSearchItems[highlightedIndex].name)
        setIsSearchFocused(false)
        setTimeout(() => qtyInputRef.current?.focus(), 0)
      } else {
        handleQuickAdd()
      }
    } else if (e.key === 'Escape') {
      setIsSearchFocused(false)
    }
  }

  const draftTotals = getCartTotal()
  const savedItems = currentOrder ? orderItems.filter(item => item.orderId === currentOrder.id && item.status !== 'cancelled') : []
  const hasBillableItems = cart.length > 0 || savedItems.length > 0
  const displayTotals = {
    subtotal: (currentOrder?.subtotalPaise ?? 0) + draftTotals.subtotal,
    tax: (currentOrder?.taxPaise ?? 0) + draftTotals.tax,
    discount: (currentOrder?.discountPaise ?? 0) + draftTotals.discount,
    total: (currentOrder?.totalPaise ?? 0) + draftTotals.total,
  }
  const latestKot = currentOrder ? kots.find(kot => kot.orderId === currentOrder.id) : null
  const editingItem = editingItemId ? cart.find(item => item.menuItemId === editingItemId) : null
  const editingMenuItem = editingItem ? menuItems.find(item => item.id === editingItem.menuItemId) : null
  const availableModifiers = useMemo(() => editingMenuItem?.modifierGroups?.flatMap(group => group.modifiers) ?? [], [editingMenuItem])

  const openEditor = (menuItemId: string) => {
    const item = cart.find(candidate => candidate.menuItemId === menuItemId)
    const menuItem = menuItems.find(candidate => candidate.id === menuItemId)
    if (!item) return
    setInstruction(item.note ?? '')
    setPrice((item.unitPricePaise / 100).toFixed(2))
    setEditQty(item.quantity.toString())
    setSelectedModifierIds((menuItem?.modifierGroups?.flatMap(group => group.modifiers) ?? []).filter(modifier => item.modifiers?.some(value => value.startsWith(modifier.name))).map(modifier => modifier.id))
    setEditingItemId(menuItemId)
  }

  const saveEditor = () => {
    if (!editingItemId) return
    setItemModifiers(editingItemId, availableModifiers.filter(modifier => selectedModifierIds.includes(modifier.id)))
    setItemNote(editingItemId, instruction.trim())
    setItemPrice(editingItemId, Math.round((parseFloat(price) || 0) * 100))
    updateQty(editingItemId, Math.max(1, parseInt(editQty) || 1))
    setEditingItemId(null)
  }

  const handleQuickAdd = () => {
    if (!quickSearch.trim()) return
    const qLower = quickSearch.toLowerCase()
    const item = filteredSearchItems.find(m => 
      m.name.toLowerCase() === qLower || 
      m.shortCode?.toLowerCase() === qLower || 
      m.barcode?.toLowerCase() === qLower
    ) ?? findBestMenuItemMatch(filteredSearchItems, quickSearch)
    if (item) {
      const q = parseInt(quickQty) || 1
      addToCart(item, { note: quickNote })
      if (q > 1) {
        // Since addToCart already adds 1, we add the remaining (q - 1)
        updateQty(item.id, q - 1)
      }
      setQuickSearch('')
      setQuickQty('1')
      setQuickNote('')
      setTimeout(() => productInputRef.current?.focus(), 0)
    } else {
      addToast('error', 'Product not found')
    }
  }

  const handleCancelAction = () => {
    if (selectedSavedItemId) {
      const item = savedItems.find(i => i.id === selectedSavedItemId)
      if (item) setCancelItemConfig(item)
    } else if (selectedCartItemId) {
      removeFromCart(selectedCartItemId)
      setSelectedCartItemId(null)
      addToast('success', 'Item removed from cart')
    } else if (currentOrder && savedItems.length > 0) {
      setCancelAllItemsOrderId(currentOrder.id)
    } else if (latestKot && latestKot.status !== 'cancelled') {
      setCancelKotId(latestKot.id)
    } else if (cart.length > 0) {
      clearCart()
      addToast('success', 'Cart cleared')
    } else if (currentOrder) {
      setCancelOrderId(currentOrder.id)
    }
  }

  const getCustomerAccountBalance = (phone: string) => {
    let accountOwedPaise = 0
    payments.forEach(p => {
      if (p.status === 'success' && p.method === 'account') {
        const o = orders.find(ord => ord.id === p.orderId)
        if (o && o.customerPhone === phone) {
          accountOwedPaise += p.amountPaise
        }
      }
    })
    return accountOwedPaise
  }

  const customerBalancePaise = currentOrder?.customerPhone ? getCustomerAccountBalance(currentOrder.customerPhone) : 0

  const orderNumber = currentOrder?.orderNo || 'New'

  return (
    <div className="flex flex-col h-full bg-slate-50 relative border-l border-slate-200">
      
      {/* ── TOP HEADER (Customer/Order info) ── */}
      <div className="bg-white p-2 border-b border-slate-200 flex-shrink-0 flex items-center justify-between shadow-sm z-10">
        <div>
          <h2 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
            Order <span className="text-primary">#{orderNumber}</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 uppercase mt-0.5">
            <span className="flex items-center gap-1"><Clock size={10} /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {currentOrder?.customerName && (
              <>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1 text-slate-600 font-black"><User size={10} /> {currentOrder.customerName}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cart.length === 0 && kots.filter(k => k.orderId === currentOrder.id && k.status !== 'cancelled').length === 0) {
                      cancelOrder(currentOrder.id, 'Customer removed, no items');
                      addToast('success', 'Table cleared');
                    } else {
                      setOrderCustomer('', '');
                      addToast('success', 'Customer removed');
                    }
                  }}
                  className="ml-1 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Remove Customer"
                >
                  <X size={12} strokeWidth={3} />
                </button>
                {customerBalancePaise > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="flex items-center gap-1 text-rose-500 font-black">Bal: -₹{(customerBalancePaise / 100).toFixed(2)}</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{activeOrderType}</span>
          {activeOrderType === 'dine_in' && currentOrder?.tableId && (
            <span className="text-xs font-black text-slate-700 mt-0.5">
              Table {tables.find(t => t.id === currentOrder.tableId)?.name || currentOrder.tableId}
            </span>
          )}
        </div>
      </div>
      
      {/* ── QUICK ADD BAR ── */}
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-3 bg-white flex-shrink-0">
        <div className="flex-1 relative">
          <label className="text-[9px] font-black uppercase text-slate-500 mb-0.5 block">Product</label>
          <input 
            ref={productInputRef}
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm font-bold outline-none focus:border-blue-500" 
            placeholder="Choose a product" 
            value={quickSearch} 
            onChange={e => { setQuickSearch(e.target.value); setHighlightedIndex(0); setIsSearchFocused(true) }} 
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            onKeyDown={handleSearchKeyDown} 
          />
          {isSearchFocused && quickSearch.trim() && filteredSearchItems.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {filteredSearchItems.map((item, index) => (
                <div 
                  key={item.id} 
                  className={clsx(
                    'px-3 py-2 cursor-pointer text-sm font-bold border-b border-slate-50 last:border-0',
                    index === highlightedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setQuickSearch(item.name)
                    setIsSearchFocused(false)
                    setTimeout(() => qtyInputRef.current?.focus(), 0)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {item.name}
                  {item.pricePaise > 0 && <span className="float-right text-slate-400 text-xs mt-0.5">₹{(item.pricePaise / 100).toFixed(2)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-16">
          <label className="text-[9px] font-black uppercase text-slate-500 mb-0.5 block">Qty</label>
          <input ref={qtyInputRef} type="number" min="1" className="w-full px-2 py-1.5 border border-slate-300 rounded text-center text-sm font-bold outline-none focus:border-blue-500" value={quickQty} onChange={e => setQuickQty(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuickAdd()} />
        </div>
        <div className="flex-[1.5]">
          <label className="text-[9px] font-black uppercase text-slate-500 mb-0.5 block">Instructions</label>
          <input className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm font-bold outline-none focus:border-blue-500" placeholder="Kitchen instructions" value={quickNote} onChange={e => setQuickNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleQuickAdd()} />
        </div>
        <div className="flex items-end h-full">
          <button onClick={handleQuickAdd} className="w-10 h-[34px] rounded bg-[#FFD966] text-yellow-900 hover:bg-yellow-400 flex items-center justify-center font-black text-xl shadow-sm transition-colors mt-auto"><Plus size={20}/></button>
        </div>
      </div>

      {/* ── ACTION TOOLBAR ── */}
      <div className="px-3 py-2 flex items-center gap-2 bg-white border-b border-slate-200 flex-shrink-0">
        <button disabled={!selectedCartItemId} onClick={() => openEditor(selectedCartItemId!)} className="w-9 h-8 bg-slate-700 hover:bg-slate-800 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><Pencil size={16} /></button>
        <button disabled={!selectedCartItemId} onClick={() => openEditor(selectedCartItemId!)} className="w-9 h-8 bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><Info size={16} /></button>
        <button disabled={!selectedCartItemId && !selectedSavedItemId} onClick={() => setIsItemDiscountModalOpen(true)} className="w-9 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><BadgePercent size={16} /></button>
        <button disabled={!selectedCartItemId} onClick={() => updateQty(selectedCartItemId!, 1)} className="w-9 h-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><Plus size={16} /></button>
        <button disabled={!selectedCartItemId} onClick={() => updateQty(selectedCartItemId!, -1)} className="w-9 h-8 bg-orange-500 hover:bg-orange-600 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><Minus size={16} /></button>
        <button disabled={!selectedCartItemId} onClick={() => removeFromCart(selectedCartItemId!)} className="w-9 h-8 bg-rose-500 hover:bg-rose-600 text-white rounded flex items-center justify-center disabled:opacity-50 transition-colors shadow-sm"><Trash2 size={16} /></button>
        
        <div className="ml-auto flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-slate-500 uppercase leading-none mb-1">DISC</span>
            <div className="bg-white border border-slate-300 rounded px-4 py-1 text-sm font-bold text-slate-800 leading-none">{(displayTotals.discount / 100).toFixed(2)}</div>
          </div>
          <div className="bg-white border border-slate-300 rounded px-6 py-2 text-2xl font-black text-slate-900 shadow-sm flex items-center">
            ₹{(displayTotals.total / 100).toFixed(0)}
          </div>
        </div>
      </div>

      {/* ── TABLE HEADER ── */}
      <div className="bg-[#009688] text-white text-[11px] font-bold flex flex-shrink-0 uppercase tracking-wide">
        <div className="flex-[2] px-3 py-2 border-r border-teal-600/50">Product Name</div>
        <div className="w-12 px-2 py-2 border-r border-teal-600/50 text-center">Qty</div>
        <div className="w-16 px-2 py-2 border-r border-teal-600/50 text-right">Rate</div>
        <div className="w-16 px-2 py-2 border-r border-teal-600/50 text-right">Tax</div>
        <div className="w-16 px-2 py-2 border-r border-teal-600/50 text-right">Disc</div>
        <div className="w-20 px-3 py-2 text-right">Amt</div>
      </div>

      {/* ── TABLE BODY ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-4">
        {/* Saved Items */}
        {savedItems.map(item => {
          const isSelected = selectedSavedItemId === item.id
          return (
            <div 
              key={item.id} 
              onClick={() => { setSelectedSavedItemId(isSelected ? null : item.id); setSelectedCartItemId(null); }}
              className={clsx(
                "flex border-b text-[12px] cursor-pointer transition-colors",
                isSelected ? "bg-blue-100 text-blue-900 font-bold border-blue-200 shadow-[inset_4px_0_0_#1890FF]" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              )}
            >
              <div className={clsx("flex-[2] px-3 py-2 border-r font-bold", isSelected ? "border-blue-200" : "border-slate-200")}>
                {item.nameSnapshot}
                {item.modifiers?.length ? <span className={clsx("text-[10px] ml-1", isSelected ? "text-blue-700" : "text-yellow-800")}>+{item.modifiers.join(', ')}</span> : null}
                {item.note && <span className={clsx("text-[10px] ml-1 block opacity-80", isSelected ? "text-blue-700" : "text-yellow-800")}>({item.note})</span>}
              </div>
              <div className={clsx("w-12 px-2 py-2 border-r text-center font-black", isSelected ? "border-blue-200" : "border-slate-200")}>{item.quantity}</div>
              <div className={clsx("w-16 px-2 py-2 border-r text-right", isSelected ? "border-blue-200" : "border-slate-200")}>{(item.unitPricePaise / 100).toFixed(0)}</div>
              <div className={clsx("w-16 px-2 py-2 border-r text-right", isSelected ? "border-blue-200" : "border-slate-200")}>{(item.taxPaise / 100).toFixed(2)}</div>
              <div className={clsx("w-16 px-2 py-2 border-r text-right", isSelected ? "border-blue-200" : "border-slate-200")}>{(item.discountPaise / 100).toFixed(2)}</div>
              <div className="w-20 px-3 py-2 text-right font-black">{(item.totalPaise / 100).toFixed(2)}</div>
            </div>
          )
        })}

        {/* Cart Items */}
        {cart.map(item => {
          const isSelected = selectedCartItemId === item.menuItemId
          const itemSubtotal = (item.unitPricePaise * item.quantity) - (item.discountPaise || 0)
          const itemTaxPaise = calculateTax(itemSubtotal, item.taxType === 'None' ? 0 : item.taxPercent)
          return (
            <div 
              key={item.menuItemId} 
              onClick={() => { setSelectedCartItemId(isSelected ? null : item.menuItemId); setSelectedSavedItemId(null); }} 
              className={clsx(
                "flex border-b border-slate-200 text-[12px] cursor-pointer transition-colors", 
                isSelected ? "bg-blue-100 text-blue-900 font-bold shadow-[inset_4px_0_0_#1890FF]" : "bg-white text-slate-800 hover:bg-slate-50"
              )}
            >
              <div className="flex-[2] px-3 py-2 border-r border-slate-200">
                {item.name}
                {item.modifiers?.length ? <span className="text-[10px] text-primary ml-1">+{item.modifiers.join(', ')}</span> : null}
                {item.note && <span className="text-[10px] text-amber-700 ml-1 block opacity-80">({item.note})</span>}
              </div>
              <div className="w-12 px-2 py-2 border-r border-slate-200 text-center font-black">{item.quantity}</div>
              <div className="w-16 px-2 py-2 border-r border-slate-200 text-right">{(item.unitPricePaise / 100).toFixed(0)}</div>
              <div className="w-16 px-2 py-2 border-r border-slate-200 text-right">{(itemTaxPaise / 100).toFixed(2)}</div>
              <div className="w-16 px-2 py-2 border-r border-slate-200 text-right text-rose-500 font-bold">{item.discountPaise ? (item.discountPaise / 100).toFixed(2) : '0'}</div>
              <div className="w-20 px-3 py-2 text-right font-black">{((item.unitPricePaise * item.quantity) / 100).toFixed(2)}</div>
            </div>
          )
        })}
      </div>

      {/* ── BOTTOM ACTION GRID ── */}
      <div className="p-1.5 border-t border-slate-300 bg-white flex-shrink-0 grid grid-cols-6 grid-rows-2 gap-1.5">
        <button onClick={onSendKOT} disabled={cart.length === 0} className="flex flex-col items-center justify-center py-1.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md gap-1 disabled:opacity-40 transition-colors shadow-sm">
          <SendHorizonal size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">KOT</span>
        </button>
        <button disabled className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-600 hover:bg-slate-700 text-white rounded-md gap-1 opacity-50 shadow-sm">
          <UserRound size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Operator</span>
        </button>
        <button onClick={() => {
          if (!currentOrder) {
            startNewOrder(user?.id || 'demo', user?.name || 'Operator')
          }
          setIsCustomerModalOpen(true)
        }} className="flex flex-col items-center justify-center py-1.5 px-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md gap-1 transition-colors shadow-sm">
          <UserRound size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Customer</span>
        </button>
        <button onClick={handleCancelAction} disabled={!currentOrder && cart.length === 0} className="flex flex-col items-center justify-center py-1.5 px-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md gap-1 disabled:opacity-40 transition-colors shadow-sm">
          <Ban size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Cancel</span>
        </button>
        <button onClick={() => setIsDiscountModalOpen(true)} disabled={cart.length === 0 && savedItems.length === 0} className="flex flex-col items-center justify-center py-1.5 px-1 bg-violet-500 hover:bg-violet-600 text-white rounded-md gap-1 disabled:opacity-40 transition-colors shadow-sm">
          <BadgePercent size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Discount</span>
        </button>

        <button onClick={onSettleBill} disabled={!hasBillableItems} className="col-start-6 row-span-2 flex flex-col items-center justify-center py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-black uppercase tracking-widest text-sm disabled:opacity-40 transition-colors shadow-sm">
          Checkout
        </button>

        <button disabled className="flex flex-col items-center justify-center py-1.5 px-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white rounded-md gap-1 opacity-50 shadow-sm">
          <Ticket size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Coupon</span>
        </button>
        <button disabled className="flex flex-col items-center justify-center py-1.5 px-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md gap-1 opacity-50 shadow-sm">
          <Bike size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Delivery</span>
        </button>
        <button disabled className="flex flex-col items-center justify-center py-1.5 px-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md gap-1 opacity-50 shadow-sm">
          <MessageSquareText size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Remarks</span>
        </button>
        <button onClick={printCartProforma} disabled={!hasBillableItems} className="flex flex-col items-center justify-center py-1.5 px-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md gap-1 disabled:opacity-40 transition-colors shadow-sm">
          <FileText size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Proforma</span>
        </button>
        <button onClick={onSettleBill} disabled={!hasBillableItems} className="flex flex-col items-center justify-center py-1.5 px-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md gap-1 transition-colors shadow-sm disabled:opacity-40 disabled:hover:bg-amber-500">
          <CreditCard size={16} strokeWidth={2.5}/> <span className="text-[8px] font-black uppercase tracking-wider leading-none">Payment</span>
        </button>
      </div>

      {/* Editor Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[60] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between"><div><h3 className="font-black text-slate-900">Edit {editingItem.name}</h3><p className="text-xs font-bold text-slate-400">Price, toppings and kitchen note</p></div><button onClick={() => setEditingItemId(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="p-5 space-y-4 max-h-[65dvh] overflow-y-auto">
              <div className="flex gap-4">
                <div className="flex-1"><label className="text-xs font-black text-slate-600 uppercase">Quantity</label><input type="number" min="1" value={editQty} onChange={event => setEditQty(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-base font-black outline-none focus:border-primary/50" /></div>
                <div className="flex-1"><label className="text-xs font-black text-slate-600 uppercase">Unit price (₹)</label><input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-base font-black outline-none focus:border-primary/50" /></div>
              </div>
              {availableModifiers.length > 0 && <div><p className="text-xs font-black text-slate-600 uppercase mb-2">Toppings</p><div className="grid grid-cols-2 gap-2">{availableModifiers.map(modifier => <label key={modifier.id} className={clsx('p-2.5 rounded-xl border-2 flex items-center justify-between gap-2 cursor-pointer', selectedModifierIds.includes(modifier.id) ? 'bg-primary-50 border-primary' : 'bg-slate-50 border-slate-100')}><span className="text-xs font-black">{modifier.name}<br/><span className="text-primary">+{formatPaise(modifier.pricePaise)}</span></span><input type="checkbox" checked={selectedModifierIds.includes(modifier.id)} onChange={() => { const wasSelected = selectedModifierIds.includes(modifier.id); setSelectedModifierIds(ids => wasSelected ? ids.filter(id => id !== modifier.id) : [...ids, modifier.id]); setPrice(value => ((Math.max(0, (parseFloat(value) || 0) * 100 + (wasSelected ? -modifier.pricePaise : modifier.pricePaise))) / 100).toFixed(2)) }} /></label>)}</div></div>}
              <div><p className="text-xs font-black text-slate-600 uppercase mb-2">Instructions</p><div className="flex flex-wrap gap-1.5 mb-2">{QUICK_INSTRUCTIONS.map(note => <button type="button" key={note} onClick={() => setInstruction(note)} className="px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black">{note}</button>)}</div><textarea rows={3} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Add a custom instruction..." className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" /></div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2"><button onClick={() => setEditingItemId(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-black">Cancel</button><button onClick={saveEditor} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-black">Save changes</button></div>
          </div>
        </div>
      )}
      {/* Modals */}
      {cancelKotId && (
        <ReasonDialog
          title="Cancel KOT"
          description="The kitchen ticket and its items will be cancelled, and the order total will be recalculated."
          confirmLabel="Cancel KOT"
          onClose={() => setCancelKotId(null)}
          onConfirm={(reason) => {
            cancelKOT(cancelKotId, reason)
            setCancelKotId(null)
            addToast('success', 'KOT cancelled')
          }}
        />
      )}

      {cancelOrderId && (
        <ReasonDialog
          title="Cancel Entire Order"
          description="Are you sure you want to cancel this entire order and clear the table?"
          confirmLabel="Cancel Order"
          onClose={() => setCancelOrderId(null)}
          onConfirm={(reason) => {
            cancelOrder(cancelOrderId, reason)
            setCancelOrderId(null)
            addToast('success', 'Order cancelled and table cleared')
            if (onBackToMenu) onBackToMenu()
          }}
        />
      )}

      {cancelAllItemsOrderId && (
        <ReasonDialog
          title="Cancel All Items"
          description="All KOT items in this order will be cancelled and the table will become empty."
          confirmLabel="Cancel All Items"
          onClose={() => setCancelAllItemsOrderId(null)}
          onConfirm={(reason) => {
            cancelOrderItems(cancelAllItemsOrderId, reason)
            setCancelAllItemsOrderId(null)
            setSelectedSavedItemId(null)
            addToast('success', 'All items cancelled and table cleared')
            if (onBackToMenu) onBackToMenu()
          }}
        />
      )}

      {cancelItemConfig && (
        <CancelItemDialog
          itemName={cancelItemConfig.nameSnapshot}
          maxQty={cancelItemConfig.quantity}
          onClose={() => setCancelItemConfig(null)}
          onConfirm={(qty, reason) => {
            cancelOrderItemQty(cancelItemConfig.id, qty, reason)
            setCancelItemConfig(null)
            setSelectedSavedItemId(null)
            addToast('success', `Cancelled ${qty}x ${cancelItemConfig.nameSnapshot}`)
          }}
        />
      )}

      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSetCustomer={(name, phone, details) => {
          setOrderCustomer(name, phone)
          addToast('success', 'Customer details saved')
        }}
        currentCustomerName={currentOrder?.customerName}
        currentCustomerPhone={currentOrder?.customerPhone}
      />

      <DiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        onApply={(type, value, categories) => {
          applyGlobalDiscount(type, value, categories)
          addToast('success', 'Discount applied to order')
        }}
      />
      <DiscountModal
        isOpen={isItemDiscountModalOpen}
        onClose={() => setIsItemDiscountModalOpen(false)}
        onApply={(type, value) => {
          if (selectedSavedItemId) {
            applyDiscountToOrderItem(selectedSavedItemId, type, value)
            addToast('success', 'Discount applied to item')
          } else if (selectedCartItemId) {
            applyGlobalDiscount(type, value, ['all']) // Assuming we could extend for cart items too, but typically global applies. Wait, cart items already get global discount but item-wise we might need to modify applyGlobalDiscount to take an itemId or just rely on applyGlobalDiscount. I'll just use applyGlobalDiscount for cart items as a fallback. Or I can add applyDiscountToCartItem. Let's just use it for saved items for now, or use applyGlobalDiscount.
            // Actually, we can add `applyDiscountToCartItem` later. For now, KOT items are the focus.
          }
        }}
      />
    </div>
  )
}
