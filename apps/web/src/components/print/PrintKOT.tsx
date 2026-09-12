import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useBillingStore } from '../../store/billingStore'

export default function PrintKOT() {
  const { kotId } = useParams()
  const { kots, printSettings, outlet } = useBillingStore()
  const kot = kots.find((candidate) => candidate.id === kotId)

  useEffect(() => {
    const handleAfterPrint = () => window.close()
    window.addEventListener('afterprint', handleAfterPrint)
    const timer = window.setTimeout(() => window.print(), 350)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  if (!kot) {
    return <div className="p-6 text-sm">KOT not found.</div>
  }

  const totalItems = kot.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <main
      className="thermal-page"
      style={{ ['--receipt-width' as string]: printSettings.receiptWidth }}
      data-receipt-width={printSettings.receiptWidth}
      data-heading-size={printSettings.headingSize}
      data-font-size={printSettings.fontSize}
    >
      <button className="no-print print-button" onClick={() => window.print()}>Print KOT</button>
      <section className="thermal-slip kot-slip">
        <div className="thermal-center">
          <h1>KITCHEN ORDER TICKET</h1>
          <p>{outlet.name}</p>
          {printSettings.showKotToken && <div className="kot-token">{kot.kotNo}</div>}
        </div>
        <div className="thermal-rule" />
        <div className="thermal-row"><span>Order</span><strong>{kot.orderNo}</strong></div>
        <div className="thermal-row"><span>Type</span><strong>{kot.orderType.replace('_', ' ')}</strong></div>
        <div className="thermal-row"><span>Time</span><strong>{new Date(kot.createdAt).toLocaleString('en-IN')}</strong></div>
        {(kot.tableName || printSettings.showKotToken) && (
          <div className="kot-meta-grid">
            {kot.tableName && <div className="kot-meta-box"><span>Table</span><strong>{kot.tableName}</strong></div>}
            <div className="kot-meta-box"><span>Items</span><strong>{totalItems}</strong></div>
          </div>
        )}
        <div className="thermal-rule" />
        {kot.items.map((item) => (
          <div className="kot-item" key={item.id}>
            <div><strong>{item.quantity} x {item.name}</strong></div>
            {item.note && <div className="kot-note">Note: {item.note}</div>}
            {item.modifiers?.length ? <div className="kot-note">+ {item.modifiers.join(', ')}</div> : null}
          </div>
        ))}
        <div className="kot-total">TOTAL ITEMS: {totalItems}</div>
      </section>
    </main>
  )
}
