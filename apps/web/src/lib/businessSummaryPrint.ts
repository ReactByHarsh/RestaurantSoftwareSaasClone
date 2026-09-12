import type { PrintSettings } from '../store/billingStore'

export type BusinessSummaryPrintData = {
  sales: { totalBills: number; itemsSold: number; netSalesAmount: number }
  discount: { billsWithDiscount: number; discountOnItems: number; discountOnBills: number; totalDiscount: number }
  categorySales: Record<string, number>
  subcategorySales: Record<string, number>
  kitchenSales: Record<string, number>
  sectionSales: Record<string, number>
  counterTypeSales: Record<string, number>
  taxes: { totalCGST: number; totalSGST: number; totalVAT: number; totalTax: number }
  payments: { totalReceipts: number; totalExpenses: number; paymentModeTotals: Record<string, { amountPaise: number; count: number }> }
  cash: { inwardCash: number; outwardCash: number; netCash: number }
  alerts: { itemsCancelled: number; amtCancelled: number; itemsReturned: number; amtReturned: number; duplicatePrints: number; duePayments: number }
  customer: { customerCount: number; walletBalance: number }
}

type SummaryPrintOutlet = Pick<PrintSettings, 'businessName' | 'receiptWidth' | 'showGstin'> & {
  name: string
  address?: string
  phone?: string
  gstin?: string
}

const widths = { '58mm': 30, '72mm': 38, '80mm': 46 } as const

function money(paise: number) {
  return `Rs.${(paise / 100).toFixed(2)}`
}

function center(value: string, width: number) {
  const text = value.slice(0, width)
  return `${' '.repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`
}

function columns(left: string, right: string, width: number) {
  const safeRight = right.slice(0, Math.floor(width / 2))
  const safeLeft = left.slice(0, Math.max(1, width - safeRight.length - 1))
  return `${safeLeft}${' '.repeat(Math.max(1, width - safeLeft.length - safeRight.length))}${safeRight}`
}

function wrappedCentered(value: string, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    if (!line) line = word
    else if (line.length + word.length + 1 <= width) line += ` ${word}`
    else {
      lines.push(center(line, width))
      line = word
    }
  })
  if (line) lines.push(center(line, width))
  return lines
}

function rule(width: number, character = '-') {
  return character.repeat(width)
}

export function buildBusinessSummaryPrintText(
  data: BusinessSummaryPrintData,
  fromDate: string,
  toDate: string,
  outlet: SummaryPrintOutlet,
) {
  const width = widths[outlet.receiptWidth]
  const lines = [
    rule(width, '='),
    center(outlet.businessName || outlet.name, width),
    ...wrappedCentered(outlet.address ?? '', width),
    ...(outlet.phone ? [center(`Ph: ${outlet.phone}`, width)] : []),
    ...(outlet.gstin && outlet.showGstin ? [center(`GSTIN: ${outlet.gstin}`, width)] : []),
    center('BUSINESS SUMMARY', width),
    columns('From', fromDate, width),
    columns('To', toDate, width),
    rule(width, '='),
  ]

  const addSection = (title: string, entries: Array<[string, string]>) => {
    if (entries.length === 0) return
    lines.push(center(`* ${title} *`, width), rule(width))
    entries.forEach(([label, value]) => lines.push(columns(label, value, width)))
  }

  addSection('Sales Summary', [
    ['Total bills', String(data.sales.totalBills)],
    ['Items sold', String(data.sales.itemsSold)],
    ['Net sales amount', money(data.sales.netSalesAmount)],
  ])
  addSection('Discount Summary', [
    ['Bills with discount', String(data.discount.billsWithDiscount)],
    ['Discount on items (A)', money(data.discount.discountOnItems)],
    ['Discount on bills (B)', money(data.discount.discountOnBills)],
    ['Total Discount (A+B)', money(data.discount.totalDiscount)],
  ])

  const addMapSection = (title: string, values: Record<string, number>) => {
    addSection(title, Object.entries(values).map(([label, value]) => [label, money(value)]))
  }
  addMapSection('Category wise sales', data.categorySales)
  addMapSection('Subcategory wise sales', data.subcategorySales)
  addMapSection('Kitchen wise sales', data.kitchenSales)
  addMapSection('Section wise sales', data.sectionSales)
  addMapSection('Counter type wise sales', data.counterTypeSales)

  addSection('Tax Summary', [
    ['Total CGST', money(data.taxes.totalCGST)],
    ['Total UT/SGST', money(data.taxes.totalSGST)],
    ['Total VAT', money(data.taxes.totalVAT)],
    ['Total taxes', money(data.taxes.totalTax)],
  ])

  const paymentEntries: Array<[string, string]> = [
    ['Total receipts', money(data.payments.totalReceipts)],
  ]
  Object.entries(data.payments.paymentModeTotals).forEach(([method, details]) => {
    const label = method.charAt(0).toUpperCase() + method.slice(1)
    paymentEntries.push([`${label} amount`, money(details.amountPaise)], [`${label} transactions`, String(details.count)])
  })
  paymentEntries.push(['Total expenses', money(data.payments.totalExpenses)])
  addSection('Payment mode wise revenue', paymentEntries)

  addSection('Cash Analysis', [
    ['Inward Cash (A)', money(data.cash.inwardCash)],
    ['Outward Cash (B)', money(data.cash.outwardCash)],
    ['Net Cash (A-B)', money(data.cash.netCash)],
  ])
  addSection('Receipt/Expense Analysis', [
    ['Total Receipts (A)', money(data.payments.totalReceipts)],
    ['Total Expenditure (B)', money(data.payments.totalExpenses)],
    ['Receipts - Expenses (A-B)', money(data.payments.totalReceipts - data.payments.totalExpenses)],
  ])
  addSection('Alerts', [
    ['Items cancelled (KOT)', String(data.alerts.itemsCancelled)],
    ['Amt cancelled (KOT)', money(data.alerts.amtCancelled)],
    ['Items returned', String(data.alerts.itemsReturned)],
    ['Amt returned', money(data.alerts.amtReturned)],
    ['Duplicate prints', String(data.alerts.duplicatePrints)],
    ['Due payments', money(data.alerts.duePayments)],
  ])
  addSection('Customer summary', [
    ['Customer count', String(data.customer.customerCount)],
    ['Total Wallet balance', money(data.customer.walletBalance)],
  ])

  lines.push(rule(width, '='), center('END OF BUSINESS SUMMARY', width), '')
  return lines.join('\n')
}
