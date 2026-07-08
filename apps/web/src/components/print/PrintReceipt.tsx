import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useBillingStore } from '../../store/billingStore'
import { buildReceiptPrintParts } from '../../lib/printTemplates'
import ReceiptPreview from './ReceiptPreview'

export default function PrintReceipt() {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const receiptType = searchParams.get('type') === 'proforma' ? 'proforma' : 'invoice'
  const requestedPart = searchParams.get('part')
  const { orders, orderItems, payments, outlet, printSettings, menuItems, menuCategories } = useBillingStore()
  const order = orders.find((candidate) => candidate.id === orderId)
  const items = useMemo(() => order ? orderItems.filter((item) => item.orderId === order.id && item.status !== 'cancelled') : [], [order, orderItems])
  const orderPayments = useMemo(() => order ? payments.filter((payment) => payment.orderId === order.id) : [], [order, payments])
  const parts = useMemo(() => order
    ? buildReceiptPrintParts(order, items, orderPayments, outlet, printSettings, receiptType, menuItems, menuCategories)
    : [], [order, items, orderPayments, outlet, printSettings, receiptType, menuItems, menuCategories])
  const visibleParts = requestedPart ? parts.filter((part) => part.section === requestedPart) : parts

  useEffect(() => {
    const handleAfterPrint = () => window.close()
    window.addEventListener('afterprint', handleAfterPrint)
    const timer = window.setTimeout(() => window.print(), 350)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  if (!order) {
    return <div className="p-6 text-sm">Receipt not found.</div>
  }

  return (
    <ReceiptPreview
      order={order}
      outlet={outlet}
      printSettings={printSettings}
      parts={visibleParts}
      orderPayments={orderPayments}
      receiptType={receiptType}
      showPrintButton
      onPrint={() => window.print()}
    />
  )
}
