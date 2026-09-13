import { useMemo, useState } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { calculateTax, formatPaise } from '../../lib/money'
import { isSaleableMenuItem } from '../../lib/productTypes'
import type { MenuItem, Order, OrderItem, OrderItemEditInput } from '../../lib/types'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'

interface Props {
  order: Order
  onClose: () => void
  onSaved: (orderId: string, shouldPrint: boolean) => void
}

function lineTotal(item: OrderItemEditInput) {
  const subtotal = Math.max(0, Math.round(item.unitPricePaise) * item.quantity)
  const discount = Math.min(subtotal, Math.max(0, Math.round(item.discountPaise ?? 0)))
  const tax = calculateTax(Math.max(0, subtotal - discount), item.taxType === 'None' ? 0 : item.taxPercent ?? 0)
  return Math.max(0, subtotal - discount + tax)
}

function toDraft(item: OrderItem): OrderItemEditInput {
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    nameSnapshot: item.nameSnapshot,
    itemType: item.itemType,
    isSeparateBill: item.isSeparateBill,
    quantity: item.quantity,
    unitPricePaise: item.unitPricePaise,
    taxPercent: item.taxPercent,
    taxType: item.taxType,
    discountPaise: item.discountPaise,
    stationId: item.stationId,
    note: item.note,
    modifiers: item.modifiers,
    status: item.status,
    createdAt: item.createdAt,
  }
}

function statusForNewItem(order: Order): OrderItemEditInput['status'] {
  return ['paid', 'billed', 'ready'].includes(order.status) ? 'served' : 'draft'
}

export default function EditOrderModal({ order, onClose, onSaved }: Props) {
  const { menuItems, orderItems, updateOrderItems } = useBillingStore()
  const addToast = useUIStore((state) => state.addToast)
  const [draftItems, setDraftItems] = useState<OrderItemEditInput[]>(() =>
    orderItems.filter((item) => item.orderId === order.id && item.status !== 'cancelled').map(toDraft)
  )
  const [productSearch, setProductSearch] = useState('')

  const products = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    return menuItems
      .filter(isSaleableMenuItem)
      .filter((item) => !query || item.name.toLowerCase().includes(query) || item.shortCode?.toLowerCase().includes(query) || item.barcode?.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [menuItems, productSearch])

  const totalPaise = useMemo(() => draftItems.reduce((sum, item) => sum + lineTotal(item), 0) + order.chargePaise, [draftItems, order.chargePaise])
  const subtotalPaise = useMemo(() => draftItems.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0), [draftItems])
  const discountPaise = useMemo(() => draftItems.reduce((sum, item) => sum + (item.discountPaise ?? 0), 0), [draftItems])
  const collectedPaise = order.paidPaise
  const paymentDuePaise = Math.max(0, totalPaise - collectedPaise)

  const updateQuantity = (id: string, delta: number) => {
    setDraftItems((current) => current.flatMap((item) => {
      if (item.id !== id) return [item]
      const quantity = item.quantity + delta
      if (quantity <= 0) return []
      const discountPaise = item.discountPaise ? Math.round(item.discountPaise * quantity / item.quantity) : 0
      return [{ ...item, quantity, discountPaise }]
    }))
  }

  const addProduct = (product: MenuItem) => {
    setDraftItems((current) => {
      const existing = current.find((item) => item.menuItemId === product.id && (!item.modifiers || item.modifiers.length === 0))
      if (existing) {
        const quantity = existing.quantity + 1
        return current.map((item) => item.id === existing.id
          ? { ...item, quantity, discountPaise: existing.discountPaise ? Math.round(existing.discountPaise * quantity / existing.quantity) : 0 }
          : item)
      }
      return [...current, {
        menuItemId: product.id,
        nameSnapshot: product.name,
        itemType: product.itemType,
        isSeparateBill: product.isSeparateBill,
        quantity: 1,
        unitPricePaise: product.pricePaise,
        taxPercent: product.taxPercent,
        taxType: product.taxType,
        discountPaise: 0,
        stationId: product.stationId,
        status: statusForNewItem(order),
      }]
    })
  }

  const saveChanges = (shouldPrint: boolean) => {
    if (draftItems.length === 0) {
      addToast('error', 'Keep at least one product, or use Return items / Cancel order')
      return
    }
    if (!updateOrderItems(order.id, draftItems)) {
      addToast('error', 'Unable to update this order')
      return
    }
    onSaved(order.id, shouldPrint)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3 text-white">
          <div>
            <h2 className="text-base font-black tracking-wide">EDIT ORDER {order.orderNo}</h2>
            <p className="mt-0.5 text-[11px] font-bold text-slate-300">Add products, remove products, or change quantities before printing the updated bill.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Close edit order"><X size={18} /></button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[1.35fr_1fr]">
          <section className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <div><p className="text-xs font-black uppercase tracking-wide text-slate-700">Current products</p><p className="text-[10px] font-bold text-slate-500">Use + / − to adjust quantities.</p></div>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">{draftItems.length} lines</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {draftItems.length === 0 ? <p className="p-8 text-center text-sm font-bold text-slate-500">No products selected.</p> : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white"><tr><th className="px-4 py-2 font-black text-slate-600">Product</th><th className="px-2 py-2 text-center font-black text-slate-600">Qty</th><th className="px-4 py-2 text-right font-black text-slate-600">Amount</th><th className="px-2 py-2" /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftItems.map((item) => (
                      <tr key={item.id ?? `${item.menuItemId}-${item.nameSnapshot}`} className="hover:bg-slate-50">
                        <td className="px-4 py-3"><p className="font-black text-slate-800">{item.nameSnapshot}</p><p className="mt-0.5 text-[10px] font-bold text-slate-500">{formatPaise(item.unitPricePaise)} each</p></td>
                        <td className="px-2 py-3"><div className="flex items-center justify-center gap-1"><button onClick={() => updateQuantity(item.id ?? item.menuItemId, -1)} className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100" aria-label={`Decrease ${item.nameSnapshot}`}><Minus size={13} /></button><span className="min-w-7 text-center font-black text-slate-800">{item.quantity}</span><button onClick={() => updateQuantity(item.id ?? item.menuItemId, 1)} className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-100" aria-label={`Increase ${item.nameSnapshot}`}><Plus size={13} /></button></div></td>
                        <td className="px-4 py-3 text-right font-black text-slate-800">{formatPaise(lineTotal(item))}</td>
                        <td className="px-2 py-3 text-right"><button onClick={() => setDraftItems((current) => current.filter((candidate) => candidate.id !== item.id || candidate.menuItemId !== item.menuItemId))} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label={`Remove ${item.nameSnapshot}`}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-slate-50">
            <div className="border-b border-slate-200 bg-white px-4 py-2.5"><p className="text-xs font-black uppercase tracking-wide text-slate-700">Add products</p><div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"><Search size={14} className="text-slate-400" /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search menu products..." className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none" /></div></div>
            <div className="min-h-0 flex-1 overflow-auto p-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{products.map((product) => <button key={product.id} onClick={() => addProduct(product)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{product.name}</span><span className="block text-[10px] font-bold text-slate-500">{formatPaise(product.pricePaise)}</span></span><Plus size={16} className="shrink-0 text-blue-600" /></button>)}</div>{products.length === 0 && <p className="p-6 text-center text-xs font-bold text-slate-500">No saleable products found.</p>}</div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"><span className="font-bold text-slate-500">Subtotal <strong className="text-slate-800">{formatPaise(subtotalPaise)}</strong></span><span className="font-bold text-slate-500">Discount <strong className="text-red-600">-{formatPaise(discountPaise)}</strong></span><span className="font-black text-slate-800">Updated total {formatPaise(totalPaise)}</span>{paymentDuePaise > 0 ? <span className="font-black text-orange-600">Paid {formatPaise(collectedPaise)} · Balance due {formatPaise(paymentDuePaise)} · Order will show PARTIAL</span> : <span className="font-black text-emerald-600">Paid in full</span>}</div>
          <div className="flex items-center gap-2"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">CANCEL</button><button onClick={() => saveChanges(false)} className={clsx('rounded-lg px-4 py-2 text-xs font-black text-slate-700 shadow-sm', draftItems.length === 0 ? 'bg-slate-200' : 'border border-slate-300 bg-white hover:bg-slate-50')} disabled={draftItems.length === 0}>SAVE CHANGES</button><button onClick={() => saveChanges(true)} className={clsx('rounded-lg px-4 py-2 text-xs font-black text-white shadow-sm', draftItems.length === 0 ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700')} disabled={draftItems.length === 0}>SAVE &amp; REPRINT BILL</button></div>
        </div>
      </div>
    </div>
  )
}
