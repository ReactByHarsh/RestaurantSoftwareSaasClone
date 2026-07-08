import { useMemo, useState } from 'react'
import { Download, Printer, RefreshCw, Search } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { formatPaise } from '../../lib/money'

interface Props {
  fromDate: string
  toDate: string
}

type SortMode = 'volume' | 'net' | 'name'
type ViewMode = 'product' | 'category'

export default function SalesSummaryReport({ fromDate, toDate }: Props) {
  const { orders, orderItems, menuItems, menuCategories } = useBillingStore()
  const [productSearch, setProductSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('volume')
  const [viewMode, setViewMode] = useState<ViewMode>('product')

  const productRows = useMemo(() => {
    const paidOrders = orders.filter((order) =>
      order.businessDate >= fromDate &&
      order.businessDate <= toDate &&
      order.paymentStatus === 'paid' &&
      order.status !== 'cancelled'
    )
    const paidOrderIds = new Set(paidOrders.map((order) => order.id))
    const orderNoById = new Map(paidOrders.map((order) => [order.id, order.orderNo]))

    const grouped = orderItems
      .filter((item) => paidOrderIds.has(item.orderId) && item.status !== 'cancelled')
      .reduce<Record<string, {
        productName: string
        category: string
        subCategory: string
        orderIds: Set<string>
        itemCount: number
        itemAmountPaise: number
        itemDiscountPaise: number
        taxesPaise: number
        itemNetPaise: number
      }>>((acc, item) => {
        const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId)
        const category = menuItem ? menuCategories.find((candidate) => candidate.id === menuItem.categoryId)?.name : undefined
        const key = item.menuItemId || item.nameSnapshot
        acc[key] ??= {
          productName: item.nameSnapshot,
          category: category || 'Uncategorised',
          subCategory: menuItem?.itemType ? menuItem.itemType.toUpperCase() : item.itemType.toUpperCase(),
          orderIds: new Set<string>(),
          itemCount: 0,
          itemAmountPaise: 0,
          itemDiscountPaise: 0,
          taxesPaise: 0,
          itemNetPaise: 0,
        }
        if (orderNoById.has(item.orderId)) acc[key].orderIds.add(item.orderId)
        acc[key].itemCount += item.quantity
        acc[key].itemAmountPaise += item.unitPricePaise * item.quantity
        acc[key].itemDiscountPaise += item.discountPaise
        acc[key].taxesPaise += item.taxPaise
        acc[key].itemNetPaise += item.totalPaise
        return acc
      }, {})

    const productQuery = productSearch.trim().toLowerCase()
    const categoryQuery = categorySearch.trim().toLowerCase()
    return Object.values(grouped)
      .filter((row) => !productQuery || row.productName.toLowerCase().includes(productQuery))
      .filter((row) => !categoryQuery || row.category.toLowerCase().includes(categoryQuery))
      .sort((a, b) => {
        if (sortMode === 'net') return b.itemNetPaise - a.itemNetPaise
        if (sortMode === 'name') return a.productName.localeCompare(b.productName)
        return b.itemCount - a.itemCount
      })
      .map((row) => ({ ...row, orderCount: row.orderIds.size }))
  }, [categorySearch, fromDate, menuCategories, menuItems, orderItems, orders, productSearch, sortMode, toDate])

  const categoryRows = useMemo(() => {
    const paidOrders = orders.filter((order) =>
      order.businessDate >= fromDate &&
      order.businessDate <= toDate &&
      order.paymentStatus === 'paid' &&
      order.status !== 'cancelled'
    )
    const paidOrderIds = new Set(paidOrders.map((order) => order.id))
    const categoryById = new Map(menuCategories.map((category) => [category.id, category]))
    const topCategoryName = (categoryId?: string) => {
      let cursor = categoryId ? categoryById.get(categoryId) : undefined
      let top = cursor
      const seen = new Set<string>()
      while (cursor?.parentId && !seen.has(cursor.id)) {
        seen.add(cursor.id)
        cursor = categoryById.get(cursor.parentId)
        if (cursor) top = cursor
      }
      return top?.name || 'Uncategorised'
    }

    const grouped = orderItems
      .filter((item) => paidOrderIds.has(item.orderId) && item.status !== 'cancelled')
      .reduce<Record<string, {
        productName: string
        category: string
        subCategory: string
        orderIds: Set<string>
        itemCount: number
        itemAmountPaise: number
        itemDiscountPaise: number
        taxesPaise: number
        itemNetPaise: number
      }>>((acc, item) => {
        const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId)
        const category = topCategoryName(menuItem?.categoryId)
        acc[category] ??= {
          productName: category,
          category,
          subCategory: 'Category wise',
          orderIds: new Set<string>(),
          itemCount: 0,
          itemAmountPaise: 0,
          itemDiscountPaise: 0,
          taxesPaise: 0,
          itemNetPaise: 0,
        }
        acc[category].orderIds.add(item.orderId)
        acc[category].itemCount += item.quantity
        acc[category].itemAmountPaise += item.unitPricePaise * item.quantity
        acc[category].itemDiscountPaise += item.discountPaise
        acc[category].taxesPaise += item.taxPaise
        acc[category].itemNetPaise += item.totalPaise
        return acc
      }, {})

    const categoryQuery = categorySearch.trim().toLowerCase()
    return Object.values(grouped)
      .filter((row) => !categoryQuery || row.category.toLowerCase().includes(categoryQuery))
      .sort((a, b) => {
        if (sortMode === 'net') return b.itemNetPaise - a.itemNetPaise
        if (sortMode === 'name') return a.category.localeCompare(b.category)
        return b.itemCount - a.itemCount
      })
      .map((row) => ({ ...row, orderCount: row.orderIds.size }))
  }, [categorySearch, fromDate, menuCategories, menuItems, orderItems, orders, sortMode, toDate])

  const rows = viewMode === 'category' ? categoryRows : productRows

  const totals = rows.reduce((acc, row) => ({
    orderCount: acc.orderCount + row.orderCount,
    itemCount: acc.itemCount + row.itemCount,
    itemAmountPaise: acc.itemAmountPaise + row.itemAmountPaise,
    itemDiscountPaise: acc.itemDiscountPaise + row.itemDiscountPaise,
    taxesPaise: acc.taxesPaise + row.taxesPaise,
    itemNetPaise: acc.itemNetPaise + row.itemNetPaise,
  }), {
    orderCount: 0,
    itemCount: 0,
    itemAmountPaise: 0,
    itemDiscountPaise: 0,
    taxesPaise: 0,
    itemNetPaise: 0,
  })

  const handleCsv = () => {
    const header = viewMode === 'category'
      ? ['Category Name', 'Order count', 'Item count', 'Item amount', 'Item Discount', 'Taxes', 'Item Net']
      : ['Product Name', 'Category', 'Sub category', 'Order count', 'Item count', 'Item amount', 'Item Discount', 'Taxes', 'Item Net']
    const csvRows = rows.map((row) => [
      ...(viewMode === 'category' ? [row.category] : [row.productName, row.category, row.subCategory]),
      row.orderCount,
      row.itemCount,
      (row.itemAmountPaise / 100).toFixed(2),
      (row.itemDiscountPaise / 100).toFixed(2),
      (row.taxesPaise / 100).toFixed(2),
      (row.itemNetPaise / 100).toFixed(2),
    ])
    const csv = [header, ...csvRows].map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bhojpatra-sales-summary-${fromDate}-to-${toDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <div className="border-b-2 border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/50 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Sales Summary Search</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">{viewMode === 'category' ? 'Category Sales Summary' : 'Product Sales Summary'}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">From {fromDate} to {toDate}. Taxes use the order item values saved during billing.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-cyan-700">
              <RefreshCw size={14} /> Show Report
            </button>
            <button onClick={handleCsv} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-amber-950 shadow-sm hover:bg-amber-500">
              <Download size={14} /> Csv
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-amber-950 shadow-sm hover:bg-amber-500">
              <Printer size={14} /> Print
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_1fr_220px]">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">View Type</span>
            <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)} className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10">
              <option value="product">Product wise</option>
              <option value="category">Category wise</option>
            </select>
          </label>
          <label className="relative block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Product Name</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" size={15} />
            <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} disabled={viewMode === 'category'} placeholder="Search product..." className="w-full rounded-xl border-2 border-slate-200 py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-400" />
          </label>
          <label className="relative block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Category</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" size={15} />
            <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search category..." className="w-full rounded-xl border-2 border-slate-200 py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Sort By</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10">
              <option value="volume">Sales volume wise</option>
              <option value="net">Net amount wise</option>
              <option value="name">Product name wise</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-auto p-4">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#B8C8E9] text-slate-900">
              {(viewMode === 'category'
                ? ['Category Name', 'Order count', 'Item count', 'Item amount', 'Item Discount', 'Taxes', 'Item Net']
                : ['Product Name', 'Category', 'Sub category', 'Order count', 'Item count', 'Item amount', 'Item Discount', 'Taxes', 'Item Net']
              ).map((head) => (
                <th key={head} className="border border-slate-300 px-3 py-3 text-xs font-black">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={viewMode === 'category' ? 7 : 9} className="border border-slate-200 px-3 py-10 text-center text-sm font-bold text-slate-400">No {viewMode === 'category' ? 'category' : 'product'} sales found for this range.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={`${row.productName}-${row.category}`} className="hover:bg-slate-50">
                {viewMode === 'category' ? (
                  <td className="border border-slate-200 px-3 py-2 font-black text-slate-800">{row.category}</td>
                ) : (
                  <>
                    <td className="border border-slate-200 px-3 py-2 font-black text-slate-800">{row.productName}</td>
                    <td className="border border-slate-200 px-3 py-2 font-bold text-slate-600">{row.category}</td>
                    <td className="border border-slate-200 px-3 py-2 font-bold text-slate-600">{row.subCategory}</td>
                  </>
                )}
                <td className="border border-slate-200 px-3 py-2 text-right font-black">{row.orderCount}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-black">{row.itemCount}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-bold">{formatPaise(row.itemAmountPaise)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-bold">{formatPaise(row.itemDiscountPaise)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-bold">{formatPaise(row.taxesPaise)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-black text-slate-900">{formatPaise(row.itemNetPaise)}</td>
              </tr>
            ))}
            <tr className="bg-teal-700 text-white">
              <td colSpan={viewMode === 'category' ? 1 : 3} className="px-3 py-3 font-black">Total</td>
              <td className="px-3 py-3 text-right font-black">{totals.orderCount}</td>
              <td className="px-3 py-3 text-right font-black">{totals.itemCount}</td>
              <td className="px-3 py-3 text-right font-black">{formatPaise(totals.itemAmountPaise)}</td>
              <td className="px-3 py-3 text-right font-black">{formatPaise(totals.itemDiscountPaise)}</td>
              <td className="px-3 py-3 text-right font-black">{formatPaise(totals.taxesPaise)}</td>
              <td className="px-3 py-3 text-right font-black">{formatPaise(totals.itemNetPaise)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-xs font-bold text-slate-600"><strong>Note:</strong> Taxes may be included in the rate as per your product and billing setup.</p>
      </div>
    </div>
  )
}
