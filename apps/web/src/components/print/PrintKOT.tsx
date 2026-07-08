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

  return (
    <main className="thermal-page" style={{ ['--receipt-width' as string]: printSettings.receiptWidth }}>
      <button className="no-print print-button" onClick={() => window.print()}>Print KOT</button>
      <section className="thermal-slip kot-slip">
        <div className="thermal-center">
          <h1>KITCHEN ORDER</h1>
          <p>{outlet.name}</p>
          {printSettings.showKotToken && <h2>{kot.kotNo}</h2>}
        </div>
        <div className="thermal-rule" />
        <div className="thermal-row"><span>Order</span><strong>{kot.orderNo}</strong></div>
        {kot.tableName && <div className="thermal-row"><span>Table</span><strong>{kot.tableName}</strong></div>}
        <div className="thermal-row"><span>Type</span><strong>{kot.orderType.replace('_', ' ')}</strong></div>
        <div className="thermal-row"><span>Time</span><strong>{new Date(kot.createdAt).toLocaleTimeString('en-IN')}</strong></div>
        <div className="thermal-rule" />
        {kot.items.map((item) => (
          <div className="kot-item" key={item.id}>
            <div><strong>{item.quantity} x {item.name}</strong></div>
            {item.note && <div className="kot-note">Note: {item.note}</div>}
            {item.modifiers?.length ? <div className="kot-note">+ {item.modifiers.join(', ')}</div> : null}
          </div>
        ))}
      </section>
    </main>
  )
}
