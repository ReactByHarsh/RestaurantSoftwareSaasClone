import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, ClipboardList, FileText, Package, Pencil, Plus, Save, ScanLine, Search, ShoppingCart, Trash2, TrendingUp, X } from 'lucide-react'
import { clsx } from 'clsx'
import { formatPaise } from '../../lib/money'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import type { PurchaseEntry, StockUnit } from '../../lib/types'

type InventoryTab = 'stock' | 'purchase' | 'purchaseReport' | 'stockReport' | 'profitReport'
type PurchasePaymentMode = 'cash' | 'card' | 'upi'

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'nos', 'plate', 'portion']
const PAYMENT_MODES: Array<{ id: PurchasePaymentMode; label: string }> = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
]
const FIELD_CLASS = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10'

type PurchaseDraft = {
  supplier: string
  invoiceNo: string
  barcode: string
  itemName: string
  unit: StockUnit
  unitSize: string
  quantity: string
  rate: string
  gstPercent: string
  vatPercent: string
  paymentMode: PurchasePaymentMode
  minimumStock: string
}

type PurchaseLine = Omit<PurchaseDraft, 'unitSize'> & {
  id: string
  inventoryItemId?: string
  menuItemId?: string
  unitSize: number
  stockQuantity: number
  basePaise: number
  gstPaise: number
  vatPaise: number
  totalPaise: number
}

const emptyDraft: PurchaseDraft = {
  supplier: '',
  invoiceNo: '',
  barcode: '',
  itemName: '',
  unit: 'kg',
  unitSize: '1',
  quantity: '1',
  rate: '0',
  gstPercent: '0',
  vatPercent: '0',
  paymentMode: 'cash',
  minimumStock: '',
}

function convertStockQuantity(quantity: number, from: StockUnit, to: StockUnit) {
  if (from === to) return quantity
  if (from === 'kg' && to === 'g') return quantity * 1000
  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'l' && to === 'ml') return quantity * 1000
  if (from === 'ml' && to === 'l') return quantity / 1000
  return null
}

function dateKey(value?: string) {
  return (value ?? new Date().toISOString()).slice(0, 10)
}

function monthKey(value?: string) {
  return dateKey(value).slice(0, 7)
}

export default function InventoryScreen() {
  const { addToast } = useUIStore()
  const {
    inventoryItems: items,
    purchaseEntries,
    menuItems,
    menuCategories,
    orders,
    orderItems,
    addPurchaseEntry,
    updatePurchaseEntry,
    deletePurchaseEntry,
    updateInventoryItem,
  } = useBillingStore()

  const [activeTab, setActiveTab] = useState<InventoryTab>('stock')
  const [searchQuery, setSearchQuery] = useState('')
  const [actualStock, setActualStock] = useState<Record<string, string>>({})
  const [alertLevels, setAlertLevels] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>(emptyDraft)
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([])
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
  const [purchasePage, setPurchasePage] = useState(1)

  const purchaseProducts = useMemo(() => {
    return menuItems
      .filter(item => ['sale_purchase', 'purchase_only', 'kitchen_processed'].includes(item.productType ?? 'sale_only'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [menuItems])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const source = [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (!q) return source
    return source.filter(item => item.name.toLowerCase().includes(q) || item.supplier?.toLowerCase().includes(q))
  }, [items, searchQuery])

  const summary = useMemo(() => {
    return items.reduce((value, item) => {
      value.total += item.costPerUnit * item.currentStock
      if (item.currentStock === 0) value.out += 1
      else if (item.currentStock <= item.minimumStock) value.low += 1
      return value
    }, { total: 0, low: 0, out: 0 })
  }, [items])

  const paidOrderIds = useMemo(() => new Set(orders.filter(order => order.paymentStatus === 'paid' && order.status !== 'cancelled').map(order => order.id)), [orders])
  const todaySalesDate = dateKey()
  const thisMonth = monthKey()

  const stockReport = useMemo(() => {
    return menuItems.map(item => {
      const soldItems = orderItems.filter(orderItem => orderItem.menuItemId === item.id && paidOrderIds.has(orderItem.orderId) && orderItem.status !== 'cancelled')
      const ordersById = new Map(orders.map(order => [order.id, order]))
      const todayQty = soldItems.filter(orderItem => dateKey(ordersById.get(orderItem.orderId)?.closedAt ?? ordersById.get(orderItem.orderId)?.createdAt) === todaySalesDate).reduce((sum, orderItem) => sum + orderItem.quantity, 0)
      const monthQty = soldItems.filter(orderItem => monthKey(ordersById.get(orderItem.orderId)?.closedAt ?? ordersById.get(orderItem.orderId)?.createdAt) === thisMonth).reduce((sum, orderItem) => sum + orderItem.quantity, 0)
      const revenuePaise = soldItems.reduce((sum, orderItem) => sum + orderItem.totalPaise, 0)
      const stock = items.find(inv => inv.name.toLowerCase() === item.name.toLowerCase())
      const category = menuCategories.find(category => category.id === item.categoryId)
      return { item, categoryName: category?.name ?? 'Uncategorised', stock, todayQty, monthQty, revenuePaise }
    }).sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.item.name.localeCompare(b.item.name))
  }, [items, menuCategories, menuItems, orderItems, orders, paidOrderIds, thisMonth, todaySalesDate])

  const categoryReport = useMemo(() => {
    const rows = new Map<string, { category: string; items: number; todayQty: number; monthQty: number; revenuePaise: number; currentStock: number }>()
    stockReport.forEach(row => {
      const current = rows.get(row.categoryName) ?? { category: row.categoryName, items: 0, todayQty: 0, monthQty: 0, revenuePaise: 0, currentStock: 0 }
      current.items += 1
      current.todayQty += row.todayQty
      current.monthQty += row.monthQty
      current.revenuePaise += row.revenuePaise
      current.currentStock += row.stock?.currentStock ?? 0
      rows.set(row.categoryName, current)
    })
    return Array.from(rows.values()).sort((a, b) => a.category.localeCompare(b.category))
  }, [stockReport])

  const purchaseTotals = useMemo(() => purchaseEntries.reduce((acc, entry) => {
    acc.base += entry.basePaise
    acc.gst += entry.gstPaise
    acc.vat += entry.vatPaise
    acc.total += entry.totalPaise
    acc.qty += entry.stockQuantity
    return acc
  }, { base: 0, gst: 0, vat: 0, total: 0, qty: 0 }), [purchaseEntries])

  const salesTotalPaise = useMemo(() => orders.filter(order => paidOrderIds.has(order.id)).reduce((sum, order) => sum + order.totalPaise, 0), [orders, paidOrderIds])
  const profitPaise = salesTotalPaise - purchaseTotals.total

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const source = [...purchaseEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (!q) return source
    return source.filter(entry =>
      entry.itemName.toLowerCase().includes(q) ||
      entry.supplier?.toLowerCase().includes(q) ||
      entry.invoiceNo?.toLowerCase().includes(q) ||
      entry.barcode?.toLowerCase().includes(q)
    )
  }, [purchaseEntries, searchQuery])
  const purchasePageCount = Math.max(1, Math.ceil(filteredPurchases.length / 8))
  const visiblePurchases = filteredPurchases.slice((purchasePage - 1) * 8, purchasePage * 8)

  const purchasePreview = useMemo(() => buildPurchaseLine(purchaseDraft, items, purchaseProducts), [items, purchaseDraft, purchaseProducts])

  const fillProductFromCode = (code: string) => {
    const q = code.trim().toLowerCase()
    if (!q) return
    const product = purchaseProducts.find(item => item.barcode?.toLowerCase() === q || item.shortCode?.toLowerCase() === q || item.name.toLowerCase() === q)
    const stock = items.find(item => item.name.toLowerCase() === q)
    if (!product && !stock) {
      addToast('warning', 'No product found for this barcode or code')
      return
    }
    setPurchaseDraft(value => ({
      ...value,
      barcode: code,
      itemName: product?.name ?? stock?.name ?? value.itemName,
      unit: product?.primaryUnit ?? stock?.unit ?? value.unit,
      rate: product?.costPricePaise ? String(product.costPricePaise / 100) : value.rate,
      minimumStock: stock?.minimumStock ? String(stock.minimumStock) : value.minimumStock,
    }))
  }

  const handleSaveStockUpdate = () => {
    let updated = 0
    filteredItems.forEach(item => {
      const raw = actualStock[item.id]
      const alertRaw = alertLevels[item.id]
      if ((raw === undefined || raw.trim() === '') && (alertRaw === undefined || alertRaw.trim() === '')) return
      const nextStock = raw === undefined || raw.trim() === '' ? item.currentStock : Number(raw)
      const nextAlert = alertRaw === undefined || alertRaw.trim() === '' ? item.minimumStock : Number(alertRaw)
      if (!Number.isFinite(nextStock) || nextStock < 0 || !Number.isFinite(nextAlert) || nextAlert < 0) return
      const reason = reasons[item.id]?.trim()
      updateInventoryItem(item.id, {
        currentStock: nextStock,
        minimumStock: nextAlert,
        supplier: reason ? `${item.supplier || ''}${item.supplier ? ' | ' : ''}Adj: ${reason}` : item.supplier,
      })
      updated++
    })
    setActualStock({})
    setAlertLevels({})
    setReasons({})
    addToast(updated ? 'success' : 'warning', updated ? `Updated ${updated} stock item${updated === 1 ? '' : 's'}` : 'Enter actual stock for at least one item')
  }

  const addDraftLine = () => {
    if (!purchasePreview) {
      addToast('error', 'Item, unit size, quantity, and rate are required')
      return
    }
    if (editingEntryId) {
      updatePurchaseEntry(editingEntryId, toPurchaseUpdateInput(purchasePreview))
      setEditingEntryId(null)
      setPurchaseDraft(emptyDraft)
      setPurchaseModalOpen(false)
      addToast('success', 'Purchase entry updated')
      return
    }
    setPurchaseLines(lines => [purchasePreview, ...lines])
    setPurchaseDraft(value => ({ ...emptyDraft, supplier: value.supplier, invoiceNo: value.invoiceNo, paymentMode: value.paymentMode }))
  }

  const savePurchaseBatch = () => {
    const linesToSave = purchaseLines.length > 0 ? purchaseLines : (purchasePreview ? [purchasePreview] : [])
    if (linesToSave.length === 0) {
      addToast('warning', 'Add at least one purchase line')
      return
    }
    linesToSave.forEach(line => addPurchaseEntry(toPurchaseInput(line)))
    addToast('success', `${linesToSave.length} purchase line${linesToSave.length === 1 ? '' : 's'} saved to stock`)
    setPurchaseLines([])
    setPurchaseDraft(emptyDraft)
    setPurchaseModalOpen(false)
    setPurchasePage(1)
  }

  const editEntry = (entry: PurchaseEntry) => {
    setActiveTab('purchase')
    setEditingEntryId(entry.id)
    setPurchaseModalOpen(true)
    setPurchaseDraft({
      supplier: entry.supplier ?? '',
      invoiceNo: entry.invoiceNo ?? '',
      barcode: entry.barcode ?? '',
      itemName: entry.itemName,
      unit: entry.unit,
      unitSize: String(entry.unitSize),
      quantity: String(entry.quantity),
      rate: String(entry.ratePaise / 100),
      gstPercent: String(entry.gstPercent),
      vatPercent: String(entry.vatPercent),
      paymentMode: entry.paymentMode,
      minimumStock: '',
    })
  }

  const resetPurchaseModal = () => {
    setEditingEntryId(null)
    setPurchaseDraft(emptyDraft)
    setPurchaseModalOpen(false)
  }

  const purchaseEntryFields = (
    <div className="grid grid-cols-1 md:grid-cols-8 gap-2 items-end">
      <Field label="Supplier" className="md:col-span-2"><input value={purchaseDraft.supplier} onChange={event => setPurchaseDraft(value => ({ ...value, supplier: event.target.value }))} placeholder="Supplier name" className={FIELD_CLASS} /></Field>
      <Field label="Invoice No"><input value={purchaseDraft.invoiceNo} onChange={event => setPurchaseDraft(value => ({ ...value, invoiceNo: event.target.value }))} placeholder="Optional" className={FIELD_CLASS} /></Field>
      <Field label="Barcode / Code" className="md:col-span-2">
        <div className="flex gap-1">
          <input value={purchaseDraft.barcode} onChange={event => setPurchaseDraft(value => ({ ...value, barcode: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); fillProductFromCode(purchaseDraft.barcode) } }} placeholder="Scan or type code" className={FIELD_CLASS} />
          <button type="button" onClick={() => fillProductFromCode(purchaseDraft.barcode)} className="px-3 rounded-lg bg-slate-900 text-white"><ScanLine size={15} /></button>
        </div>
      </Field>
      <Field label="Item Name" className="md:col-span-2"><input value={purchaseDraft.itemName} onChange={event => setPurchaseDraft(value => ({ ...value, itemName: event.target.value }))} list="purchase-item-options" placeholder="Type or select item" className={FIELD_CLASS} /><datalist id="purchase-item-options">{items.map(item => <option key={item.id} value={item.name} />)}{purchaseProducts.map(item => <option key={item.id} value={item.name} />)}</datalist></Field>
      <Field label="Unit"><select value={purchaseDraft.unit} onChange={event => setPurchaseDraft(value => ({ ...value, unit: event.target.value as StockUnit }))} className={`${FIELD_CLASS} bg-white`}>{UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
      <Field label="Unit Size"><input value={purchaseDraft.unitSize} onChange={event => setPurchaseDraft(value => ({ ...value, unitSize: event.target.value }))} type="number" step="0.01" min="0.01" placeholder="100" className={FIELD_CLASS} /></Field>
      <Field label="Qty"><input value={purchaseDraft.quantity} onChange={event => setPurchaseDraft(value => ({ ...value, quantity: event.target.value }))} type="number" step="0.01" min="0.01" placeholder="5" className={FIELD_CLASS} /></Field>
      <Field label="Rate / Qty"><input value={purchaseDraft.rate} onChange={event => setPurchaseDraft(value => ({ ...value, rate: event.target.value }))} type="number" step="0.01" min="0" className={FIELD_CLASS} /></Field>
      <Field label="GST %"><input value={purchaseDraft.gstPercent} onChange={event => setPurchaseDraft(value => ({ ...value, gstPercent: event.target.value }))} type="number" step="0.01" min="0" className={FIELD_CLASS} /></Field>
      <Field label="VAT %"><input value={purchaseDraft.vatPercent} onChange={event => setPurchaseDraft(value => ({ ...value, vatPercent: event.target.value }))} type="number" step="0.01" min="0" className={FIELD_CLASS} /></Field>
      <Field label="Payment"><select value={purchaseDraft.paymentMode} onChange={event => setPurchaseDraft(value => ({ ...value, paymentMode: event.target.value as PurchasePaymentMode }))} className={`${FIELD_CLASS} bg-white`}>{PAYMENT_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>
      <Field label="Min Stock"><input value={purchaseDraft.minimumStock} onChange={event => setPurchaseDraft(value => ({ ...value, minimumStock: event.target.value }))} type="number" step="0.01" min="0" placeholder="0" className={FIELD_CLASS} /></Field>
      <div className="md:col-span-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Purchase Total</p>
        <p className="text-sm font-black text-slate-800">{purchasePreview?.stockQuantity ?? 0} {purchaseDraft.unit} stock | {formatPaise(purchasePreview?.totalPaise ?? 0)}</p>
        <p className="text-[10px] font-bold text-slate-500">GST {formatPaise(purchasePreview?.gstPaise ?? 0)} + VAT {formatPaise(purchasePreview?.vatPaise ?? 0)}</p>
      </div>
      <button type="button" onClick={addDraftLine} className="md:col-span-2 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary text-white text-xs font-black rounded-lg shadow-md shadow-primary/20 hover:bg-primary-dark"><Plus size={15} /> {editingEntryId ? 'SAVE CHANGES' : 'ADD LINE'}</button>
      {!editingEntryId && <button type="button" onClick={savePurchaseBatch} className="md:col-span-3 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-xs font-black rounded-lg shadow-md shadow-emerald-600/20 hover:bg-emerald-700"><Save size={15} /> SAVE PURCHASE</button>}
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex-shrink-0 flex flex-col xl:flex-row xl:items-center justify-between gap-3 shadow-sm relative z-20">
        <div className="flex items-center gap-2.5">
          <Package size={18} className="text-primary" strokeWidth={2.5} />
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">Inventory</h1>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Stock, purchases, scanner entry, and reports</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([
            ['stock', ClipboardList, 'Stock Update'],
            ['purchase', ShoppingCart, 'Purchase Entry'],
            ['purchaseReport', FileText, 'Purchase Report'],
            ['stockReport', BarChart3, 'Stock Report'],
            ['profitReport', TrendingUp, 'Profit'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black transition-all', activeTab === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {(summary.low > 0 || summary.out > 0) && activeTab !== 'purchase' && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-center gap-3 flex-shrink-0 shadow-sm">
          <AlertTriangle size={16} className="text-red-500" strokeWidth={2.5} />
          <p className="text-xs font-bold text-red-700">{summary.out} out of stock. {summary.low} running low.</p>
        </div>
      )}

      {activeTab !== 'purchase' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 flex-shrink-0">
          <Stat label="Total Items" value={String(items.length)} />
          <Stat label="Stock Value" value={formatPaise(summary.total)} tone="primary" />
          <Stat label="Out Of Stock" value={String(summary.out)} tone="red" />
          <Stat label="Low Stock" value={String(summary.low)} tone="amber" />
        </div>
      )}

      <div className="flex-1 px-4 pb-4 overflow-hidden">
        {activeTab === 'stock' && (
          <Panel title="Current Stock List" subtitle="Enter actual stock only where there is a mismatch." action={<SearchBox value={searchQuery} onChange={setSearchQuery} />}>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-blue-100/70 border-b border-blue-200 sticky top-0 z-10">
                  <tr><Th>Product Name</Th><Th>System Stock</Th><Th>Actual Stock</Th><Th>Alert Level</Th><Th>Edit Reason</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="odd:bg-slate-50/60 hover:bg-primary-50/30">
                      <td className="px-3 py-2 font-bold text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 font-black text-slate-700">{item.currentStock} <span className="text-slate-400 font-bold">{item.unit}</span></td>
                      <td className="px-3 py-1.5"><input value={actualStock[item.id] ?? ''} onChange={event => setActualStock(value => ({ ...value, [item.id]: event.target.value }))} type="number" step="0.01" min="0" placeholder="Enter" className="w-24 bg-transparent border-b border-slate-300 px-1 py-1 outline-none focus:border-primary font-bold" /></td>
                      <td className="px-3 py-1.5"><input value={alertLevels[item.id] ?? ''} onChange={event => setAlertLevels(value => ({ ...value, [item.id]: event.target.value }))} type="number" step="0.01" min="0" placeholder={String(item.minimumStock)} className="w-24 bg-transparent border-b border-slate-300 px-1 py-1 outline-none focus:border-primary font-bold" /></td>
                      <td className="px-3 py-1.5"><input value={reasons[item.id] ?? ''} onChange={event => setReasons(value => ({ ...value, [item.id]: event.target.value }))} placeholder="Enter reason" className="w-full max-w-md bg-transparent border-b border-slate-300 px-1 py-1 outline-none focus:border-primary font-bold" /></td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && <EmptyRow colSpan={5} />}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-slate-100 flex justify-end">
              <button onClick={handleSaveStockUpdate} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-black rounded-lg shadow-md shadow-primary/20 hover:bg-primary-dark"><Save size={14} /> SAVE STOCK</button>
            </div>
          </Panel>
        )}

        {activeTab === 'purchase' && (
          <div className="h-full grid grid-rows-[auto_1fr] gap-3">
            <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><h2 className="text-sm font-black text-slate-800">Purchase Entry</h2><p className="text-[10px] font-bold text-slate-500">Add purchases in a modal, then save them to stock.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {purchaseLines.length > 0 && <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-black">{purchaseLines.length} unsaved</span>}
                <button type="button" onClick={() => { setEditingEntryId(null); setPurchaseDraft(emptyDraft); setPurchaseModalOpen(true) }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-black shadow-sm hover:bg-primary-dark">
                  <Plus size={15} /> NEW PURCHASE
                </button>
                <button type="button" onClick={savePurchaseBatch} disabled={purchaseLines.length === 0 && !purchasePreview} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black shadow-sm hover:bg-emerald-700 disabled:opacity-40">
                  <Save size={14} /> SAVE PURCHASE
                </button>
              </div>
            </div>

            <Panel title="Purchase Lines & Entries" subtitle="New batch lines are saved together. Existing saved entries can be edited or deleted." action={<SearchBox value={searchQuery} onChange={setSearchQuery} />}>
              {purchaseLines.length > 0 && (
                <div className="p-2 border-b border-slate-100 bg-amber-50/60">
                  <div className="flex items-center justify-between mb-2"><p className="text-xs font-black text-amber-800">Unsaved batch: {purchaseLines.length} line(s)</p><button onClick={savePurchaseBatch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black"><Save size={13} /> SAVE PURCHASE BATCH</button></div>
                  <CompactPurchaseTable rows={purchaseLines} draft onDelete={id => setPurchaseLines(lines => lines.filter(line => line.id !== id))} />
                </div>
              )}
              <div className="flex-1 overflow-auto"><PurchaseTable rows={visiblePurchases} onEdit={editEntry} onDelete={id => { deletePurchaseEntry(id); addToast('success', 'Purchase entry deleted') }} /></div>
              <Pager page={purchasePage} pageCount={purchasePageCount} onPage={setPurchasePage} />
            </Panel>
          </div>
        )}

        {activeTab === 'purchaseReport' && (
          <ReportShell title="Purchase Order Report" subtitle="Purchase amount, taxes, supplier, invoice, and stock quantity." action={<SearchBox value={searchQuery} onChange={setSearchQuery} />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border-b border-slate-100">
              <Stat label="Entries" value={String(purchaseEntries.length)} />
              <Stat label="Stock Qty" value={purchaseTotals.qty.toFixed(2)} />
              <Stat label="Tax" value={formatPaise(purchaseTotals.gst + purchaseTotals.vat)} tone="amber" />
              <Stat label="Purchase Total" value={formatPaise(purchaseTotals.total)} tone="primary" />
            </div>
            <div className="flex-1 overflow-auto"><PurchaseTable rows={visiblePurchases} onEdit={editEntry} onDelete={id => { deletePurchaseEntry(id); addToast('success', 'Purchase entry deleted') }} /></div>
            <Pager page={purchasePage} pageCount={purchasePageCount} onPage={setPurchasePage} />
          </ReportShell>
        )}

        {activeTab === 'stockReport' && (
          <ReportShell title="Inventory Stock Report" subtitle="Product-wise and category-wise current stock, daily sold, monthly sold, and revenue.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full overflow-hidden p-3">
              <ReportTable title="Category Wise" headers={['Category', 'Items', 'Current', 'Today Sold', 'Month Sold', 'Revenue']} rows={categoryReport.map(row => [row.category, row.items, row.currentStock.toFixed(2), row.todayQty, row.monthQty, formatPaise(row.revenuePaise)])} />
              <ReportTable title="Product Wise" headers={['Product', 'Category', 'Stock', 'Today Sold', 'Month Sold', 'Revenue']} rows={stockReport.map(row => [row.item.name, row.categoryName, `${row.stock?.currentStock ?? 0} ${row.stock?.unit ?? ''}`, row.todayQty, row.monthQty, formatPaise(row.revenuePaise)])} />
            </div>
          </ReportShell>
        )}

        {activeTab === 'profitReport' && (
          <ReportShell title="Expenses & Profit Report" subtitle="Paid sales minus purchase expenses. Purchase entries are treated as inventory expenses.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
              <Stat label="Sales" value={formatPaise(salesTotalPaise)} tone="primary" />
              <Stat label="Purchase Expenses" value={formatPaise(purchaseTotals.total)} tone="red" />
              <Stat label="Gross Profit" value={formatPaise(profitPaise)} tone={profitPaise >= 0 ? 'primary' : 'red'} />
            </div>
            <div className="flex-1 overflow-auto p-3">
              <ReportTable title="Expense Breakup" headers={['Type', 'Entries', 'Base', 'GST', 'VAT', 'Total']} rows={[['Purchases', purchaseEntries.length, formatPaise(purchaseTotals.base), formatPaise(purchaseTotals.gst), formatPaise(purchaseTotals.vat), formatPaise(purchaseTotals.total)]]} />
            </div>
          </ReportShell>
        )}
      </div>
      {purchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">{editingEntryId ? 'Edit Purchase Entry' : 'New Purchase Entry'}</h2>
                <p className="text-[10px] font-bold text-slate-500">Scan or enter item details, add multiple lines, then save to stock.</p>
              </div>
              <button type="button" onClick={resetPurchaseModal} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="max-h-[75dvh] overflow-y-auto p-4">
              {purchaseEntryFields}
              {purchaseLines.length > 0 && !editingEntryId && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-amber-800">Unsaved batch: {purchaseLines.length} line(s)</p>
                    <button onClick={savePurchaseBatch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black"><Save size={13} /> SAVE PURCHASE BATCH</button>
                  </div>
                  <CompactPurchaseTable rows={purchaseLines} draft onDelete={id => setPurchaseLines(lines => lines.filter(line => line.id !== id))} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildPurchaseLine(draft: PurchaseDraft, items: ReturnType<typeof useBillingStore.getState>['inventoryItems'], products: ReturnType<typeof useBillingStore.getState>['menuItems']): PurchaseLine | null {
  const itemName = draft.itemName.trim()
  const unitSize = Number(draft.unitSize || 0)
  const packQuantity = Number(draft.quantity || 0)
  const rate = Number(draft.rate || 0)
  if (!itemName || !Number.isFinite(unitSize) || unitSize <= 0 || !Number.isFinite(packQuantity) || packQuantity <= 0 || !Number.isFinite(rate) || rate < 0) return null

  const existing = items.find(item => item.name.trim().toLowerCase() === itemName.toLowerCase())
  const product = products.find(item =>
    item.name.trim().toLowerCase() === itemName.toLowerCase() ||
    item.shortCode?.trim().toLowerCase() === itemName.toLowerCase() ||
    item.barcode?.trim().toLowerCase() === itemName.toLowerCase() ||
    (draft.barcode && item.barcode?.trim().toLowerCase() === draft.barcode.trim().toLowerCase())
  )
  const targetUnit = existing?.unit ?? product?.primaryUnit ?? draft.unit
  const purchasedStockQty = unitSize * packQuantity
  const stockQuantity = convertStockQuantity(purchasedStockQty, draft.unit, targetUnit)
  if (stockQuantity === null) return null
  const gstPercent = Number(draft.gstPercent || 0)
  const vatPercent = Number(draft.vatPercent || 0)
  const basePaise = Math.round(packQuantity * rate * 100)
  const gstPaise = Math.round(basePaise * Math.max(0, gstPercent) / 100)
  const vatPaise = Math.round(basePaise * Math.max(0, vatPercent) / 100)
  return {
    ...draft,
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    itemName: product?.name ?? existing?.name ?? itemName,
    inventoryItemId: existing?.id,
    menuItemId: product?.id,
    unit: targetUnit,
    unitSize,
    quantity: draft.quantity,
    stockQuantity,
    basePaise,
    gstPaise,
    vatPaise,
    totalPaise: basePaise + gstPaise + vatPaise,
  }
}

function toPurchaseInput(line: PurchaseLine) {
  return {
    inventoryItemId: line.inventoryItemId,
    menuItemId: line.menuItemId,
    itemName: line.itemName,
    supplier: line.supplier.trim() || undefined,
    invoiceNo: line.invoiceNo.trim() || undefined,
    unit: line.unit,
    unitSize: Number(line.unitSize),
    quantity: Number(line.quantity),
    stockQuantity: line.stockQuantity,
    ratePaise: Math.round(Number(line.rate || 0) * 100),
    basePaise: line.basePaise,
    gstPercent: Number(line.gstPercent || 0),
    gstPaise: line.gstPaise,
    vatPercent: Number(line.vatPercent || 0),
    vatPaise: line.vatPaise,
    totalPaise: line.totalPaise,
    paymentMode: line.paymentMode,
    barcode: line.barcode.trim() || undefined,
    minimumStock: Number(line.minimumStock || 0),
  }
}

function toPurchaseUpdateInput(line: PurchaseLine) {
  const { minimumStock: _minimumStock, ...updates } = toPurchaseInput(line)
  void _minimumStock
  return updates
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-full bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
      <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
        <div><h2 className="text-sm font-black text-slate-800">{title}</h2>{subtitle && <p className="text-[10px] font-bold text-slate-500">{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ReportShell({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <Panel title={title} subtitle={subtitle} action={action}>{children}</Panel>
}

function PurchaseTable({ rows, onEdit, onDelete }: { rows: PurchaseEntry[]; onEdit: (row: PurchaseEntry) => void; onDelete: (id: string) => void }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="bg-blue-100/70 border-b border-blue-200 sticky top-0 z-10"><tr>{['Date', 'Item', 'Supplier', 'Invoice', 'Qty', 'Rate', 'Tax', 'Total', 'Action'].map(label => <Th key={label}>{label}</Th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => (
          <tr key={row.id} className="odd:bg-slate-50/60 hover:bg-primary-50/30">
            <td className="px-3 py-2 font-bold text-slate-600">{dateKey(row.createdAt)}</td>
            <td className="px-3 py-2 font-black text-slate-800">{row.itemName}</td>
            <td className="px-3 py-2 font-bold text-slate-600">{row.supplier || '-'}</td>
            <td className="px-3 py-2 font-bold text-slate-600">{row.invoiceNo || '-'}</td>
            <td className="px-3 py-2 font-bold text-slate-700">{row.stockQuantity} {row.unit}</td>
            <td className="px-3 py-2 font-bold text-slate-700">{formatPaise(row.ratePaise)}</td>
            <td className="px-3 py-2 font-bold text-slate-700">{formatPaise(row.gstPaise + row.vatPaise)}</td>
            <td className="px-3 py-2 font-black text-slate-900">{formatPaise(row.totalPaise)}</td>
            <td className="px-3 py-1.5"><div className="flex gap-1"><button onClick={() => onEdit(row)} className="p-1.5 rounded bg-blue-50 text-blue-600"><Pencil size={13} /></button><button onClick={() => onDelete(row.id)} className="p-1.5 rounded bg-red-50 text-red-600"><Trash2 size={13} /></button></div></td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow colSpan={9} />}
      </tbody>
    </table>
  )
}

function CompactPurchaseTable({ rows, onDelete }: { rows: PurchaseLine[]; draft?: boolean; onDelete: (id: string) => void }) {
  return (
    <table className="w-full text-left text-xs bg-white rounded-lg overflow-hidden">
      <tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-1.5 font-black">{row.itemName}</td><td className="px-2 py-1.5">{row.stockQuantity} {row.unit}</td><td className="px-2 py-1.5">{formatPaise(row.totalPaise)}</td><td className="px-2 py-1.5 text-right"><button onClick={() => onDelete(row.id)} className="p-1 rounded bg-red-50 text-red-600"><Trash2 size={12} /></button></td></tr>)}</tbody>
    </table>
  )
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="h-full rounded-xl border border-slate-200 overflow-hidden flex flex-col bg-white">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><h3 className="text-xs font-black text-slate-800">{title}</h3></div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-blue-100/70 sticky top-0"><tr>{headers.map(header => <Th key={header}>{header}</Th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index} className="odd:bg-slate-50/60">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 font-bold text-slate-700">{cell}</td>)}</tr>)}{rows.length === 0 && <EmptyRow colSpan={headers.length} />}</tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'primary' | 'red' | 'amber' }) {
  const toneClass = { slate: 'text-slate-800 border-slate-200', primary: 'text-primary border-slate-200', red: 'text-red-600 border-red-200 bg-red-50/50', amber: 'text-amber-600 border-amber-200 bg-amber-50/50' }[tone]
  return <div className={clsx('bg-white p-2.5 rounded-xl border shadow-sm', toneClass)}><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p><p className="text-lg font-black tracking-tighter">{value}</p></div>
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">{label}</span>{children}</label>
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm"><Search size={14} className="text-slate-400" /><input value={value} onChange={event => onChange(event.target.value)} placeholder="Search..." className="bg-transparent outline-none text-xs font-bold text-slate-800 placeholder:text-slate-400" /></div>
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  return <div className="p-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs font-black"><button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Prev</button><span>{page}/{pageCount}</span><button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button></div>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-black text-slate-700">{children}</th>
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-6 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300"><Package size={22} className="text-slate-400" /></div><p className="text-sm font-bold text-slate-500">No records found.</p></div></td></tr>
}
