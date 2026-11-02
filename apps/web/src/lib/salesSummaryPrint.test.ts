import { describe, expect, it } from 'vitest'
import { buildSalesSummaryPrintText, type SalesSummaryPrintRow } from './salesSummaryPrint'

const rows: SalesSummaryPrintRow[] = [
  { productName: 'Alu Palak', category: 'Veg Main Course', orderCount: 7, itemCount: 13, itemAmountPaise: 209300, itemDiscountPaise: 0, taxesPaise: 10465, itemNetPaise: 219765 },
  { productName: '100 Pipers Premium Reserve Nip', category: 'Scotch Whisky', orderCount: 2, itemCount: 4, itemAmountPaise: 344000, itemDiscountPaise: 0, taxesPaise: 0, itemNetPaise: 344000 },
]

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

describe('sales summary thermal print formatter', () => {
  it('prints the full product list within the 3-inch character width', () => {
    const text = buildSalesSummaryPrintText(rows, totals, '2026-10-01', '2026-10-24', 'product', {
      name: 'BhojPatra Bistro',
      businessName: 'BhojPatra Bistro',
      receiptWidth: '80mm',
      showGstin: false,
    })

    expect(text).toContain('PRODUCT WISE SALES')
    expect(text).toContain('Alu Palak')
    expect(text).toContain('NET AMOUNT')
    expect(text).toContain('END OF SALES SUMMARY')
    expect(text.split('\n').every((line) => line.length <= 46)).toBe(true)
  })

  it('keeps long product names inside the 58mm width', () => {
    const text = buildSalesSummaryPrintText(rows, totals, '2026-10-01', '2026-10-24', 'product', {
      name: 'BhojPatra Bistro',
      receiptWidth: '58mm',
    })

    expect(text).toContain('100 Pipers')
    expect(text.split('\n').every((line) => line.length <= 30)).toBe(true)
  })
})
