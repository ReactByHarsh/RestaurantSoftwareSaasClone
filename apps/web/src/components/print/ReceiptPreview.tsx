import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { formatPaise } from '../../lib/money'
import type { Order, Outlet, Payment } from '../../lib/types'
import type { ReceiptPrintPart } from '../../lib/printTemplates'
import type { PrintSettings } from '../../store/billingStore'

interface Props {
  order: Order
  outlet: Pick<Outlet, 'name' | 'address' | 'phone' | 'gstin' | 'logoDataUrl'>
  printSettings: PrintSettings
  parts: ReceiptPrintPart[]
  orderPayments: Payment[]
  receiptType: 'invoice' | 'proforma'
  showPrintButton?: boolean
  onPrint?: () => void
  className?: string
}

export default function ReceiptPreview({
  order,
  outlet,
  printSettings,
  parts,
  orderPayments,
  receiptType,
  showPrintButton = false,
  onPrint,
  className = '',
}: Props) {
  const [upiQrByPart, setUpiQrByPart] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function buildQrCodes() {
      if (!printSettings.showUpiQrOnBill || !printSettings.upiId.trim()) {
        setUpiQrByPart({})
        return
      }

      const entries = await Promise.all(parts.map(async (part) => {
        if (!part.upiPaymentUrl) return [part.section, ''] as const
        const dataUrl = await QRCode.toDataURL(part.upiPaymentUrl, { margin: 1, width: 132, errorCorrectionLevel: 'M' })
        return [part.section, dataUrl] as const
      }))

      if (!cancelled) setUpiQrByPart(Object.fromEntries(entries))
    }

    void buildQrCodes()

    return () => {
      cancelled = true
    }
  }, [parts, printSettings.showUpiQrOnBill, printSettings.upiId])

  return (
    <main
      className={`thermal-page ${className}`.trim()}
      style={{ ['--receipt-width' as string]: printSettings.receiptWidth }}
      data-receipt-width={printSettings.receiptWidth}
      data-heading-size={printSettings.headingSize}
      data-font-size={printSettings.fontSize}
    >
      {showPrintButton && onPrint && (
        <button className="no-print print-button" onClick={onPrint}>
          Print {receiptType === 'proforma' ? 'Proforma' : 'Bill'}
        </button>
      )}

      {parts.map((part) => (
        <section className="thermal-slip" key={part.section}>
          <div className={outlet.logoDataUrl ? 'thermal-header thermal-header-with-logo' : 'thermal-header'}>
            {outlet.logoDataUrl && (
              <div className="thermal-logo-box">
                <img src={outlet.logoDataUrl} alt="Restaurant logo" />
              </div>
            )}
            <div className="thermal-header-details">
              <h1>{printSettings.businessName || outlet.name}</h1>
              {outlet.address && <p>{outlet.address}</p>}
              {outlet.phone && <p>Ph: {outlet.phone}</p>}
              {outlet.gstin && part.showGstin && <p>GSTIN: {outlet.gstin}</p>}
              {receiptType === 'proforma'
                ? <p>PROFORMA / ESTIMATE</p>
                : (printSettings.headerText && printSettings.headerText.trim().toLowerCase() !== part.documentLabel.trim().toLowerCase())
                  ? <p>{printSettings.headerText}</p>
                  : null}
              <p className="thermal-section-title">{part.title}</p>
              {printSettings.showTaxInvoiceLabel !== false && <p>{part.documentLabel}</p>}
            </div>
          </div>

          <div className="thermal-rule" />
          <div className="thermal-row"><span>Bill</span><strong>{order.orderNo}</strong></div>
          {order.tableName && <div className="thermal-row"><span>Table</span><strong>{order.tableName}</strong></div>}
          {order.customerName && <div className="thermal-row"><span>Customer</span><strong>{order.customerName}</strong></div>}
          {order.customerPhone && <div className="thermal-row"><span>Mobile</span><strong>{order.customerPhone}</strong></div>}
          <div className="thermal-row"><span>Date</span><strong>{new Date(order.createdAt).toLocaleString('en-IN')}</strong></div>
          <div className="thermal-rule" />

          <table className="thermal-table thermal-table-wide">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {part.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.nameSnapshot}
                    {item.modifiers?.length ? <small className="block">+ {item.modifiers.join(', ')}</small> : null}
                    {item.note ? <small className="block">Note: {item.note}</small> : null}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{formatPaise(item.unitPricePaise)}</td>
                  <td>{formatPaise(item.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="thermal-rule" />
          <div className="thermal-row"><span>Subtotal</span><strong>{formatPaise(part.subtotalPaise)}</strong></div>
          {part.discountPaise > 0 && <div className="thermal-row"><span>Discount</span><strong>-{formatPaise(part.discountPaise)}</strong></div>}
          {part.taxPaise > 0 && (
            <>
              <div className="thermal-row"><span>CGST</span><strong>{formatPaise(part.cgstPaise)}</strong></div>
              <div className="thermal-row"><span>SGST</span><strong>{formatPaise(part.sgstPaise)}</strong></div>
            </>
          )}
          {part.previousPartsNetPaise !== undefined && (
            <div className="thermal-row"><span>Previous Bills Total</span><strong>{formatPaise(part.previousPartsNetPaise)}</strong></div>
          )}
          <div className="thermal-row thermal-total">
            <span>{part.partCount > 1 ? `Net ${part.title.replace(/\s*BILL$/i, '')} Amount` : 'Net Payable'}</span>
            <strong>{formatPaise(part.netPaise)}</strong>
          </div>
          {part.combinedNetPaise !== undefined && (
            <div className="thermal-row thermal-total"><span>Grand Total</span><strong>{formatPaise(part.combinedNetPaise)}</strong></div>
          )}

          {printSettings.showUpiQrOnBill && printSettings.upiId.trim() && upiQrByPart[part.section] && (
            <>
              <div className="thermal-rule" />
              <div className="thermal-center thermal-upi">
                <p className="thermal-section-title">UPI PAYMENT</p>
                <img src={upiQrByPart[part.section]} alt="UPI payment QR" />
                {printSettings.showUpiIdOnBill === true && <p>{printSettings.upiId}</p>}
                <p>{formatPaise(part.combinedNetPaise ?? part.netPaise)}</p>
              </div>
            </>
          )}

          {part.showPaymentDetails && (
            <>
              <div className="thermal-rule" />
              <div className="thermal-center"><p className="thermal-section-title">Payment Details</p></div>
              <div className="thermal-row"><span>Paid Amount</span><strong>{formatPaise(Math.min(order.totalPaise, orderPayments.filter(payment => payment.status === 'success').reduce((sum, payment) => sum + payment.amountPaise, 0)))}</strong></div>
              <div className="thermal-row"><span>Cash</span><strong>{formatPaise(orderPayments.filter(payment => payment.status === 'success' && payment.method === 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0))}</strong></div>
              {orderPayments.filter(payment => payment.status === 'success' && payment.method !== 'cash').map((payment) => (
                <div className="thermal-row" key={payment.id}>
                  <span>{payment.method.toUpperCase()}</span>
                  <strong>{formatPaise(payment.amountPaise)}</strong>
                </div>
              ))}
              <div className="thermal-row"><span>Pending</span><strong>{formatPaise(Math.max(0, order.totalPaise - Math.min(order.totalPaise, orderPayments.filter(payment => payment.status === 'success').reduce((sum, payment) => sum + payment.amountPaise, 0))))}</strong></div>
            </>
          )}

          <div className="thermal-rule" />
          <div className="thermal-center">
            {printSettings.showBillPartLabel !== false && <p>BILL PART {part.partIndex} OF {part.partCount}</p>}
            <p>{printSettings.footerText || 'Thank you. Please visit again.'}</p>
          </div>
        </section>
      ))}
    </main>
  )
}
