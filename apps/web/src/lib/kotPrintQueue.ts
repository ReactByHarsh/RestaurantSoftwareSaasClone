import { sendPrintJob, type PrintJob, type PrinterTransportSettings } from './printer'
import type { RoutedKotJob } from './kotPrintRouting'

export interface QueuedKotPrint extends RoutedKotJob {
  outletId: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain'; error?: string; createdAt: string
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type Sender = (settings: PrinterTransportSettings, job: PrintJob) => Promise<'direct' | 'dialog'>
const KEY = 'bhojpatra-kot-print-queue-v1'
export class KotPrintQueue {
  private records: QueuedKotPrint[] = []
  private running = false
  readonly loadError?: string
  constructor(private storage: StorageLike, private send: Sender, private onError: (message: string) => void = () => {}) {
    const raw = storage.getItem(KEY)
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('Invalid saved KOT print queue')
        this.records = parsed.filter((r): r is QueuedKotPrint => Boolean(r?.id && r?.job?.text && r?.settings))
          .map(r => r.status === 'sending' ? { ...r, status: 'uncertain', error: 'Desk restarted while printing. Check the kitchen before retrying.' } : r)
      } catch { this.loadError = 'Saved KOT print queue could not be read. It has been preserved; use manual kitchen printing and contact support.' }
    }
  }
  private persist() {
    if (this.loadError) throw new Error(this.loadError)
    // Retain recent sent receipts to suppress duplicate LAN notifications.
    const done = this.records.filter(r => r.status === 'sent').slice(-2000)
    this.records = [...done, ...this.records.filter(r => r.status !== 'sent')]
    this.storage.setItem(KEY, JSON.stringify(this.records))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bhojpatra-kot-print-queue'))
  }
  list(outletId: string) { return this.records.filter(r => r.outletId === outletId).map(r => ({ ...r })) }
  enqueue(outletId: string, jobs: RoutedKotJob[]) {
    for (const j of jobs) {
      // Deduplicate per KOT too, even if grouping settings changed after a send.
      const covered = new Set(this.records.filter(r => r.outletId === outletId).flatMap(r => r.kotIds))
      if (j.kotIds.some(id => covered.has(id))) continue
      this.records.push({ ...j, outletId, status: 'pending', createdAt: new Date().toISOString() })
    }
    this.persist() // Durable write must succeed BEFORE any printer I/O.
  }
  retry(outletId: string, id: string, settings?: PrinterTransportSettings) {
    const record = this.records.find(r => r.id === id && r.outletId === outletId)
    if (!record || !['failed', 'uncertain'].includes(record.status)) return
    if (settings) record.settings = { ...settings, openCashDrawer: false }
    record.status = 'pending'; record.error = undefined
    this.persist()
  }
  async flush(outletId: string) {
    if (this.loadError) throw new Error(this.loadError)
    if (this.running) return
    this.running = true
    try {
      let r: QueuedKotPrint | undefined
      while ((r = this.records.find(j => j.outletId === outletId && j.status === 'pending'))) {
        r.status = 'sending'; this.persist()
        try {
          if (!['native', 'bridge', 'webusb'].includes(r.settings.connectionMode) || !r.settings.printerName.trim()) {
            throw new Error('Choose a direct KOT printer in Printer Center. Automatic KOTs cannot use a dialog.')
          }
          const result = await this.send(r.settings, r.job)
          if (result !== 'direct') throw new Error('No direct printer acknowledgment received')
          r.status = 'sent'; r.error = undefined
        } catch (e) {
          r.status = 'failed'; r.error = e instanceof Error ? e.message : String(e)
          this.onError(`${r.job.jobName}: ${r.error}. Check Printer Center; check the kitchen before retrying.`)
        }
        this.persist()
      }
    } finally { this.running = false }
  }
}
let queue: KotPrintQueue | undefined
let notifyError: ((message: string) => void) | undefined
export function desktopKotPrintQueue(onError?: (message: string) => void) {
  if (onError) notifyError = onError
  queue ??= new KotPrintQueue(window.localStorage, sendPrintJob, message => notifyError?.(message))
  return queue
}
