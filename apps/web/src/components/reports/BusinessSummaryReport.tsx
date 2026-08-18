import { useMemo, useState } from 'react'
import { useBillingStore } from '../../store/billingStore'
import { Printer, Download } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { describePrinterError, sendPrintJob } from '../../lib/printer'
import { buildBusinessSummaryPrintText } from '../../lib/businessSummaryPrint'

interface Props {
  fromDate: string
  toDate: string
}

export default function BusinessSummaryReport({ fromDate, toDate }: Props) {
  const { outlet, printSettings, orders, orderItems, kots, menuItems, menuCategories, tables, floors, payments } = useBillingStore()
  const { addToast } = useUIStore()
  const [showCategorySales, setShowCategorySales] = useState(true)
  const [showSubcategorySales, setShowSubcategorySales] = useState(true)
  const [printBusy, setPrintBusy] = useState(false)

  const reportData = useMemo(() => {
    // 1. Filter orders by date range
    // The dates are in YYYY-MM-DD. order.businessDate is also YYYY-MM-DD.
    const filteredOrders = orders.filter(
      o => o.businessDate >= fromDate && o.businessDate <= toDate && o.paymentStatus === 'paid' && !['cancelled', 'void'].includes(o.status) && o.totalPaise > 0
    )
    const orderIds = new Set(filteredOrders.map(o => o.id))

    // 2. Filter corresponding items
    const filteredItems = orderItems.filter(i => orderIds.has(i.orderId) && i.status !== 'cancelled')

    // 3. Filter KOTs for cancelled items (within the same date range)
    // Note: KOT cancellation might happen on draft orders, so we filter KOTs by date range
    const filteredKots = kots.filter(k => k.createdAt >= fromDate && k.createdAt <= toDate + 'T23:59:59')

    // --- CALCULATIONS ---

    // Sales Summary
    const totalBills = filteredOrders.length
    const itemsSold = filteredItems.reduce((sum, item) => sum + item.quantity, 0)
    const netSalesAmount = filteredOrders.reduce((sum, order) => sum + order.totalPaise, 0)

    // Discount Summary
    const billsWithDiscount = filteredOrders.filter(o => o.discountPaise > 0).length
    const discountOnItems = 0 
    const discountOnBills = filteredOrders.reduce((sum, order) => sum + order.discountPaise, 0)
    const totalDiscount = discountOnItems + discountOnBills

    // Category and subcategory wise sales. Menu items can be assigned to a
    // subcategory, so category sales must always roll up to the top-level
    // parent category instead of mixing parent and child names together.
    const categorySales: Record<string, number> = {}
    const subcategorySales: Record<string, number> = {}
    const categoryById = new Map(menuCategories.map(category => [category.id, category]))

    filteredItems.forEach(item => {
      const mi = menuItems.find(m => m.id === item.menuItemId)
      const assignedCategory = mi ? categoryById.get(mi.categoryId) : undefined
      const amount = item.unitPricePaise * item.quantity

      let rootCategory = assignedCategory
      const visited = new Set<string>()
      while (rootCategory?.parentId && !visited.has(rootCategory.id)) {
        visited.add(rootCategory.id)
        const parentCategory = categoryById.get(rootCategory.parentId)
        if (!parentCategory) break
        rootCategory = parentCategory
      }

      const categoryName = rootCategory?.name || 'Unknown'
      categorySales[categoryName] = (categorySales[categoryName] || 0) + amount

      if (assignedCategory?.parentId) {
        const subcategoryName = assignedCategory.name || 'Unknown'
        subcategorySales[subcategoryName] = (subcategorySales[subcategoryName] || 0) + amount
      }
    })

    // Kitchen wise sales
    const kitchenSales: Record<string, number> = {}
    filteredItems.forEach(item => {
      const mi = menuItems.find(m => m.id === item.menuItemId)
      const type = mi?.itemType === 'veg' ? 'Veg' : mi?.itemType === 'nonveg' ? 'Non Veg' : 'Main'
      kitchenSales[type] = (kitchenSales[type] || 0) + (item.unitPricePaise * item.quantity)
    })

    // Section wise sales (Floors)
    const sectionSales: Record<string, number> = {}
    filteredOrders.forEach(order => {
      if (order.tableId) {
        const table = tables.find(t => t.id === order.tableId)
        const floor = table ? floors.find(f => f.id === table.floorId)?.name : 'Dine-In'
        const key = floor || 'Dine-In'
        sectionSales[key] = (sectionSales[key] || 0) + order.totalPaise
      } else {
        const key = order.type === 'takeaway' ? 'Takeaway' : order.type === 'delivery' ? 'Delivery' : 'Other'
        sectionSales[key] = (sectionSales[key] || 0) + order.totalPaise
      }
    })

    // Counter type wise sales
    const counterTypeSales: Record<string, number> = {}
    filteredOrders.forEach(order => {
      const key = order.type === 'dine_in' ? 'Regular' : order.type === 'takeaway' ? 'Takeaway' : order.type === 'delivery' ? 'Delivery' : 'Online'
      counterTypeSales[key] = (counterTypeSales[key] || 0) + order.totalPaise
    })

    // Tax Summary
    const totalTax = filteredOrders.reduce((sum, order) => sum + order.taxPaise, 0)
    const totalCGST = totalTax / 2
    const totalSGST = totalTax / 2
    const totalVAT = 0 // Assuming GST applies

    // Payment mode wise revenue
    const collectedPayments = payments.filter(p =>
      orderIds.has(p.orderId) &&
      p.status === 'success' &&
      !['account', 'due'].includes(p.method)
    )
    const totalReceipts = collectedPayments.reduce((sum, p) => sum + p.amountPaise, 0)
    const totalExpenses = 0
    const paymentModeTotals = collectedPayments.reduce<Record<string, { amountPaise: number; count: number }>>((acc, payment) => {
      acc[payment.method] ??= { amountPaise: 0, count: 0 }
      acc[payment.method].amountPaise += payment.amountPaise
      acc[payment.method].count += 1
      return acc
    }, {})

    // Cash Analysis
    const cashPayments = collectedPayments.filter(p => p.method === 'cash')
    const inwardCash = cashPayments.reduce((sum, p) => sum + p.amountPaise, 0)
    const outwardCash = 0
    const netCash = inwardCash - outwardCash

    // Alerts
    let itemsCancelled = 0
    let amtCancelled = 0
    filteredKots.forEach(kot => {
      if (kot.status === 'cancelled') {
        itemsCancelled += kot.items.length
        kot.items.forEach(ki => {
          const oi = orderItems.find(i => i.id === ki.orderItemId)
          if (oi) amtCancelled += oi.unitPricePaise * oi.quantity
        })
      } else {
        kot.items.forEach(ki => {
          if (ki.status === 'cancelled') {
            itemsCancelled += 1
            const oi = orderItems.find(i => i.id === ki.orderItemId)
            if (oi) amtCancelled += oi.unitPricePaise * oi.quantity
          }
        })
      }
    })
    
    const itemsReturned = 0
    const amtReturned = 0
    const duplicatePrints = 0
    const allOrdersInRange = orders.filter(o => o.businessDate >= fromDate && o.businessDate <= toDate && !['cancelled', 'void'].includes(o.status) && o.totalPaise > 0)
    const duePayments = allOrdersInRange.filter(o => o.paymentStatus !== 'paid').reduce((sum, o) => sum + o.totalPaise, 0)

    // Customer summary
    const uniqueCustomers = new Set(filteredOrders.filter(o => o.customerPhone).map(o => o.customerPhone))
    const customerCount = uniqueCustomers.size || (filteredOrders.length > 0 ? 1 : 0)

    return {
      sales: { totalBills, itemsSold, netSalesAmount },
      discount: { billsWithDiscount, discountOnItems, discountOnBills, totalDiscount },
      categorySales,
      subcategorySales,
      kitchenSales,
      sectionSales,
      counterTypeSales,
      taxes: { totalCGST, totalSGST, totalVAT, totalTax },
      payments: { totalReceipts, totalExpenses, paymentModeTotals },
      cash: { inwardCash, outwardCash, netCash },
      alerts: { itemsCancelled, amtCancelled, itemsReturned, amtReturned, duplicatePrints, duePayments },
      customer: { customerCount, walletBalance: 0 },
    }
  }, [orders, orderItems, kots, menuItems, menuCategories, tables, floors, payments, fromDate, toDate])

  const handlePrint = async () => {
    if (printBusy) return
    setPrintBusy(true)
    try {
      const result = await sendPrintJob(printSettings, {
        jobName: `BhojPatra Business Summary ${fromDate} to ${toDate}`,
        text: buildBusinessSummaryPrintText(reportData, fromDate, toDate, {
          name: outlet.name,
          businessName: printSettings.businessName || outlet.name,
          address: outlet.address,
          phone: outlet.phone,
          gstin: outlet.gstin,
          receiptWidth: printSettings.receiptWidth,
          showGstin: printSettings.showGstin,
        }),
        logoDataUrl: outlet.logoDataUrl,
      })
      addToast('success', result === 'direct' ? 'Business summary sent directly to the printer' : 'Business summary opened in the system print dialog', 'Business Summary Print')
    } catch (error) {
      addToast('error', describePrinterError(error), 'Business Summary Print')
    } finally {
      setPrintBusy(false)
    }
  }

  const renderSection = (title: string, data: Record<string, number | string>, isCurrency = true) => {
    const entries = Object.entries(data)
    if (entries.length === 0) return null

    return (
      <>
        <tr>
          <td colSpan={2} className="px-4 py-2 bg-slate-50 font-black text-slate-800 text-[13px] border-b border-slate-200">
            * {title} *
          </td>
        </tr>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-slate-100 hover:bg-slate-50/50">
            <td className="px-4 py-2 text-sm text-slate-600 font-bold">{key}</td>
            <td className="px-4 py-2 text-sm text-slate-900 font-black text-right">
              {isCurrency && typeof value === 'number' 
                ? (value / 100).toFixed(2)
                : value.toString()}
            </td>
          </tr>
        ))}
      </>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCategorySales}
              onChange={(event) => setShowCategorySales(event.target.checked)}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-xs font-bold text-slate-600">Category wise Sales</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSubcategorySales}
              onChange={(event) => setShowSubcategorySales(event.target.checked)}
              className="rounded text-primary focus:ring-primary"
            />
            <span className="text-xs font-bold text-slate-600">Subcat. wise Sales</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-primary" />
            <span className="text-xs font-bold text-slate-600">Kitchen wise Sales</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-primary" />
            <span className="text-xs font-bold text-slate-600">Section wise Sales</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-primary focus:ring-primary" />
            <span className="text-xs font-bold text-slate-600">Countertype wise Sales</span>
          </label>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-4 py-2 bg-[#00BCD4] hover:bg-[#00ACC1] text-white text-xs font-black rounded-lg transition-colors shadow-sm">
            Show Report
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 bg-[#FFC107] hover:bg-amber-500 text-amber-900 text-xs font-black rounded-lg transition-colors shadow-sm">
            <Download size={14} /> Csv
          </button>
          <button onClick={handlePrint} disabled={printBusy} className="flex items-center gap-1.5 px-4 py-2 bg-[#FFC107] hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60 text-amber-900 text-xs font-black rounded-lg transition-colors shadow-sm">
            <Printer size={14} /> {printBusy ? 'Printing...' : 'Prnt'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#B4C6E7] text-[#2F5496] text-sm uppercase tracking-wider">
              <th className="px-4 py-3 font-black border border-[#8FAADC] w-2/3">Parameter</th>
              <th className="px-4 py-3 font-black border border-[#8FAADC] text-right w-1/3">Value</th>
            </tr>
          </thead>
          <tbody className="border-x border-[#8FAADC] border-b">
            <tr><td colSpan={2} className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-b border-slate-200">Search</td></tr>
            
            {renderSection('Sales Summary', {
              'Total bills': reportData.sales.totalBills.toString(),
              'Items sold': reportData.sales.itemsSold.toString(),
              'Net sales amount': reportData.sales.netSalesAmount
            })}

            {renderSection('Discount Summary', {
              'Bills with discount': reportData.discount.billsWithDiscount.toString(),
              'Discount on items (A)': reportData.discount.discountOnItems,
              'Discount on bills (B)': reportData.discount.discountOnBills,
              'Total Discount (A+B)': reportData.discount.totalDiscount,
            })}

            {showCategorySales && renderSection('Category wise sales', reportData.categorySales)}
            {showSubcategorySales && renderSection('Subcategory wise sales', reportData.subcategorySales)}
            {renderSection('Kitchen wise sales', reportData.kitchenSales)}
            {renderSection('Section wise sales', reportData.sectionSales)}
            {renderSection('Counter type wise sales', reportData.counterTypeSales)}

            {renderSection('Tax Summary', {
              'Total CGST': reportData.taxes.totalCGST,
              'Total UT/SGST': reportData.taxes.totalSGST,
              'Total VAT': reportData.taxes.totalVAT,
              'Total taxes': reportData.taxes.totalTax,
            })}

            {renderSection('Payment mode wise revenue', {
              'Total receipts': reportData.payments.totalReceipts,
              'Cash amount': reportData.payments.paymentModeTotals.cash?.amountPaise ?? 0,
              'Cash transactions': String(reportData.payments.paymentModeTotals.cash?.count ?? 0),
              'Card amount': reportData.payments.paymentModeTotals.card?.amountPaise ?? 0,
              'Card transactions': String(reportData.payments.paymentModeTotals.card?.count ?? 0),
              'UPI amount': reportData.payments.paymentModeTotals.upi?.amountPaise ?? 0,
              'UPI transactions': String(reportData.payments.paymentModeTotals.upi?.count ?? 0),
              'Wallet amount': reportData.payments.paymentModeTotals.wallet?.amountPaise ?? 0,
              'Paytm amount': reportData.payments.paymentModeTotals.paytm?.amountPaise ?? 0,
              'Cheque amount': reportData.payments.paymentModeTotals.cheque?.amountPaise ?? 0,
              'Aggregator amount': reportData.payments.paymentModeTotals.aggregator?.amountPaise ?? 0,
              'Total expenses': reportData.payments.totalExpenses,
            })}

            {renderSection('Cash Analysis', {
              'Inward Cash (A)': reportData.cash.inwardCash,
              'Outward Cash (B)': reportData.cash.outwardCash,
              'Net Cash (A-B)': reportData.cash.netCash,
            })}

            {renderSection('Receipt/Expense Analysis', {
              'Total Receipts (A)': reportData.payments.totalReceipts,
              'Total Expenditure (B)': reportData.payments.totalExpenses,
              'Receipts - Expenses (A-B)': reportData.payments.totalReceipts - reportData.payments.totalExpenses,
            })}

            {renderSection('Alerts', {
              'Items cancelled (KOT)': reportData.alerts.itemsCancelled.toString(),
              'Amt cancelled (KOT)': reportData.alerts.amtCancelled,
              'Items returned': reportData.alerts.itemsReturned.toString(),
              'Amt returned': reportData.alerts.amtReturned,
              'Duplicate prints': reportData.alerts.duplicatePrints.toString(),
              'Due payments': reportData.alerts.duePayments,
            })}

            {renderSection('Customer summary', {
              'Customer count': reportData.customer.customerCount.toString(),
              'Total Wallet balance': reportData.customer.walletBalance,
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
