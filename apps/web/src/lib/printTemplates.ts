import type { KOT, MenuCategory, MenuItem, Order, OrderItem, Payment } from './types'
import { calculateTax } from './money'
import { buildUpiPaymentUrl } from './upi'

type OutletPrintInfo = { name: string; address?: string; phone?: string; gstin?: string; logoDataUrl?: string }
type ReceiptPrintInfo = {
  receiptWidth: '58mm' | '72mm' | '80mm'
  billMode?: 'single' | 'separate'
  businessName: string
  headerText: string
  footerText: string
  showGstin: boolean
  showGstinOnFirstBill?: boolean
  showGstinOnSecondBill?: boolean
  showKotToken: boolean
  showTaxInvoiceLabel?: boolean
  showBillPartLabel?: boolean
  upiId?: string
  showUpiQrOnBill?: boolean
  showUpiIdOnBill?: boolean
  showPaymentDetailsOnBill?: boolean
}
export type ReceiptPartSection = string

export interface ReceiptPrintPart {
  section: ReceiptPartSection
  title: string
  partIndex: number
  partCount: number
  items: OrderItem[]
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  netPaise: number
  foodNetPaise?: number
  previousPartsNetPaise?: number
  combinedNetPaise?: number
  /** Amount encoded in the UPI QR, which may be only one part of a split payment. */
  upiAmountPaise?: number
  showPaymentDetails: boolean
  showGstin: boolean
  documentLabel: string
  upiPaymentUrl?: string
  text: string
}

const money = (paise: number) => `Rs.${(paise / 100).toFixed(2)}`
const widths = { '58mm': 30, '72mm': 38, '80mm': 46 } as const

function center(value: string, width: number) {
  const text = value.slice(0, width)
  return `${' '.repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`
}

function wrappedCentered(value: string, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    // Keep unusually long address tokens printable without overflowing the paper.
    const chunks = word.match(new RegExp(`.{1,${Math.max(1, width)}}`, 'g')) ?? [word]
    chunks.forEach((chunk) => {
      if (!line) {
        line = chunk
      } else if (line.length + 1 + chunk.length <= width) {
        line += ` ${chunk}`
      } else {
        lines.push(center(line, width))
        line = chunk
      }
    })
  })
  if (line) lines.push(center(line, width))
  return lines
}

function rule(width: number, char = '-') {
  return char.repeat(width)
}

function columns(left: string, right: string, width: number) {
  const safeRight = right.slice(0, Math.floor(width / 2))
  const safeLeft = left.slice(0, Math.max(1, width - safeRight.length - 1))
  return `${safeLeft}${' '.repeat(Math.max(1, width - safeLeft.length - safeRight.length))}${safeRight}`
}

function tableLine(name: string, qty: number, ratePaise: number, amountPaise: number, width: number) {
  const qtyText = String(qty).slice(0, 3).padStart(3)
  const rateText = (ratePaise / 100).toFixed(2).slice(0, 8).padStart(8)
  const amountText = (amountPaise / 100).toFixed(2).slice(0, 9).padStart(9)
  const nameWidth = Math.max(10, width - qtyText.length - rateText.length - amountText.length - 3)
  const safeName = name.slice(0, nameWidth).padEnd(nameWidth)
  return `${safeName} ${qtyText} ${rateText} ${amountText}`
}

function tableHeader(width: number) {
  const qtyText = 'QTY'.padStart(3)
  const rateText = 'RATE'.padStart(8)
  const amountText = 'AMOUNT'.padStart(9)
  const nameWidth = Math.max(10, width - qtyText.length - rateText.length - amountText.length - 3)
  return `${'ITEM'.padEnd(nameWidth)} ${qtyText} ${rateText} ${amountText}`
}

function paymentSummaryLines(order: Order, payments: Payment[], width: number) {
  const successfulPayments = payments.filter((payment) => payment.status === 'success')
  const paidPaise = successfulPayments.reduce((sum, payment) => sum + payment.amountPaise, 0)
  const cashPaise = successfulPayments
    .filter((payment) => payment.method === 'cash')
    .reduce((sum, payment) => sum + payment.amountPaise, 0)
  const pendingPaise = Math.max(0, order.totalPaise - Math.min(order.totalPaise, paidPaise))
  const methodTotals = successfulPayments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPaise
    return acc
  }, {})
  return [
    rule(width),
    center('PAYMENT DETAILS', width),
    columns('Paid Amount', money(Math.min(order.totalPaise, paidPaise)), width),
    columns('Cash', money(cashPaise), width),
    ...Object.entries(methodTotals)
      .filter(([method]) => method !== 'cash')
      .map(([method, amount]) => columns(method.toUpperCase(), money(amount), width)),
    columns('Pending', money(pendingPaise), width),
  ]
}

function receiptUpiAmountPaise(order: Order, payments: Payment[]) {
  const successfulPayments = payments.filter((payment) => payment.status === 'success')
  // Once a bill has been settled, encode only the amount actually assigned to UPI.
  // This prevents a cash + UPI split from generating a QR for the full bill again.
  if (successfulPayments.length > 0) {
    return successfulPayments
      .filter((payment) => payment.method === 'upi')
      .reduce((sum, payment) => sum + payment.amountPaise, 0)
  }
  // Draft/proforma receipts have no payment rows yet, so the full payable amount is
  // the amount the customer should be invited to pay by UPI.
  return Math.max(0, order.totalPaise)
}

function upiPaymentLines(order: Order, settings: ReceiptPrintInfo, amountPaise: number, width: number) {
  const url = buildReceiptUpiPaymentUrl(order, settings, amountPaise)
  const upiId = settings.upiId?.trim()
  if (!url || !upiId) return []
  return [
    rule(width),
    center('UPI PAYMENT', width),
    ...(settings.showUpiIdOnBill === true ? [columns('UPI ID', upiId, width)] : []),
    columns('Amount', money(amountPaise), width),
    'Scan QR to pay',
  ]
}

function buildReceiptUpiPaymentUrl(order: Order, settings: ReceiptPrintInfo, amountPaise: number) {
  const upiId = settings.upiId?.trim()
  if (!settings.showUpiQrOnBill || !upiId || amountPaise <= 0) return undefined
  return buildUpiPaymentUrl({
    upiId,
    payeeName: settings.businessName,
    amountPaise,
    note: `Bill ${order.orderNo}`,
  })
}

function categoryChain(categories: MenuCategory[], categoryId?: string) {
  const chain: MenuCategory[] = []
  let cursor = categories.find((category) => category.id === categoryId)
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    chain.unshift(cursor)
    seen.add(cursor.id)
    cursor = cursor.parentId ? categories.find((category) => category.id === cursor?.parentId) : undefined
  }
  return chain
}

function receiptGroupForItem(item: OrderItem, menuItems: MenuItem[], categories: MenuCategory[]) {
  const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId)
  const chain = categoryChain(categories, menuItem?.categoryId)
  const category = chain[chain.length - 1]
  const parent = chain.length > 1 ? chain[0] : undefined
  const explicit = [...chain].reverse().find((candidate) => candidate.billGroup?.trim())?.billGroup?.trim()
  const separate = [...chain].reverse().find((candidate) => candidate.separateBill !== undefined)?.separateBill
  const fallbackText = `${item.nameSnapshot} ${chain.map((candidate) => candidate.name).join(' ')} ${menuItem?.description ?? ''}`.toLowerCase()
  const inferredSeparate = /\b(liquor|alcohol|beer|wine|whisky|whiskey|rum|vodka|gin|brandy|scotch|tequila|cocktail|bar|peg|bottle)\b/.test(fallbackText)
  const isSeparate = separate ?? inferredSeparate
  const title = isSeparate ? (explicit || parent?.name || category?.name || 'Separate') : 'Food'
  return {
    key: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'food',
    title: `${title.toUpperCase()} BILL`,
  }
}

function splitReceiptItems(items: OrderItem[], menuItems: MenuItem[], categories: MenuCategory[], billMode: 'single' | 'separate' = 'separate') {
  if (billMode === 'single') return [{ section: 'all' as const, title: 'BILL', items }]
  const groups = new Map<string, { section: string; title: string; items: OrderItem[] }>()
  items.forEach((item) => {
    const group = receiptGroupForItem(item, menuItems, categories)
    const existing = groups.get(group.key)
    if (existing) existing.items.push(item)
    else groups.set(group.key, { section: group.key, title: group.title, items: [item] })
  })
  return Array.from(groups.values())
}

function receiptDocumentLabel(type: 'invoice' | 'proforma', section: ReceiptPartSection) {
  if (section === 'all') return type === 'proforma' ? 'Not a tax invoice' : 'Tax Invoice'
  if (type === 'proforma' || section.includes('liquor') || section.includes('alcohol')) return 'Not a tax invoice'
  return 'Tax Invoice'
}

function shouldShowGstin(settings: ReceiptPrintInfo, partIndex = 1, partCount = 1) {
  if (!settings.showGstin) return false
  if (partCount <= 1) return settings.showGstinOnFirstBill ?? settings.showGstin
  if (partIndex <= 1) return settings.showGstinOnFirstBill ?? settings.showGstin
  return settings.showGstinOnSecondBill ?? settings.showGstin
}

function printableTaxPercent(item: OrderItem, menuItems: MenuItem[]) {
  const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId)
  if (menuItem?.taxType === 'None') return 0
  if (menuItem && Number.isFinite(menuItem.taxPercent)) return menuItem.taxPercent
  if (item.taxType === 'None') return 0
  return item.taxPercent ?? 0
}

function printableReceiptItems(items: OrderItem[], menuItems: MenuItem[]) {
  return items.map((item) => {
    const taxablePaise = Math.max(0, item.unitPricePaise * item.quantity - item.discountPaise)
    const taxPaise = calculateTax(taxablePaise, printableTaxPercent(item, menuItems))
    return {
      ...item,
      taxPaise,
      totalPaise: taxablePaise + taxPaise,
    }
  })
}

function partTotals(items: OrderItem[]) {
  const subtotalPaise = items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
  const discountPaise = items.reduce((sum, item) => sum + item.discountPaise, 0)
  const taxPaise = items.reduce((sum, item) => sum + item.taxPaise, 0)
  const cgstPaise = Math.round(taxPaise / 2)
  const sgstPaise = taxPaise - cgstPaise
  const netPaise = items.reduce((sum, item) => sum + item.totalPaise, 0)
  return { subtotalPaise, discountPaise, taxPaise, cgstPaise, sgstPaise, netPaise }
}

export function buildKotPrintText(kot: KOT, outlet: OutletPrintInfo, settings: ReceiptPrintInfo) {
  const width = widths[settings.receiptWidth]
  const itemCount = kot.items.reduce((sum, item) => sum + item.quantity, 0)
  const lines = [
    rule(width, '='),
    center('KITCHEN ORDER TICKET', width),
    center(outlet.name, width),
  ]
  if (settings.showKotToken) {
    lines.push(center(kot.kotNo, width))
  }
  lines.push(
    rule(width, '='),
    columns('Order', kot.orderNo, width),
    ...(kot.tableName ? [columns('Table', kot.tableName, width)] : []),
    columns('Type', kot.orderType.replace(/_/g, ' '), width),
    columns('Time', new Date(kot.createdAt).toLocaleString('en-IN'), width),
    rule(width),
  )
  kot.items.forEach(item => {
    lines.push(`${String(item.quantity).padStart(2)} x ${item.name}`.slice(0, width))
    if (item.modifiers?.length) lines.push(`   + ${item.modifiers.join(', ')}`.slice(0, width))
    if (item.note) lines.push(`   NOTE: ${item.note}`.slice(0, width))
    lines.push(rule(width, '.'))
  })
  lines.push(center(`TOTAL ITEMS: ${itemCount}`, width), rule(width, '='))
  return lines.join('\n')
}

export function buildReceiptPrintText(
  order: Order,
  items: OrderItem[],
  payments: Payment[],
  outlet: OutletPrintInfo,
  settings: ReceiptPrintInfo,
  type: 'invoice' | 'proforma',
) {
  const width = widths[settings.receiptWidth]
  const lines = [
    center(settings.businessName || outlet.name, width),
    ...(outlet.address ? wrappedCentered(outlet.address, width) : []),
    ...(outlet.phone ? [center(`Ph: ${outlet.phone}`, width)] : []),
    ...(outlet.gstin && shouldShowGstin(settings) ? [center(`GSTIN: ${outlet.gstin}`, width)] : []),
    center(type === 'proforma' ? 'PROFORMA / ESTIMATE' : settings.headerText, width),
    center(type === 'proforma' ? 'Not a tax invoice' : 'Tax Invoice', width),
    rule(width),
    columns('Bill', order.orderNo, width),
    ...(order.tableName ? [columns('Table', order.tableName, width)] : []),
    ...(order.customerName ? [columns('Customer', order.customerName, width)] : []),
    ...(order.customerPhone ? [columns('Mobile', order.customerPhone, width)] : []),
    columns('Date', new Date(order.createdAt).toLocaleString('en-IN'), width),
    rule(width),
  ]
  items.forEach(item => {
    lines.push(`${item.quantity} x ${item.nameSnapshot}`)
    if (item.modifiers?.length) lines.push(`  + ${item.modifiers.join(', ')}`)
    if (item.note) lines.push(`  Note: ${item.note}`)
    lines.push(columns(`  ${money(item.unitPricePaise)} each`, money(item.totalPaise), width))
  })
  lines.push(
    rule(width),
    columns('Subtotal', money(order.subtotalPaise), width),
    ...(order.taxPaise > 0 ? [columns('GST', money(order.taxPaise), width)] : []),
    ...(order.discountPaise > 0 ? [columns('Discount', `-${money(order.discountPaise)}`, width)] : []),
    rule(width, '='),
    columns('TOTAL', money(order.totalPaise), width),
  )
  if (type === 'invoice') {
    lines.push(columns('Paid', money(order.paidPaise), width))
    payments.forEach(payment => lines.push(columns(payment.method.toUpperCase(), money(payment.amountPaise), width)))
  }
  lines.push(...upiPaymentLines(order, settings, receiptUpiAmountPaise(order, payments), width))
  lines.push(rule(width), center(settings.footerText, width))
  return lines.join('\n')
}

export function buildReceiptPrintParts(
  order: Order,
  items: OrderItem[],
  payments: Payment[],
  outlet: OutletPrintInfo,
  settings: ReceiptPrintInfo,
  type: 'invoice' | 'proforma',
  menuItems: MenuItem[] = [],
  categories: MenuCategory[] = [],
): ReceiptPrintPart[] {
  const width = widths[settings.receiptWidth]
  const sections = splitReceiptItems(items, menuItems, categories, settings.billMode)
  const preparedSections = sections.map((section) => {
    const printItems = printableReceiptItems(section.items, menuItems)
    return { ...section, printItems, totals: partTotals(printItems) }
  })
  const grandTotalPaise = preparedSections.reduce((sum, section) => sum + section.totals.netPaise, 0)
  return preparedSections.map((section, index) => {
    const partIndex = index + 1
    const partCount = sections.length
    const showPaymentDetails = settings.showPaymentDetailsOnBill !== false && type === 'invoice' && (partCount === 1 || partIndex === partCount)
    const netLabel = partCount > 1
      ? `Net ${section.title.replace(/\s*BILL$/i, '').replace(/[^a-z0-9 &/-]/gi, '').trim() || 'Part'} Amount`
      : 'Net Payable'
    const documentLabel = receiptDocumentLabel(type, section.section)
    const printItems = section.printItems
    const totals = section.totals
    const previousPartsNetPaise = partCount > 1 && partIndex === partCount ? Math.max(0, grandTotalPaise - totals.netPaise) : undefined
    const paymentAmountPaise = receiptUpiAmountPaise(order, payments)
    const lines = [
      center(settings.businessName || outlet.name, width),
      ...(outlet.address ? wrappedCentered(outlet.address, width) : []),
      ...(outlet.phone ? [center(`Ph: ${outlet.phone}`, width)] : []),
      ...(outlet.gstin && shouldShowGstin(settings, partIndex, partCount) ? [center(`GSTIN: ${outlet.gstin}`, width)] : []),
      ...(type === 'proforma'
        ? [center('PROFORMA / ESTIMATE', width)]
        : settings.headerText && settings.headerText.trim().toLowerCase() !== documentLabel.trim().toLowerCase()
          ? [center(settings.headerText, width)]
          : []),
      center(section.title, width),
      ...(settings.showTaxInvoiceLabel !== false ? [center(documentLabel, width)] : []),
      rule(width),
      columns('Bill', order.orderNo, width),
      ...(order.tableName ? [columns('Table', order.tableName, width)] : []),
      ...(order.customerName ? [columns('Customer', order.customerName, width)] : []),
      ...(order.customerPhone ? [columns('Mobile', order.customerPhone, width)] : []),
      columns('Date', new Date(order.createdAt).toLocaleString('en-IN'), width),
      rule(width),
      tableHeader(width),
      rule(width),
    ]

    printItems.forEach((item) => {
      lines.push(tableLine(item.nameSnapshot, item.quantity, item.unitPricePaise, item.totalPaise, width))
      if (item.modifiers?.length) lines.push(`  + ${item.modifiers.join(', ')}`.slice(0, width))
      if (item.note) lines.push(`  Note: ${item.note}`.slice(0, width))
    })

    lines.push(
      rule(width),
      columns('Subtotal', money(totals.subtotalPaise), width),
      ...(totals.discountPaise > 0 ? [columns('Discount', `-${money(totals.discountPaise)}`, width)] : []),
      ...(totals.taxPaise > 0 ? [columns('CGST', money(totals.cgstPaise), width), columns('SGST', money(totals.sgstPaise), width)] : []),
      rule(width, '='),
      ...(previousPartsNetPaise !== undefined ? [columns('Previous Bills Total', money(previousPartsNetPaise), width)] : []),
      columns(netLabel, money(totals.netPaise), width),
      ...(previousPartsNetPaise !== undefined ? [columns('Grand Total', money(grandTotalPaise), width)] : []),
    )
    const upiPaymentUrl = buildReceiptUpiPaymentUrl(order, settings, paymentAmountPaise)
    if (showPaymentDetails) lines.push(...paymentSummaryLines(order, payments, width))
    lines.push(...upiPaymentLines(order, settings, paymentAmountPaise, width))
    lines.push(rule(width))
    if (settings.showBillPartLabel !== false) lines.push(center(`BILL PART ${partIndex} OF ${partCount}`, width))
    lines.push(center(settings.footerText || 'Thank you. Please visit again.', width))

    return {
      section: section.section,
      title: section.title,
      partIndex,
      partCount,
      items: printItems,
      ...totals,
      previousPartsNetPaise,
      combinedNetPaise: previousPartsNetPaise !== undefined ? grandTotalPaise : undefined,
      upiAmountPaise: paymentAmountPaise,
      showPaymentDetails,
      showGstin: shouldShowGstin(settings, partIndex, partCount),
      documentLabel,
      upiPaymentUrl,
      text: lines.join('\n'),
    }
  })
}
