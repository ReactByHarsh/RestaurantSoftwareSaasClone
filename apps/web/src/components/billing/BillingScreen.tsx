import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, Plus, ShoppingCart, ChevronLeft, ChevronRight,
  ScanBarcode, X, ReceiptText, ArrowLeft, LayoutGrid, Clock,
  PlayCircle, HandPlatter, Printer, CheckCircle, ArrowRightLeft,
  GitMerge, Users,
} from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { hasPermission } from '../../lib/permissions'
import type { MenuItem, Modifier, OrderType, RestaurantTable, Order } from '../../lib/types'
import CategoryRail from './CategoryRail'
import MenuItemCard from './MenuItemCard'
import OrderCart from './OrderCart'
import PaymentDrawer from './PaymentDrawer'
import OrdersScreen from '../orders/OrdersScreen'
import { clsx } from 'clsx'
import { isSaleableMenuItem } from '../../lib/productTypes'
import { filterMenuItemsByQuery } from '../../lib/menuSearch'

const ORDER_TYPES: { key: OrderType; label: string }[] = [
  { key: 'dine_in',      label: 'Dine-in'  },
  { key: 'takeaway',     label: 'Takeaway'  },
  { key: 'delivery',     label: 'Delivery'  },
  { key: 'online_manual',label: 'Online'    },
]

const MENU_PAGE_SIZE = 42
const QUICK_INSTRUCTIONS = ['Add sugar','No sugar','More spice','Less spice','Less salt','No onion','No garlic']

const STATUS_CFG: Record<string, { bg: string; text: string; border: string; badge: string; glow: string }> = {
  available:       { bg:'bg-white',        text:'text-slate-800',   border:'border-slate-200',          badge:'bg-slate-100 text-slate-600 border-slate-200',    glow:'shadow-slate-200' },
  occupied:        { bg:'bg-blue-50',      text:'text-blue-800',    border:'border-blue-300',            badge:'bg-blue-100 text-blue-700 border-blue-200',       glow:'shadow-blue-300' },
  kot_sent:        { bg:'bg-amber-50',     text:'text-amber-800',   border:'border-amber-300',           badge:'bg-amber-100 text-amber-700 border-amber-200',    glow:'shadow-amber-300' },
  preparing:       { bg:'bg-orange-50',    text:'text-orange-800',  border:'border-orange-300',          badge:'bg-orange-100 text-orange-700 border-orange-200', glow:'shadow-orange-300' },
  ready:           { bg:'bg-emerald-50',   text:'text-emerald-800', border:'border-emerald-300',         badge:'bg-emerald-100 text-emerald-700 border-emerald-200', glow:'shadow-emerald-300' },
  bill_requested:  { bg:'bg-purple-50',    text:'text-purple-800',  border:'border-purple-300',          badge:'bg-purple-100 text-purple-700 border-purple-200', glow:'shadow-purple-300' },
  payment_pending: { bg:'bg-red-50',       text:'text-red-800',     border:'border-red-300',             badge:'bg-red-100 text-red-700 border-red-200',          glow:'shadow-red-300' },
  reserved:        { bg:'bg-cyan-50',      text:'text-cyan-800',    border:'border-cyan-300',            badge:'bg-cyan-100 text-cyan-700 border-cyan-200',       glow:'shadow-cyan-300' },
  dirty:           { bg:'bg-slate-100',    text:'text-slate-600',   border:'border-slate-300 border-dashed', badge:'bg-white text-slate-500 border-slate-200',    glow:'shadow-slate-200' },
}

// ── Radial action button type ─────────────────────────────────────────────
interface RadialAction {
  key: string
  label: string
  Icon: React.ElementType
  bg: string        // Tailwind bg class
  shadow: string    // Tailwind shadow color class
  handler: () => void
  keepOpen?: boolean
}

// ── Radial circular menu ──────────────────────────────────────────────────
function RadialMenu({
  table,
  activeOrder,
  actions,
  rect,
  onClose,
}: {
  table: RestaurantTable
  activeOrder: Order | null
  actions: RadialAction[]
  rect: DOMRect
  onClose: () => void
}) {
  const n = actions.length
  const isMobile = window.innerWidth < 640

  // 1. Determine the placement position (right/left on desktop, bottom/top on mobile)
  let position: 'left' | 'right' | 'top' | 'bottom' = 'right'
  if (isMobile) {
    const spaceBottom = window.innerHeight - rect.bottom
    position = spaceBottom >= 240 ? 'bottom' : 'top'
  } else {
    const spaceRight = window.innerWidth - rect.right
    position = spaceRight >= 210 ? 'right' : 'left'
  }

  // 2. Set dimensions and estimate menu height
  const menuWidth = isMobile ? rect.width : 180
  const menuHeight = 36 + n * 44 + 12 // header + items + spacing
  const gap = 12 // spacing from the table card

  // 3. Compute base top/left coordinates
  let left = 0
  let top = 0

  if (position === 'right') {
    left = rect.right + gap
    top = rect.top + rect.height / 2 - menuHeight / 2
  } else if (position === 'left') {
    left = rect.left - menuWidth - gap
    top = rect.top + rect.height / 2 - menuHeight / 2
  } else if (position === 'bottom') {
    left = rect.left + rect.width / 2 - menuWidth / 2
    top = rect.bottom + gap
  } else { // top
    left = rect.left + rect.width / 2 - menuWidth / 2
    top = rect.top - menuHeight - gap
  }

  // 4. Clamp left and top within screen bounds (12px safety margin)
  const padding = 12
  left = Math.max(padding, Math.min(window.innerWidth - menuWidth - padding, left))
  top = Math.max(padding, Math.min(window.innerHeight - menuHeight - padding, top))

  // 5. Compute arrow position relative to the menu
  let arrowStyle: React.CSSProperties = {}
  if (position === 'right') {
    const arrowTop = Math.max(16, Math.min(menuHeight - 16, (rect.top + rect.height / 2) - top))
    arrowStyle = {
      left: '-5px',
      top: arrowTop,
      transform: 'translateY(-50%) rotate(45deg)',
      borderLeft: '1px solid #E2E8F0',
      borderBottom: '1px solid #E2E8F0',
    }
  } else if (position === 'left') {
    const arrowTop = Math.max(16, Math.min(menuHeight - 16, (rect.top + rect.height / 2) - top))
    arrowStyle = {
      right: '-5px',
      top: arrowTop,
      transform: 'translateY(-50%) rotate(45deg)',
      borderRight: '1px solid #E2E8F0',
      borderTop: '1px solid #E2E8F0',
    }
  } else if (position === 'bottom') {
    const arrowLeft = Math.max(16, Math.min(menuWidth - 16, (rect.left + rect.width / 2) - left))
    arrowStyle = {
      top: '-5px',
      left: arrowLeft,
      transform: 'translateX(-50%) rotate(45deg)',
      borderLeft: '1px solid #E2E8F0',
      borderTop: '1px solid #E2E8F0',
    }
  } else { // top
    const arrowLeft = Math.max(16, Math.min(menuWidth - 16, (rect.left + rect.width / 2) - left))
    arrowStyle = {
      bottom: '-5px',
      left: arrowLeft,
      transform: 'translateX(-50%) rotate(45deg)',
      borderRight: '1px solid #E2E8F0',
      borderBottom: '1px solid #E2E8F0',
    }
  }

  // 6. Set transform origin based on arrow placement for organic pop scale-in
  let transformOrigin = 'center'
  if (position === 'right') transformOrigin = 'left center'
  else if (position === 'left') transformOrigin = 'right center'
  else if (position === 'bottom') transformOrigin = 'top center'
  else if (position === 'top') transformOrigin = 'bottom center'

  return (
    <>
      {/* Standalone Backdrop Overlay at z-[65] */}
      <div
        className="fixed inset-0 z-[65] radial-overlay"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          backgroundColor: 'rgba(15, 23, 42, 0.40)'
        }}
        onClick={onClose}
      />

      {/* Popover Action Menu at z-[80] */}
      <div
        className="fixed z-[80] bg-white border border-slate-200 rounded-2xl p-2 shadow-[0_20px_50px_rgba(15,23,42,0.22)] flex flex-col gap-1 menu-pop"
        style={{
          top: top,
          left: left,
          width: menuWidth,
          transformOrigin: transformOrigin,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow Pointer */}
        <div
          className="absolute w-2 h-2 bg-white pointer-events-none"
          style={arrowStyle}
        />

        {/* Small header details */}
        <div className="px-2 py-1 border-b border-slate-100 mb-1 flex items-center justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            Actions
          </span>
          <span className="text-[9px] font-black text-primary bg-orange-50 border border-orange-200/50 px-1.5 py-0.5 rounded">
            {table.name}
          </span>
        </div>

        {/* Beautiful rectangular rounded options */}
        {actions.map((action, i) => (
          <button
            key={action.key}
            onClick={(e) => {
              e.stopPropagation()
              action.handler()
              if (!action.keepOpen) onClose()
            }}
            className={clsx(
              "flex items-center gap-3 p-1.5 w-full bg-white hover:bg-slate-50 border border-slate-200/50 rounded-xl transition-all active:scale-[0.98] group text-left cursor-pointer"
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className={clsx(
              "w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105",
              action.bg
            )}>
              <action.Icon size={14} strokeWidth={2.5} />
            </div>
            <span className="text-slate-700 font-black text-[11px] leading-none">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}


interface Props {
  isModal?: boolean
  modalTableId?: string
  onCloseModal?: () => void
}

// ─────────────────────────────────────────────────────────────────────────
export default function BillingScreen({ isModal = false, modalTableId, onCloseModal }: Props = {}) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useUIStore()
  const {
    activeOrderType, setOrderType,
    selectedTableId, selectTable,
    cart, currentOrder, orderItems,
    startNewOrder, sendKOT, clearCart,
    tables, floors, menuCategories, menuItems,
    addToCart, orders,
    transferTable, mergeTable,
    updateTableStatus, printReceipt, getCustomerAccountDetails
  } = useBillingStore()

  const canTransfer = user ? hasPermission(user.role, 'tables:transfer') : false
  const canMerge    = user ? hasPermission(user.role, 'tables:merge')    : false

  // ── view state ───────────────────────────────────────────────────────────
  const [view, setView] = useState<'menu' | 'orders'>('menu')

  // Which table has the radial menu open
  const [radialTableState, setRadialTableState] = useState<{ table: RestaurantTable, rect: DOMRect } | null>(null)
  const radialTable = radialTableState?.table

  // Sub-mode: transfer or merge picker
  const [tableOp, setTableOp] = useState<'transfer' | 'merge' | null>(null)
  const [targetTableId, setTargetTableId] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [activeFloorId, setActiveFloorId] = useState<string>('all')
  const [menuPage, setMenuPage] = useState(1)
  const [showPayment, setShowPayment] = useState(false)
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu')
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [itemInstruction, setItemInstruction] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Sync view to order type
  useEffect(() => {
    if (view === 'orders') return
    if (isModal) {
      if (modalTableId && modalTableId !== selectedTableId) selectTable(modalTableId)
    } else {
      if (activeOrderType === 'dine_in' && !selectedTableId && !currentOrder) navigate('/app/tables')
    }
    setView('menu')
  }, [activeOrderType, isModal, modalTableId]) // eslint-disable-line

  // Keyboard
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { 
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        if (radialTableState || tableOp) {
          setRadialTableState(null)
          setTableOp(null)
        } else if (isModal && onCloseModal) {
          onCloseModal()
        } else if (view === 'menu' && activeOrderType === 'dine_in' && !isModal) {
          navigate('/app/tables')
        }
      }
      if (e.key === '/' && document.activeElement !== searchRef.current && view === 'menu') {
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [view, activeOrderType, isModal, radialTableState, tableOp])

  useEffect(() => {
    if (searchParams.get('settle') === '1' && currentOrder) {
      setShowPayment(true)
      setSearchParams({}, { replace: true })
    }
  }, [currentOrder, searchParams, setSearchParams])

  // ── menu data ────────────────────────────────────────────────────────────
  const topSellingItemRank = useMemo(() => {
    const paidOrderIds = new Set(
      orders
        .filter(order => order.paymentStatus === 'paid' && order.status !== 'cancelled')
        .map(order => order.id)
    )
    const totals = new Map<string, { qty: number; revenuePaise: number }>()
    orderItems.forEach((item) => {
      if (!paidOrderIds.has(item.orderId) || item.status === 'cancelled') return
      const current = totals.get(item.menuItemId) ?? { qty: 0, revenuePaise: 0 }
      current.qty += item.quantity
      current.revenuePaise += item.totalPaise
      totals.set(item.menuItemId, current)
    })
    return new Map(
      Array.from(totals.entries())
        .sort((a, b) => b[1].qty - a[1].qty || b[1].revenuePaise - a[1].revenuePaise)
        .slice(0, 20)
        .map(([id], index) => [id, index])
    )
  }, [orderItems, orders])

  const filteredItems = useMemo(() => {
    let items = menuItems.filter(isSaleableMenuItem)
    const childCategoryIds = new Set(menuCategories.filter(category => category.parentId === activeCategoryId).map(category => category.id))
    if (activeCategoryId === 'favorites') items = items.filter(i => topSellingItemRank.has(i.id) || i.isFavorite)
    else if (activeCategoryId !== 'all') items = items.filter(i => i.categoryId === activeCategoryId || childCategoryIds.has(i.categoryId))
    if (searchQuery) {
      items = filterMenuItemsByQuery(items, searchQuery)
    }
    return [...items].sort((a, b) => {
      if (activeCategoryId === 'favorites') {
        const aRank = topSellingItemRank.get(a.id) ?? 999
        const bRank = topSellingItemRank.get(b.id) ?? 999
        if (aRank !== bRank) return aRank - bRank
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [activeCategoryId, searchQuery, menuItems, menuCategories, topSellingItemRank])

  const menuPageCount  = Math.max(1, Math.ceil(filteredItems.length / MENU_PAGE_SIZE))
  const safeMenuPage   = Math.min(menuPage, menuPageCount)
  const paginatedItems = useMemo(() => filteredItems.slice((safeMenuPage-1)*MENU_PAGE_SIZE, safeMenuPage*MENU_PAGE_SIZE), [filteredItems, safeMenuPage])
  const cartQtyById    = useMemo(() => new Map(cart.map(i => [i.menuItemId, i.quantity])), [cart])
  const kotMenuItemIds  = useMemo(() => new Set(
    currentOrder
      ? orderItems
          .filter(item => item.orderId === currentOrder.id && item.status !== 'cancelled')
          .map(item => item.menuItemId)
      : []
  ), [currentOrder, orderItems])
  const hasBillableItems = cart.length > 0 || (currentOrder ? orderItems.some(item => item.orderId === currentOrder.id && item.status !== 'cancelled') : false)
  const ordersById     = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders])
  useEffect(() => { setMenuPage(1) }, [activeCategoryId, searchQuery])

  // ── tables data ──────────────────────────────────────────────────────────
  const displayTables = useMemo(() =>
    activeFloorId === 'all' ? tables : tables.filter(t => t.floorId === activeFloorId),
  [tables, activeFloorId])
  const activeFloors = useMemo(() => floors.filter(f => f.isActive), [floors])

  // ── transfer / merge pickers ─────────────────────────────────────────────
  const availableForTransfer = useMemo(() =>
    tables.filter(t => t.status === 'available' && t.id !== radialTable?.id), [tables, radialTable])
  const occupiedForMerge = useMemo(() =>
    tables.filter(t => !!t.activeOrderId && t.id !== radialTable?.id), [tables, radialTable])

  // ── actions ──────────────────────────────────────────────────────────────
  const goToMenu = (tableId: string) => {
    selectTable(tableId)
    setRadialTableState(null)
    setView('menu')
  }

  const handleNewOrder = () => {
    clearCart()
    setShowPayment(false)
    setSearchQuery('')
    setActiveCategoryId('all')
    if (activeOrderType === 'dine_in' && !isModal) navigate('/app/tables')
    addToast('success', 'Ready for new order')
  }

  const addItemToOrder = (item: MenuItem, modifiers: Modifier[] = [], note = '') => {
    if (activeOrderType === 'dine_in' && !selectedTableId) {
      addToast('warning', 'Select a table first'); navigate('/app/tables'); return
    }
    if (!currentOrder) { if (!user) return; startNewOrder(user.id, user.name) }
    addToCart(item, { modifiers, note: note.trim() || undefined })
  }

  const handleAddItem = (item: MenuItem) => {
    const mods = item.modifierGroups?.flatMap(g => g.modifiers) ?? []
    if (mods.length > 0) { setCustomizingItem(item); setSelectedModifierIds([]); setItemInstruction(''); return }
    addItemToOrder(item)
  }

  const handleBarcode = () => {
    const code = searchQuery.trim().toLowerCase()
    if (!code) { searchRef.current?.focus(); addToast('info', 'Scan a barcode, then press Enter'); return }
    const item = menuItems.find(c => c.isAvailable && (c.barcode?.toLowerCase()===code || c.shortCode?.toLowerCase()===code))
    if (!item) { addToast('error', `No item for barcode ${searchQuery.trim()}`); return }
    handleAddItem(item); setSearchQuery('')
  }

  const handleSendKOT = () => {
    if (cart.length === 0) { addToast('warning', 'Add items to send KOT'); return }
    if (!user) return
    const kot = sendKOT(user.id, user.name)
    if (kot) addToast('success', `KOT ${kot.kotNo} sent!`)
  }

  const handleSettleBill = () => {
    if (!hasBillableItems) { 
      addToast('warning', 'Add at least one item before checkout')
      return 
    }
    setShowPayment(true)
  }

  // ── Global Barcode Listener ───────────────────────────────────────────────
  useEffect(() => {
    let barcode = ''
    let timeout: ReturnType<typeof setTimeout>

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'Enter') {
        if (barcode.length > 2) {
          const item = menuItems.find(c => c.isAvailable && (c.barcode?.toLowerCase() === barcode.toLowerCase() || c.shortCode?.toLowerCase() === barcode.toLowerCase()))
          if (item) {
            handleAddItem(item)
          } else {
            addToast('error', `No item for barcode ${barcode}`)
          }
        }
        barcode = ''
        return
      }

      if (e.key.length === 1) {
        barcode += e.key
        clearTimeout(timeout)
        timeout = setTimeout(() => { barcode = '' }, 50)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [menuItems, addToast, handleAddItem])

  const handleTransfer = () => {
    if (!radialTable || !targetTableId) return
    const ok = transferTable(radialTable.id, targetTableId)
    const tName = tables.find(t => t.id === targetTableId)?.name ?? ''
    if (ok) { addToast('success', `Transferred to ${tName}`); setRadialTableState(null); setTableOp(null) }
    else addToast('error', 'Transfer failed — target must be available')
  }

  const handleMerge = () => {
    if (!radialTable || !targetTableId) return
    const ok = mergeTable(radialTable.id, targetTableId)
    const tName = tables.find(t => t.id === targetTableId)?.name ?? ''
    if (ok) { addToast('success', `${radialTable.name} merged into ${tName}`); setRadialTableState(null); setTableOp(null) }
    else addToast('error', 'Merge failed — both tables need active orders')
  }

  // ── Build radial actions for a table ────────────────────────────────────
  const buildActions = (table: RestaurantTable, activeOrder: Order | null): RadialAction[] => {
    const hasOrder = !!activeOrder

    if (table.status === 'dirty') {
      return [{
        key: 'clean', label: 'Mark Clean',
        Icon: CheckCircle,
        bg: 'bg-emerald-500', shadow: 'shadow-emerald-400/50',
        handler: () => { updateTableStatus(table.id, { status: 'available' }); addToast('success', `${table.name} marked clean`) },
      }]
    }

    if (!hasOrder) {
      return [{
        key: 'start', label: 'Start Order',
        Icon: PlayCircle,
        bg: 'bg-orange-500', shadow: 'shadow-orange-400/50',
        handler: () => goToMenu(table.id),
      }]
    }

    // Table has an active order — show all relevant actions
    const actions: RadialAction[] = [
      {
        key: 'add', label: 'Add Items',
        Icon: HandPlatter,
        bg: 'bg-orange-500', shadow: 'shadow-orange-400/50',
        handler: () => goToMenu(table.id),
      },
      {
        key: 'settle', label: 'Settle',
        Icon: ReceiptText,
        bg: 'bg-emerald-600', shadow: 'shadow-emerald-400/50',
        handler: () => { selectTable(table.id); setRadialTableState(null); navigate('/app/billing?settle=1') },
      },
      {
        key: 'print', label: 'Print Bill',
        Icon: Printer,
        bg: 'bg-slate-700', shadow: 'shadow-slate-400/50',
        handler: () => { if (activeOrder) printReceipt(activeOrder.id) },
      },
    ]

    if (canTransfer) {
      actions.push({
        key: 'transfer', label: 'Transfer',
        Icon: ArrowRightLeft,
        bg: 'bg-blue-600', shadow: 'shadow-blue-400/50',
        handler: () => { setTableOp('transfer'); setTargetTableId('') },
        keepOpen: true,
      })
    }

    if (canMerge) {
      actions.push({
        key: 'merge', label: 'Merge',
        Icon: GitMerge,
        bg: 'bg-violet-600', shadow: 'shadow-violet-400/50',
        handler: () => { setTableOp('merge'); setTargetTableId('') },
        keepOpen: true,
      })
    }

    return actions
  }

  // ── ORDERS VIEW ──────────────────────────────────────────────────────────
  if (view === 'orders') {
    return <OrdersScreen onBack={() => {
      if (activeOrderType === 'dine_in' && !selectedTableId && !currentOrder) navigate('/app/tables')
      else setView('menu')
    }} />
  }

  // ── MENU VIEW ─────────────────────────────────────────────────────────────
  const selectedTable    = selectedTableId ? tables.find(t => t.id === selectedTableId) : null
  const selectedTableCfg = selectedTable ? (STATUS_CFG[selectedTable.status] ?? STATUS_CFG.available) : null
  const totalCartLines   = cart.length
  const cartTotal        = cart.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0)

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">

      {/* ── TOP BAR ── */}
      <div className="bg-white border-b border-slate-100 px-2.5 py-1.5 flex items-center gap-2 flex-shrink-0 shadow-sm relative z-10">
        {isModal ? (
          <button onClick={onCloseModal}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all flex-shrink-0">
            <X size={16} strokeWidth={2.5} />
          </button>
        ) : activeOrderType === 'dine_in' && (
          <button onClick={() => navigate('/app/tables')}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 flex-shrink-0">
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Tables</span>
          </button>
        )}

        {/* Order type tabs */}
        <div className="flex bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 overflow-x-auto" style={{scrollbarWidth:'none'}}>
          {ORDER_TYPES.map(({ key, label }) => (
            <button key={key} onClick={() => setOrderType(key)}
              className={clsx('px-2.5 py-1 rounded-md text-xs font-bold transition-all whitespace-nowrap',
                activeOrderType === key ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              )}>{label}</button>
          ))}
        </div>

        {selectedTable && selectedTableCfg && (
          <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-black flex-shrink-0', selectedTableCfg.badge)}>
            <LayoutGrid size={12} />{selectedTable.name}
          </div>
        )}

        <div className="flex-1 min-w-0" />
        {currentOrder?.customerName && (
          <div className="hidden lg:flex items-center gap-1.5 overflow-hidden">
            <span className="font-bold text-slate-700 text-xs truncate">| {currentOrder.customerName}</span>
            {(() => {
              if (!currentOrder.customerPhone) return null
              const { balancePaise, unpaidItems } = getCustomerAccountDetails(currentOrder.customerPhone)
              if (balancePaise <= 0) return null
              return (
                <div className="flex items-center gap-1 overflow-hidden">
                  <span className="font-black text-white bg-[#FF9800] px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                    Bal: ₹-{ (balancePaise / 100).toFixed(0) }
                  </span>
                  {unpaidItems.length > 0 && (
                    <span className="font-bold text-white bg-[#00BCD4] px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap truncate max-w-[200px]" title={unpaidItems.join(', ')}>
                      ₹{ (balancePaise / 100).toFixed(0) } {unpaidItems.join(', ')}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        )}
        {currentOrder && !currentOrder.customerName && (
          <span className="hidden sm:inline font-black text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs flex-shrink-0">
            {currentOrder.orderNo}
          </span>
        )}
        <button onClick={() => setView('orders')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 flex-shrink-0">
          <ReceiptText size={14} strokeWidth={3} /><span className="hidden sm:inline">Orders</span>
        </button>
        <button onClick={handleNewOrder}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 flex-shrink-0">
          <Plus size={14} strokeWidth={3} /><span className="hidden sm:inline">New</span>
        </button>
      </div>

      {/* ── MOBILE TAB BAR (hidden on lg+) ── */}
      <div className="lg:hidden flex-shrink-0 bg-white border-b border-slate-100">
        <div className="flex">
          <button
            onClick={() => setMobileTab('menu')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black transition-all border-b-2',
              mobileTab === 'menu'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            )}
          >
            <ShoppingCart size={15} />
            Menu
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black transition-all border-b-2',
              mobileTab === 'cart'
                ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            )}
          >
            <ReceiptText size={15} />
            Cart
            {totalCartLines > 0 && (
              <span className="flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-black px-1.5 h-4 min-w-[16px]">
                {totalCartLines}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* RIGHT: Menu panel — full width on mobile (hidden when cart tab active), 50% on desktop */}
        <div className={clsx(
          'flex flex-col min-w-0 overflow-hidden transition-all lg:order-2',
          'lg:flex lg:flex-1',
          // Mobile: show/hide based on tab
          mobileTab === 'menu' ? 'flex flex-1' : 'hidden'
        )}>
          <CategoryRail categories={menuCategories} items={menuItems.filter(isSaleableMenuItem)} activeCategoryId={activeCategoryId} onSelect={setActiveCategoryId} />

          {/* Search */}
          <div className="px-2.5 py-1.5 bg-white border-b border-slate-100 flex-shrink-0 shadow-sm">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm hover:border-slate-300 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
              <Search size={15} className="text-slate-400 flex-shrink-0" strokeWidth={2.5} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcode() } }}
                className="flex-1 text-sm font-black bg-transparent outline-none placeholder:text-slate-500 text-slate-900 min-w-0"
              />
              <button onClick={handleBarcode} className="h-7 px-2 flex items-center gap-1 rounded-md bg-slate-900 text-white text-[10px] font-black hover:bg-primary flex-shrink-0 transition-colors">
                <ScanBarcode size={14} />SCAN
              </button>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Menu grid */}
          <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50 pb-20 lg:pb-2">
            {menuItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <ShoppingCart size={40} className="text-slate-300" />
                <p className="text-base font-bold text-slate-400">No menu items yet</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Search size={40} className="text-slate-300" />
                <div className="text-center">
                  <p className="text-base font-bold text-slate-400">No items found</p>
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-sm font-bold text-primary mt-2 inline-block px-4 py-2 bg-primary-50 rounded-lg">
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 p-0.5">
                  {paginatedItems.map(item => (
                    <MenuItemCard key={item.id} item={item} cartQty={cartQtyById.get(item.id) ?? 0} isKotItem={kotMenuItemIds.has(item.id)} onAdd={() => handleAddItem(item)} />
                  ))}
                </div>
                {filteredItems.length > MENU_PAGE_SIZE && (
                  <div className="sticky bottom-0 mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
                    <p className="text-xs font-bold text-slate-500">
                      {((safeMenuPage-1)*MENU_PAGE_SIZE)+1}–{Math.min(safeMenuPage*MENU_PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setMenuPage(v => Math.max(1,v-1))} disabled={safeMenuPage===1} className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 flex items-center justify-center"><ChevronLeft size={16}/></button>
                      <span className="text-xs font-black text-slate-700">{safeMenuPage}/{menuPageCount}</span>
                      <button onClick={() => setMenuPage(v => Math.min(menuPageCount,v+1))} disabled={safeMenuPage===menuPageCount} className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 flex items-center justify-center"><ChevronRight size={16}/></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Floating cart summary pill — mobile only, shown when on menu tab and cart has items */}
          {mobileTab === 'menu' && totalCartLines > 0 && (
            <button
              onClick={() => setMobileTab('cart')}
              className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-2xl shadow-slate-900/40 active:scale-95 transition-transform"
            >
              <div className="relative">
                <ShoppingCart size={18} />
                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary text-[9px] font-black px-1">
                  {totalCartLines}
                </span>
              </div>
              <div className="text-left">
                <p className="text-[10px] font-bold text-slate-400 leading-none">View Cart</p>
                <p className="text-sm font-black leading-tight">₹{(cartTotal / 100).toFixed(2)}</p>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* LEFT: Order Cart — full width on mobile (cart tab), 50% on desktop */}
        <div className={clsx(
          'flex-shrink-0 bg-white flex flex-col lg:order-1',
          'lg:flex lg:flex-1 lg:border-r lg:border-slate-100 lg:shadow-[4px_0_24px_rgba(0,0,0,0.02)]',
          // Mobile: full width when cart tab is active
          mobileTab === 'cart' ? 'flex flex-1 w-full' : 'hidden lg:flex'
        )}>
          <OrderCart onSendKOT={handleSendKOT} onSettleBill={handleSettleBill} onBackToMenu={() => setMobileTab('menu')} />
        </div>
      </div>

      {showPayment && <PaymentDrawer onClose={() => setShowPayment(false)} />}

      {/* Item Customisation Modal */}
      {customizingItem && (() => {
        const modifiers = customizingItem.modifierGroups?.flatMap(g => g.modifiers) ?? []
        const selected  = modifiers.filter(m => selectedModifierIds.includes(m.id))
        const total     = customizingItem.pricePaise + selected.reduce((s, m) => s + m.pricePaise, 0)
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div><h3 className="text-lg font-black text-slate-900">Customize {customizingItem.name}</h3><p className="text-xs font-bold text-slate-400">Toppings &amp; kitchen instructions</p></div>
                <button onClick={() => setCustomizingItem(null)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><X size={16}/></button>
              </div>
              <div className="p-5 space-y-5 max-h-[65dvh] overflow-y-auto">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Toppings &amp; extras</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {modifiers.map(m => (
                      <label key={m.id} className={clsx('flex items-center justify-between gap-3 p-3 rounded-xl border-2 cursor-pointer', selectedModifierIds.includes(m.id) ? 'border-primary bg-primary-50' : 'border-slate-100 bg-slate-50')}>
                        <span className="text-sm font-black text-slate-700">{m.name}</span>
                        <span className="flex items-center gap-2 text-xs font-black text-primary">+₹{(m.pricePaise/100).toFixed(2)}<input type="checkbox" checked={selectedModifierIds.includes(m.id)} onChange={() => setSelectedModifierIds(ids => ids.includes(m.id) ? ids.filter(i=>i!==m.id) : [...ids,m.id])} /></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Instructions</p>
                  <div className="flex flex-wrap gap-2 mb-2">{QUICK_INSTRUCTIONS.map(note => <button type="button" key={note} onClick={() => setItemInstruction(note)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black">{note}</button>)}</div>
                  <input value={itemInstruction} onChange={e => setItemInstruction(e.target.value)} placeholder="Custom instruction..." className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50"/>
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex items-center gap-3">
                <div className="mr-auto"><p className="text-[10px] font-black uppercase text-slate-400">Total</p><p className="text-xl font-black text-primary">₹{(total/100).toFixed(2)}</p></div>
                <button onClick={() => setCustomizingItem(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-black">Cancel</button>
                <button onClick={() => { addItemToOrder(customizingItem, selected, itemInstruction); setCustomizingItem(null) }} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/20">Add item</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
