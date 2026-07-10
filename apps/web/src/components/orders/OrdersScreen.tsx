import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, RefreshCw, Undo } from 'lucide-react'
import { clsx } from 'clsx'
import { useBillingStore } from '../../store/billingStore'
import { formatPaise } from '../../lib/money'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import ReasonDialog from '../shared/ReasonDialog'
import ReturnItemsModal from './ReturnItemsModal'
import DiscountModal from '../billing/DiscountModal'
import AddPaymentModal from './AddPaymentModal'
import CancelOrderModal from './CancelOrderModal'

interface Props {
  onBack?: () => void
}

const CREDIT_PAYMENT_METHODS = new Set(['account', 'due'])

export default function OrdersScreen({ onBack }: Props = {}) {
  const { orders, orderItems, payments, cancelOrder, cancelPayments, updateOrderGlobalDiscount, printReceipt } = useBillingStore()
  const { addToast } = useUIStore()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null)
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null)
  const [discountOrderId, setDiscountOrderId] = useState<string | null>(null)
  const [addPaymentOrderId, setAddPaymentOrderId] = useState<string | null>(null)
  const [cancelPaymentsOrderId, setCancelPaymentsOrderId] = useState<string | null>(null)

  const activeItemCountByOrder = useMemo(() => {
    const index = new Map<string, number>()
    orderItems.forEach(item => {
      if (item.status === 'cancelled') return
      index.set(item.orderId, (index.get(item.orderId) ?? 0) + item.quantity)
    })
    return index
  }, [orderItems])

  const filtered = useMemo(() => {
    const from = new Date(fromDate).getTime()
    const to = new Date(toDate).getTime() + 86400000 // end of day

    return orders.filter(o => {
      if (['cancelled', 'void'].includes(o.status)) return false
      if (o.totalPaise <= 0) return false
      if ((activeItemCountByOrder.get(o.id) ?? 0) <= 0) return false

      const orderTime = new Date(o.createdAt).getTime()
      if (orderTime < from || orderTime >= to) return false
      
      if (search) {
        const q = search.toLowerCase()
        if (!o.orderNo.toLowerCase().includes(q) &&
            !(o.tableName?.toLowerCase().includes(q)) &&
            !(o.customerName?.toLowerCase().includes(q))) return false
      }
      return true
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [orders, fromDate, toDate, search, activeItemCountByOrder])

  const itemsByOrderId = useMemo(() => {
    const index = new Map<string, typeof orderItems>()
    orderItems.forEach(item => {
      if (item.status === 'cancelled') return
      const existing = index.get(item.orderId)
      if (existing) existing.push(item)
      else index.set(item.orderId, [item])
    })
    return index
  }, [orderItems])

  const paymentsByOrderId = useMemo(() => {
    const index = new Map<string, typeof payments>()
    payments.forEach(payment => {
      if (payment.status !== 'success') return
      const existing = index.get(payment.orderId)
      if (existing) existing.push(payment)
      else index.set(payment.orderId, [payment])
    })
    return index
  }, [payments])

  const getCollectedPaidPaise = (orderId: string) => {
    const orderPayments = paymentsByOrderId.get(orderId) || []
    return orderPayments
      .filter(payment => !CREDIT_PAYMENT_METHODS.has(payment.method))
      .reduce((sum, payment) => sum + payment.amountPaise, 0)
  }

  const getPendingPaise = (orderId: string, totalPaise: number) => {
    return Math.max(0, totalPaise - getCollectedPaidPaise(orderId))
  }

  const handlePrint = (orderId: string) => {
    printReceipt(orderId)
    addToast('success', 'Receipt queued for printing')
  }

  const handleBack = () => {
    if (onBack) onBack()
    else navigate('/app/billing')
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* HEADER */}
      <div className="bg-[#1e293b] text-white px-4 py-2.5 flex items-center gap-3 shadow-sm z-20">
        <button onClick={handleBack} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors" aria-label="Back to billing">
          <Undo size={18} />
        </button>
        <h1 className="text-lg font-bold tracking-widest flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-white text-[#1e293b] flex items-center justify-center font-black">S</span>
          SALES ORDER SEARCH
        </h1>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-end gap-4 shadow-sm z-10 shrink-0">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">From Date</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">To Date</label>
          <input 
            type="date" 
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search Order/Customer</label>
          <input 
            type="text" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-700 outline-none focus:border-blue-500 min-w-[200px]"
          />
        </div>
        <button className="h-[34px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-2 shadow-sm transition-colors">
          <RefreshCw size={16} /> Show
        </button>
      </div>

      {/* DATA GRID */}
      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        <table className="w-full text-left border border-slate-200 bg-white whitespace-nowrap">
          <thead className="bg-[#f1f5f9] border-b border-slate-300 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">Receipt No</th>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">Counter</th>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">Customer</th>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">Bsn Date</th>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">Txn Time</th>
              <th className="px-3 py-2 text-xs font-bold text-slate-600 uppercase text-center">Items</th>
              <th className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase text-right">Bill Disc</th>
              <th className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase text-right">Net</th>
              <th className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase text-right">Pnding Amt</th>
              <th className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase">Pymt Details</th>
              <th className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500 font-bold">No orders found for the selected dates.</td>
              </tr>
            ) : filtered.map(order => {
              const isSelected = selectedOrderId === order.id
              const items = itemsByOrderId.get(order.id) || []
              const orderPayments = paymentsByOrderId.get(order.id) || []
              const collectedPaidPaise = getCollectedPaidPaise(order.id)
              const pendingAmt = Math.max(0, order.totalPaise - collectedPaidPaise)
              const derivedPaymentStatus = pendingAmt <= 0 && order.totalPaise > 0
                ? 'paid'
                : collectedPaidPaise > 0 ? 'partial' : 'unpaid'
              
              const pymtDetails = orderPayments.length > 0 
                ? orderPayments.map(p => `${p.method.charAt(0).toUpperCase() + p.method.slice(1)}: ${formatPaise(p.amountPaise)}`).join(', ')
                : '-'

              return (
                <tr 
                  key={order.id} 
                  onClick={() => setSelectedOrderId(isSelected ? null : order.id)}
                  className={clsx(
                    "border-b border-slate-200 cursor-pointer transition-colors",
                    isSelected ? "bg-blue-100 shadow-[inset_4px_0_0_#3b82f6]" : "hover:bg-slate-50"
                  )}
                >
                  <td className="px-3 py-1 text-sm font-bold text-slate-800">{order.orderNo}</td>
                  <td className="px-3 py-1 text-sm font-bold text-slate-600">{order.type.replace('_', ' ').toUpperCase()}</td>
                  <td className="px-3 py-1 text-sm font-bold text-slate-800">{order.customerName || 'Walk-in'}</td>
                  <td className="px-3 py-1 text-sm text-slate-600">{order.businessDate}</td>
                  <td className="px-3 py-1 text-sm text-slate-600">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-1 text-sm font-black text-center">{items.length}</td>
                  <td className="px-3 py-1 text-sm text-slate-600 text-right">{formatPaise(order.discountPaise)}</td>
                  <td className="px-3 py-1 text-sm font-black text-slate-800 text-right">{formatPaise(order.totalPaise)}</td>
                  <td className="px-3 py-1 text-sm font-black text-rose-600 text-right">{pendingAmt > 0 ? formatPaise(pendingAmt) : '0.00'}</td>
                  <td className="px-3 py-1 text-xs font-bold text-slate-600 max-w-[150px] truncate" title={pymtDetails}>{pymtDetails}</td>
                  <td className="px-3 py-1">
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                      order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      derivedPaymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-orange-100 text-orange-700'
                    )}>
                      {order.status === 'cancelled' ? 'Cancelled' : derivedPaymentStatus}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="bg-[#517d87] px-4 py-3 border-t border-[#466e77] flex items-center justify-center gap-3 shrink-0">
        <button 
          disabled={!selectedOrderId}
          onClick={() => setDiscountOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#4fa7b8] text-white text-sm font-bold rounded hover:bg-[#3d8b9a] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          Update discount
        </button>
        <button 
          disabled={!selectedOrderId || getPendingPaise(selectedOrderId, orders.find(o => o.id === selectedOrderId)?.totalPaise ?? 0) <= 0}
          onClick={() => setAddPaymentOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#25a975] text-white text-sm font-bold rounded hover:bg-[#1f8d62] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          Add Payment
        </button>
        <button 
          disabled={!selectedOrderId || orders.find(o => o.id === selectedOrderId)?.paidPaise === 0}
          onClick={() => setCancelPaymentsOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#e45151] text-white text-sm font-bold rounded hover:bg-[#c34343] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          Cancel payments
        </button>
        <button 
          disabled={!selectedOrderId}
          onClick={() => setCancelOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#e45151] text-white text-sm font-bold rounded hover:bg-[#c34343] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          Cancel order
        </button>
        <button 
          disabled={!selectedOrderId}
          onClick={() => setReturnOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#cd5c5c] text-white text-sm font-bold rounded hover:bg-[#b04f4f] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          Return items
        </button>
        <button 
          disabled={!selectedOrderId}
          onClick={() => handlePrint(selectedOrderId!)}
          className="px-4 py-1.5 bg-[#a3b364] text-white text-sm font-bold rounded hover:bg-[#8b9952] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          <Printer size={16} /> Reprint
        </button>
      </div>

      {addPaymentOrderId && (
        <AddPaymentModal
          order={orders.find(o => o.id === addPaymentOrderId)!}
          onClose={() => setAddPaymentOrderId(null)}
        />
      )}

      {cancelOrderId && (
        <CancelOrderModal
          order={orders.find(o => o.id === cancelOrderId)!}
          onClose={() => setCancelOrderId(null)}
        />
      )}

      {returnOrderId && (
        <ReturnItemsModal 
          order={orders.find(o => o.id === returnOrderId)!}
          onClose={() => setReturnOrderId(null)}
        />
      )}

      {cancelPaymentsOrderId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden bg-white shadow-2xl flex flex-col rounded-sm">
            <div className="bg-white flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 text-lg">Confirmation</h3>
            </div>
            <div className="p-6 pb-8 text-center text-sm font-medium text-slate-700">
              Are you sure that you want to cancel all payments received against this sales order?
            </div>
            <div className="flex bg-slate-50 border-t border-slate-200">
              <button 
                className="flex-1 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors flex justify-center items-center gap-2"
                onClick={() => {
                  cancelPayments(cancelPaymentsOrderId)
                  addToast('success', 'Payment(s) cancelled successfully!')
                  setCancelPaymentsOrderId(null)
                }}
              >
                ✓ Yes
              </button>
              <div className="w-px bg-slate-200" />
              <button 
                className="flex-1 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors flex justify-center items-center gap-2"
                onClick={() => setCancelPaymentsOrderId(null)}
              >
                ✕ No
              </button>
            </div>
          </div>
        </div>
      )}

      <DiscountModal
        isOpen={!!discountOrderId}
        onClose={() => setDiscountOrderId(null)}
        onApply={(type, value) => {
          if (discountOrderId) {
            updateOrderGlobalDiscount(discountOrderId, type, value)
            addToast('success', 'Discount updated successfully')
            setDiscountOrderId(null)
          }
        }}
      />
    </div>
  )
}
