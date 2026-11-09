import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Edit3, Printer, RefreshCw, SlidersHorizontal, Undo } from 'lucide-react'
import { clsx } from 'clsx'
import { getBusinessDate, isClosedOrder, useBillingStore } from '../../store/billingStore'
import { formatPaise } from '../../lib/money'
import { getOrderHistoryTimestamp, isWithinLocalDateRange, localDateInputValue } from '../../lib/orderHistory'
import {
  defaultSortDirection,
  loadOrdersTablePreferences,
  ORDER_COLUMN_META,
  saveOrdersTablePreferences,
  type OrderSortField,
  type OrdersTablePreferences,
} from '../../lib/ordersTablePrefs'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import ReasonDialog from '../shared/ReasonDialog'
import ReturnItemsModal from './ReturnItemsModal'
import DiscountModal from '../billing/DiscountModal'
import AddPaymentModal from './AddPaymentModal'
import CancelOrderModal from './CancelOrderModal'
import EditOrderModal from './EditOrderModal'
import OrderTableSettingsModal from './OrderTableSettingsModal'

interface Props {
  onBack?: () => void
}

const CREDIT_PAYMENT_METHODS = new Set(['account', 'due'])

function formatOrderDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

function formatOrderTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export default function OrdersScreen({ onBack }: Props = {}) {
  const { orders, orderItems, payments, tables, outlet, cancelOrder, cancelPayments, updateOrderGlobalDiscount, printReceipt } = useBillingStore()
  const { addToast } = useUIStore()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(() => getBusinessDate(new Date(), outlet.businessDayCrossoverHour ?? 0))
  const [toDate, setToDate] = useState(() => getBusinessDate(new Date(), outlet.businessDayCrossoverHour ?? 0))
  
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null)
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null)
  const [discountOrderId, setDiscountOrderId] = useState<string | null>(null)
  const [addPaymentOrderId, setAddPaymentOrderId] = useState<string | null>(null)
  const [cancelPaymentsOrderId, setCancelPaymentsOrderId] = useState<string | null>(null)
  const [editOrderId, setEditOrderId] = useState<string | null>(null)
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false)
  const [tablePreferences, setTablePreferences] = useState<OrdersTablePreferences>(() => loadOrdersTablePreferences())

  const visibleColumns = useMemo(() => {
    const metaByKey = new Map(ORDER_COLUMN_META.map(column => [column.key, column]))
    const columns = tablePreferences.columns
      .filter(column => column.visible)
      .map(column => metaByKey.get(column.key))
      .filter((column): column is NonNullable<typeof column> => Boolean(column))
    return columns.length > 0 ? columns : ORDER_COLUMN_META
  }, [tablePreferences.columns])

  const activeItemCountByOrder = useMemo(() => {
    const index = new Map<string, number>()
    orderItems.forEach(item => {
      if (item.status === 'cancelled') return
      index.set(item.orderId, (index.get(item.orderId) ?? 0) + item.quantity)
    })
    return index
  }, [orderItems])

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

  const tableNameById = useMemo(() => new Map(tables.map(table => [table.id, table.name])), [tables])

  const getOrderTableName = (order: typeof orders[number]) =>
    order.tableName || (order.tableId ? tableNameById.get(order.tableId) : undefined) || (order.type === 'dine_in' ? 'Table not assigned' : '—')

  const getCollectedPaidPaise = (orderId: string) => {
    const orderPayments = paymentsByOrderId.get(orderId) || []
    return orderPayments
      .filter(payment => !CREDIT_PAYMENT_METHODS.has(payment.method))
      .reduce((sum, payment) => sum + payment.amountPaise, 0)
  }

  const filtered = useMemo(() => {
    const matches = orders.filter(o => {
      if (['cancelled', 'void'].includes(o.status)) return false
      if (o.totalPaise <= 0) return false
      // Preserve completed bills in history even if an older/imported record
      // is missing its child item rows; only hide empty open drafts.
      if (!isClosedOrder(o) && (activeItemCountByOrder.get(o.id) ?? 0) <= 0) return false

      const historyTime = getOrderHistoryTimestamp(o)
      const matchesDate = o.businessDate
        ? (o.businessDate >= fromDate && o.businessDate <= toDate)
        : isWithinLocalDateRange(historyTime, fromDate, toDate)
      if (!matchesDate) return false
      
      if (search) {
        const q = search.toLowerCase()
        if (!o.orderNo.toLowerCase().includes(q) &&
            !(o.tableName?.toLowerCase().includes(q)) &&
            !(o.customerName?.toLowerCase().includes(q))) return false
      }
      return true
    })

    const field = tablePreferences.sortField
    const direction = tablePreferences.sortDirection === 'asc' ? 1 : -1
    const numeric = field === 'net' || field === 'pendingAmt'
    const sortValue = (order: typeof orders[number]) => {
      switch (field) {
        case 'businessDate': return order.businessDate
        case 'receipt': return order.orderNo
        case 'table': return getOrderTableName(order)
        case 'customer': return order.customerName || 'Walk-in'
        case 'net': return order.totalPaise
        case 'pendingAmt': return Math.max(0, order.totalPaise - getCollectedPaidPaise(order.id))
        default: return Date.parse(getOrderHistoryTimestamp(order))
      }
    }

    return matches.sort((a, b) => {
      const left = sortValue(a)
      const right = sortValue(b)
      let comparison = numeric
        ? Number(left) - Number(right)
        : String(left).localeCompare(String(right), undefined, { numeric: true })
      if (comparison === 0) {
        comparison = Date.parse(getOrderHistoryTimestamp(a)) - Date.parse(getOrderHistoryTimestamp(b))
      }
      return comparison * direction
    })
  }, [orders, fromDate, toDate, search, activeItemCountByOrder, tablePreferences.sortField, tablePreferences.sortDirection, paymentsByOrderId, tableNameById])

  const handleSortColumn = (field: OrderSortField) => {
    setTablePreferences(current => {
      const next: OrdersTablePreferences = {
        ...current,
        sortField: field,
        sortDirection: current.sortField === field
          ? (current.sortDirection === 'asc' ? 'desc' : 'asc')
          : defaultSortDirection(field),
      }
      saveOrdersTablePreferences(next)
      return next
    })
  }

  const handleApplyTableSettings = (next: OrdersTablePreferences) => {
    setTablePreferences(next)
    saveOrdersTablePreferences(next)
    setTableSettingsOpen(false)
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
        <button
          onClick={() => setTableSettingsOpen(true)}
          className="h-[34px] px-4 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded flex items-center gap-2 shadow-sm transition-colors"
          title="Change column sequence, visibility and sorting"
        >
          <SlidersHorizontal size={16} /> Columns
        </button>
      </div>

      {/* DATA GRID */}
      <div className="flex-1 overflow-auto bg-slate-50 p-4">
        <table className="w-full text-left border border-slate-200 bg-white whitespace-nowrap">
          <thead className="bg-[#f1f5f9] border-b border-slate-300 sticky top-[-1rem] z-20 shadow-[0_1px_0_#cbd5e1]">
            <tr>
              <th className="w-10 px-2 py-2" aria-label="Expand order" />
              {visibleColumns.map(column => {
                const isActiveSort = Boolean(column.sortField) && column.sortField === tablePreferences.sortField
                return (
                  <th
                    key={column.key}
                    className={clsx(
                      'px-3 py-2 text-xs font-bold text-slate-600 uppercase',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                    )}
                  >
                    {column.sortField ? (
                      <button
                        type="button"
                        onClick={() => handleSortColumn(column.sortField!)}
                        className={clsx(
                          'inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-900',
                          isActiveSort && 'text-blue-700',
                        )}
                        title={`Sort by ${column.label}`}
                      >
                        {column.label}
                        {isActiveSort && (tablePreferences.sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    ) : column.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-500 font-bold">No orders found for the selected dates.</td>
              </tr>
            ) : filtered.map(order => {
              const isSelected = selectedOrderId === order.id
              const isExpanded = expandedOrderId === order.id
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
                <Fragment key={order.id}>
                  <tr
                    onClick={() => setSelectedOrderId(isSelected ? null : order.id)}
                    className={clsx(
                      "border-b border-slate-200 cursor-pointer transition-colors",
                      isSelected ? "bg-blue-100 shadow-[inset_4px_0_0_#3b82f6]" : "hover:bg-slate-50"
                    )}
                  >
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setExpandedOrderId(isExpanded ? null : order.id)
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${order.orderNo}`}
                        aria-expanded={isExpanded}
                        aria-controls={`order-details-${order.id}`}
                      >
                        {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                      </button>
                    </td>
                    {visibleColumns.map(column => {
                      switch (column.key) {
                        case 'receipt':
                          return <td key={column.key} className="px-3 py-1 text-sm font-bold text-slate-800">{order.orderNo}</td>
                        case 'table':
                          return <td key={column.key} className="px-3 py-1 text-sm font-bold text-slate-600">{getOrderTableName(order)}</td>
                        case 'customer':
                          return <td key={column.key} className="px-3 py-1 text-sm font-bold text-slate-800">{order.customerName || 'Walk-in'}</td>
                        case 'businessDate':
                          return <td key={column.key} className="px-3 py-1 text-sm text-slate-600">{order.businessDate}</td>
                        case 'txnTime':
                          return <td key={column.key} className="px-3 py-1 text-sm text-slate-600">{formatOrderTime(order.createdAt)}</td>
                        case 'items':
                          return <td key={column.key} className="px-3 py-1 text-sm font-black text-center">{items.length}</td>
                        case 'billDisc':
                          return <td key={column.key} className="px-3 py-1 text-sm text-slate-600 text-right">{formatPaise(order.discountPaise)}</td>
                        case 'net':
                          return <td key={column.key} className="px-3 py-1 text-sm font-black text-slate-800 text-right">{formatPaise(order.totalPaise)}</td>
                        case 'pendingAmt':
                          return <td key={column.key} className="px-3 py-1 text-sm font-black text-rose-600 text-right">{pendingAmt > 0 ? formatPaise(pendingAmt) : '0.00'}</td>
                        case 'paymentDetails':
                          return <td key={column.key} className="px-3 py-1 text-xs font-bold text-slate-600 max-w-[150px] truncate" title={pymtDetails}>{pymtDetails}</td>
                        case 'status':
                          return (
                            <td key={column.key} className="px-3 py-1">
                              <span className={clsx(
                                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                                order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                derivedPaymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-orange-100 text-orange-700'
                              )}>
                                {order.status === 'cancelled' ? 'Cancelled' : derivedPaymentStatus}
                              </span>
                            </td>
                          )
                        default:
                          return null
                      }
                    })}
                  </tr>
                  {isExpanded && (
                    <tr id={`order-details-${order.id}`} className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={visibleColumns.length + 1} className="px-5 py-4 whitespace-normal">
                        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="grid gap-3 border-b border-slate-200 pb-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Table</div>
                              <div className="mt-1 text-sm font-black text-slate-800">{getOrderTableName(order)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Business date</div>
                              <div className="mt-1 text-sm font-bold text-slate-700">{order.businessDate || '—'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order date &amp; time</div>
                              <div className="mt-1 text-sm font-bold text-slate-700">{formatOrderDateTime(order.createdAt)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer</div>
                              <div className="mt-1 text-sm font-bold text-slate-700">{order.customerName || 'Walk-in'}</div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Ordered items</h2>
                              <span className="text-xs font-bold text-slate-500">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                            </div>
                            {items.length > 0 ? (
                              <div className="overflow-hidden rounded border border-slate-200">
                                <div className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_7rem] gap-3 bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  <span>Item</span>
                                  <span className="text-center">Qty</span>
                                  <span className="text-right">Rate</span>
                                  <span className="text-right">Amount</span>
                                </div>
                                {items.map(item => (
                                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_4rem_7rem_7rem] items-start gap-3 border-t border-slate-200 px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-800">{item.nameSnapshot}</div>
                                      {(item.modifiers?.length || item.note) && (
                                        <div className="mt-0.5 text-xs text-slate-500">
                                          {item.modifiers?.length ? item.modifiers.join(' · ') : null}
                                          {item.modifiers?.length && item.note ? ' · ' : null}
                                          {item.note ? item.note : null}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-center font-bold text-slate-700">{formatQuantity(item.quantity)}</span>
                                    <span className="text-right text-slate-600">{formatPaise(item.unitPricePaise)}</span>
                                    <span className="text-right font-black text-slate-800">{formatPaise(item.totalPaise)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded border border-dashed border-slate-300 px-3 py-4 text-center text-sm font-bold text-slate-500">No active items on this order.</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
          onClick={() => setEditOrderId(selectedOrderId)}
          className="px-4 py-1.5 bg-[#3b82f6] text-white text-sm font-bold rounded hover:bg-[#2563eb] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          <Edit3 size={16} /> Edit order
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

      {editOrderId && (
        <EditOrderModal
          order={orders.find((order) => order.id === editOrderId)!}
          onClose={() => setEditOrderId(null)}
          onSaved={(orderId, shouldPrint) => {
            setEditOrderId(null)
            if (shouldPrint) {
              printReceipt(orderId)
              addToast('success', 'Order updated and the revised bill was queued for printing')
            } else {
              addToast('success', 'Order changes saved successfully')
            }
          }}
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

      {tableSettingsOpen && (
        <OrderTableSettingsModal
          preferences={tablePreferences}
          onApply={handleApplyTableSettings}
          onClose={() => setTableSettingsOpen(false)}
        />
      )}
    </div>
  )
}
