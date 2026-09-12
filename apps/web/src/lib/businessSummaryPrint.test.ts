import { describe, expect, it } from 'vitest'
import { buildBusinessSummaryPrintText, type BusinessSummaryPrintData } from './businessSummaryPrint'

const data: BusinessSummaryPrintData = {
  sales: { totalBills: 2, itemsSold: 5, netSalesAmount: 12500 },
  discount: { billsWithDiscount: 1, discountOnItems: 0, discountOnBills: 100, totalDiscount: 100 },
  categorySales: { Food: 12400 },
  subcategorySales: { Snacks: 12400 },
  kitchenSales: { Veg: 12400 },
  sectionSales: { 'Main Hall': 12500 },
  counterTypeSales: { Regular: 12500 },
  taxes: { totalCGST: 500, totalSGST: 500, totalVAT: 0, totalTax: 1000 },
  payments: { totalReceipts: 12500, totalExpenses: 0, paymentModeTotals: { cash: { amountPaise: 12500, count: 2 } } },
  cash: { inwardCash: 12500, outwardCash: 0, netCash: 12500 },
  alerts: { itemsCancelled: 0, amtCancelled: 0, itemsReturned: 0, amtReturned: 0, duplicatePrints: 0, duePayments: 0 },
  customer: { customerCount: 2, walletBalance: 0 },
}

describe('business summary thermal print formatter', () => {
  it('prints all report sections within the 3-inch character width', () => {
    const text = buildBusinessSummaryPrintText(data, '2026-08-01', '2026-08-18', {
      name: 'BhojPatra Bistro',
      businessName: 'BhojPatra Bistro',
      receiptWidth: '80mm',
      showGstin: false,
    })

    expect(text).toContain('BUSINESS SUMMARY')
    expect(text).toContain('Category wise sales')
    expect(text).toContain('Payment mode wise revenue')
    expect(text).toContain('END OF BUSINESS SUMMARY')
    expect(text.split('\n').every((line) => line.length <= 46)).toBe(true)
  })
})
