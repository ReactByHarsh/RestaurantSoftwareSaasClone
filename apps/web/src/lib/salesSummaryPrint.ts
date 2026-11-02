export interface SalesSummaryPrintRow {
  productName: string
  category: string
  orderCount: number
  itemCount: number
  itemAmountPaise: number
  itemDiscountPaise: number
  taxesPaise: number
  itemNetPaise: number
}

export interface SalesSummaryPrintTotals {
  orderCount: number
  itemCount: number
  itemAmountPaise: number
  itemDiscountPaise: number
  taxesPaise: number
  itemNetPaise: number
}

export interface SalesSummaryPrintOutlet {
  name: string
  businessName?: string
  address?: string
  phone?: string
  gstin?: string
  showGstin?: boolean
  receiptWidth: '58mm' | '72mm' | '80mm'
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

function wrap(value: string, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= width) {
      line = candidate
      return
    }
    if (line) lines.push(line)
    let rest = word
    while (rest.length > width) {
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
    line = rest
  })
  if (line) lines.push(line)
  return lines
}

function wrappedCentered(value: string, width: number) {
  return wrap(value, width).map((line) => center(line, width))
}

function rule(width: number, character = '-') {
  return character.repeat(width)
}

export function buildSalesSummaryPrintText(
  rows: SalesSummaryPrintRow[],
  totals: SalesSummaryPrintTotals,
  fromDate: string,
  toDate: string,
  viewMode: 'product' | 'category',
  outlet: SalesSummaryPrintOutlet,
) {
  const width = widths[outlet.receiptWidth]
  const lines = [
    rule(width, '='),
    center(outlet.businessName || outlet.name, width),
    ...wrappedCentered(outlet.address ?? '', width),
    ...(outlet.phone ? [center(`Ph: ${outlet.phone}`, width)] : []),
    ...(outlet.gstin && outlet.showGstin ? [center(`GSTIN: ${outlet.gstin}`, width)] : []),
    center('SALES SUMMARY', width),
    columns('From', fromDate, width),
    columns('To', toDate, width),
    rule(width, '='),
    center(viewMode === 'category' ? '* CATEGORY WISE SALES *' : '* PRODUCT WISE SALES *', width),
    rule(width),
  ]

  if (rows.length === 0) {
    lines.push(center('No sales found for this range', width))
  } else {
    rows.forEach((row, index) => {
      const prefix = `${String(index + 1).padStart(2, ' ')}. `
      wrap(row.productName, Math.max(8, width - prefix.length)).forEach((line, lineIndex) => {
        lines.push(`${lineIndex === 0 ? prefix : ' '.repeat(prefix.length)}${line}`)
      })
      const meta = `${row.itemCount} qty | ${row.orderCount} ord`
      const indent = width >= 38 ? '    ' : '  '
      lines.push(columns(`${indent}${meta}`, money(row.itemNetPaise), width))
    })
  }

  lines.push(
    rule(width, '='),
    columns(viewMode === 'category' ? 'Categories' : 'Products', String(rows.length), width),
    columns('Orders', String(totals.orderCount), width),
    columns('Items', String(totals.itemCount), width),
    columns('Item amount', money(totals.itemAmountPaise), width),
    columns('Discount', money(totals.itemDiscountPaise), width),
    columns('Taxes', money(totals.taxesPaise), width),
    columns('NET AMOUNT', money(totals.itemNetPaise), width),
    rule(width, '='),
    center('END OF SALES SUMMARY', width),
    '',
  )

  return lines.join('\n')
}
