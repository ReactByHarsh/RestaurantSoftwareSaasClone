import { useState, useMemo } from 'react'
import { X, Save } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import { formatPaise } from '../../lib/money'
import { clsx } from 'clsx'
import type { Order } from '../../lib/types'

interface Props {
  order: Order
  onClose: () => void
}

export default function ReturnItemsModal({ order, onClose }: Props) {
  const { orderItems, cancelOrderItemQty } = useBillingStore()
  const addToast = useUIStore(s => s.addToast)

  const [step, setStep] = useState<1 | 2>(1)

  // Only items that belong to this order and aren't fully cancelled
  const eligibleItems = useMemo(() => {
    return orderItems.filter(item => item.orderId === order.id && item.status !== 'cancelled' && item.quantity > 0)
  }, [orderItems, order.id])

  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({})
  const [addBackInventories, setAddBackInventories] = useState<Record<string, boolean>>({})

  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const num = parseInt(val, 10)
    if (isNaN(num) || num <= 0) {
      setReturnQtys(prev => { const n = { ...prev }; delete n[itemId]; return n; })
    } else {
      setReturnQtys(prev => ({ ...prev, [itemId]: Math.min(num, maxQty) }))
    }
  }

  const handleReasonChange = (itemId: string, val: string) => {
    setReturnReasons(prev => ({ ...prev, [itemId]: val }))
  }

  const handleInventoryChange = (itemId: string, checked: boolean) => {
    setAddBackInventories(prev => ({ ...prev, [itemId]: checked }))
  }

  const itemsToReturn = useMemo(() => Object.entries(returnQtys).filter(([_, qty]) => qty > 0), [returnQtys])

  // Summary calculations
  const oldAmount = order.totalPaise
  const returnAmount = useMemo(() => {
    return itemsToReturn.reduce((sum, [itemId, qty]) => {
      const item = eligibleItems.find(i => i.id === itemId)
      if (!item) return sum
      
      const unitPrice = item.unitPricePaise
      const unitDiscount = Math.round((item.discountPaise || 0) / item.quantity)
      const unitTax = Math.round(item.taxPaise / item.quantity)
      
      const val = (unitPrice - unitDiscount + unitTax) * qty
      return sum + val
    }, 0)
  }, [itemsToReturn, eligibleItems])

  const amountAfterReturns = Math.max(0, oldAmount - returnAmount)
  const amountPaid = order.paidPaise
  const refundDue = Math.max(0, amountPaid - amountAfterReturns)

  const handleNext = () => {
    if (itemsToReturn.length === 0) {
      addToast('error', 'Please select at least one item to return')
      return
    }

    // Check if reasons are provided for returned items
    const missingReason = itemsToReturn.some(([itemId]) => !returnReasons[itemId]?.trim())
    if (missingReason) {
      addToast('error', 'Please enter a return reason for all returned items')
      return
    }

    setStep(2)
  }

  const handleProcessReturns = () => {
    let success = true
    itemsToReturn.forEach(([itemId, qtyToReturn]) => {
      const reason = returnReasons[itemId]?.trim() || 'Returned'
      const ok = cancelOrderItemQty(itemId, qtyToReturn, reason)
      if (!ok) success = false
    })

    if (success) {
      addToast('success', 'Items successfully returned')
      onClose()
    } else {
      addToast('error', 'Some items failed to return')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={clsx(
        "w-full overflow-hidden bg-white shadow-2xl flex flex-col rounded-sm",
        step === 1 ? "max-w-6xl" : "max-w-3xl"
      )}>
        <div className="bg-white flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 text-lg uppercase tracking-wide mx-auto pl-8">
            {step === 1 ? 'ENTER RETURN DETAILS' : 'SUMMARY AFTER RETURNS'}
          </h3>
          <button onClick={onClose} className="hover:bg-slate-100 p-1 rounded transition-colors text-slate-500"><X size={18} /></button>
        </div>
        
        {step === 1 && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[#d2e3f5] border-y border-[#b8cce4]">
                  <tr>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700">Product Name</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-right">Qty</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-right">Rate</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-right">Taxes</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-right">Disc</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-right">Amt</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700">Qty Returned</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700">Return Reason</th>
                    <th className="px-3 py-2 text-xs font-bold text-slate-700 text-center">Addto Invntry</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-slate-500 font-medium">No items available to return</td>
                    </tr>
                  ) : eligibleItems.map((item, index) => (
                    <tr key={item.id} className={clsx("border-b border-slate-100 last:border-0", index % 2 !== 0 ? 'bg-slate-50' : 'bg-white')}>
                      <td className="px-3 py-2 text-xs text-slate-800">{item.nameSnapshot}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 text-right">{formatPaise(item.unitPricePaise)}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 text-right">{formatPaise(item.taxPaise)}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 text-right">{formatPaise(item.discountPaise || 0)}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 text-right">{formatPaise(item.totalPaise)}</td>
                      <td className="px-3 py-2 w-32">
                        <div className="border-b border-slate-300 px-1">
                          <input 
                            type="number" 
                            min="0" 
                            max={item.quantity}
                            value={returnQtys[item.id] || ''}
                            onChange={(e) => handleQtyChange(item.id, item.quantity, e.target.value)}
                            placeholder="Enter"
                            className="w-full text-xs text-slate-800 outline-none bg-transparent"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 w-48">
                        <div className="border-b border-slate-300 px-1">
                          <input 
                            type="text" 
                            value={returnReasons[item.id] || ''}
                            onChange={(e) => handleReasonChange(item.id, e.target.value)}
                            placeholder="Enter reason for return"
                            className="w-full text-xs text-slate-800 outline-none bg-transparent placeholder-slate-400"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center w-24">
                        <input 
                          type="checkbox"
                          checked={addBackInventories[item.id] || false}
                          onChange={(e) => handleInventoryChange(item.id, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#008080] p-3 mt-4 flex items-center justify-center">
              {/* Pagination mock to match screenshot */}
              <div className="flex items-center gap-2 text-white text-xs">
                <span className="cursor-pointer opacity-50">&lt;&lt;</span>
                <span className="cursor-pointer opacity-50">&lt;</span>
                <span className="w-6 h-6 rounded-full bg-[#ffc107] text-slate-900 font-bold flex items-center justify-center">1</span>
                <span className="cursor-pointer opacity-50">&gt;</span>
                <span className="cursor-pointer opacity-50">&gt;&gt;</span>
              </div>
            </div>

            <div className="p-4 flex justify-center">
              <button 
                onClick={handleNext}
                className="px-6 py-2 bg-[#ffc107] text-slate-900 font-bold rounded shadow-sm hover:bg-[#ffb300] transition-colors text-sm flex items-center gap-2"
              >
                <span>&gt;&gt;</span> Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-8 flex flex-col items-center">
            <div className="w-full max-w-md flex flex-col gap-4">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm font-medium text-slate-600">Receipt no</span>
                <span className="text-sm font-bold text-slate-800">{order.orderNo}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm font-medium text-slate-600">Old Amount</span>
                <span className="text-sm font-bold text-slate-800">{formatPaise(oldAmount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm font-medium text-slate-600">Amount after returns</span>
                <span className="text-sm font-bold text-slate-800">{formatPaise(amountAfterReturns)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm font-medium text-slate-600">Amount paid</span>
                <span className="text-sm font-bold text-slate-800">{formatPaise(amountPaid)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm font-medium text-slate-600">Refund due</span>
                <span className="text-sm font-black text-slate-900">{formatPaise(refundDue)}</span>
              </div>
            </div>

            <div className="mt-8 w-full max-w-md">
              <button 
                onClick={handleProcessReturns}
                className="w-full py-3 bg-[#ffc107] text-slate-900 font-bold rounded shadow-sm hover:bg-[#ffb300] transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Save size={16} /> Process Returns
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
