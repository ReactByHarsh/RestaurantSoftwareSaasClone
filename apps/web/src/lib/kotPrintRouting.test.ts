import { describe, expect, it, vi } from 'vitest'
import { planKotPrintJobs } from './kotPrintRouting'
import { KotPrintQueue } from './kotPrintQueue'
import type { PrintSettings } from '../store/billingStore'
import type { KOT, Station } from './types'

const settings = { printerName: 'Bill USB', kotPrinterName: '192.168.1.50', connectionMode: 'native',
  kotPrintMode: 'single', receiptWidth: '80mm', showKotToken: true, openCashDrawer: true } as PrintSettings
const kot = (id: string, stationId: string, orderId = 'o1'): KOT => ({ id, stationId, orderId,
  kotNo: id, orderNo: orderId, orderType: 'dine_in', status: 'new', createdAt: '', createdByUserId: 'captain',
  items: [{ id: `${id}_item`, kotId: id, orderItemId: id, name: `Item ${id}`, quantity: 1, status: 'new', itemType: 'veg' }] })
const stations: Station[] = [{ id: 'food', outletId: 'out1', name: 'Kitchen', printerTarget: '192.168.1.51:9100' },
  { id: 'bar', outletId: 'out1', name: 'Bar', printerTarget: 'tcp://192.168.1.52:9100' }]
const outlet = { name: 'Test only' }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) } }
}
describe('KOT routing', () => {
  it('single mode preserves separate kitchen routes, bill printer is not used', () => {
    const jobs = planKotPrintJobs([kot('k1', 'food'), kot('k2', 'bar')], stations, settings, outlet)
    expect(jobs).toHaveLength(2)
    expect(jobs.map(j => j.settings.printerName)).toEqual(['tcp://192.168.1.51:9100', 'tcp://192.168.1.52:9100'])
    expect(jobs[0].job.text).toContain('Item k1')
    expect(jobs[0].job.text).not.toContain('Item k2')
    expect(jobs.every(j => !j.settings.openCashDrawer)).toBe(true)
  })
  it('same physical printer combines only tickets belonging to the same order', () => {
    const jobs = planKotPrintJobs([kot('k1', 'a'), kot('k2', 'b'), kot('k3', 'a', 'o2')], [], settings, outlet)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].kotIds).toEqual(['k1', 'k2'])
    expect(jobs[1].kotIds).toEqual(['k3'])
    expect(jobs[0].settings.printerName).toBe('tcp://192.168.1.50:9100')
  })
  it('blank KOT target uses shared receipt queue without changing receipt settings', () => {
    const shared = { ...settings, kotPrinterName: '', kotPrintMode: 'separate' as const }
    const jobs = planKotPrintJobs([kot('k1', 'a'), kot('k2', 'a')], [], shared, outlet)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].settings.printerName).toBe('Bill USB')
    expect(shared.openCashDrawer).toBe(true)
  })
})
describe('Durable KOT print queue', () => {
  it('preserves damaged saved queues and never prints from an unreadable queue', async () => {
    const disk = storage(), send = vi.fn(async () => 'direct' as const)
    disk.setItem('bhojpatra-kot-print-queue-v1', '{broken')
    const queue = new KotPrintQueue(disk, send)
    expect(queue.loadError).toBeTruthy()
    expect(() => queue.enqueue('out1', planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet))).toThrow()
    await expect(queue.flush('out1')).rejects.toThrow()
    expect(disk.getItem('bhojpatra-kot-print-queue-v1')).toBe('{broken')
    expect(send).not.toHaveBeenCalled()
  })
  it('LAN notifications and reloads never automatically print acknowledged tickets twice', async () => {
    const disk = storage(), send = vi.fn(async () => 'direct' as const)
    const jobs = planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet)
    const queue = new KotPrintQueue(disk, send)
    queue.enqueue('out1', jobs); await queue.flush('out1')
    queue.enqueue('out1', jobs); await queue.flush('out1')
    const restored = new KotPrintQueue(disk, send)
    restored.enqueue('out1', jobs); await restored.flush('out1')
    expect(send).toHaveBeenCalledTimes(1)
    expect(restored.list('out1')[0].status).toBe('sent')
  })
  it('a failed kitchen remains visible and retries only with explicit action', async () => {
    const disk = storage(), send = vi.fn().mockRejectedValueOnce(new Error('Printer offline')).mockResolvedValue('direct')
    const queue = new KotPrintQueue(disk, send)
    queue.enqueue('out1', planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet))
    await queue.flush('out1'); await queue.flush('out1')
    expect(send).toHaveBeenCalledTimes(1)
    expect(queue.list('out1')[0].status).toBe('failed')
    queue.retry('out1', queue.list('out1')[0].id); await queue.flush('out1')
    expect(send).toHaveBeenCalledTimes(2)
    expect(queue.list('out1')[0].status).toBe('sent')
  })
  it('restarts during I/O are uncertain, not automatically retried', async () => {
    const disk = storage()
    const send = vi.fn(() => new Promise<'direct'>(() => {}))
    const queue = new KotPrintQueue(disk, send)
    queue.enqueue('out1', planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet))
    void queue.flush('out1')
    await Promise.resolve()
    const restored = new KotPrintQueue(disk, send)
    await restored.flush('out1')
    expect(send).toHaveBeenCalledTimes(1)
    expect(restored.list('out1')[0].status).toBe('uncertain')
  })
  it('tickets arriving during a print are drained too', async () => {
    const disk = storage()
    let accept!: (value: 'direct') => void
    const send = vi.fn().mockImplementationOnce(() => new Promise<'direct'>(resolve => { accept = resolve })).mockResolvedValue('direct')
    const queue = new KotPrintQueue(disk, send)
    queue.enqueue('out1', planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet))
    const pending = queue.flush('out1')
    queue.enqueue('out1', planKotPrintJobs([kot('k2', 'food')], stations, settings, outlet))
    accept('direct'); await pending
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('cannot start printer I/O if the durable queue cannot be written', async () => {
    const send = vi.fn(async () => 'direct' as const)
    const queue = new KotPrintQueue({ getItem: () => null, setItem: () => { throw new Error('Disk unavailable') } }, send)
    expect(() => queue.enqueue('out1', planKotPrintJobs([kot('k1', 'food')], stations, settings, outlet))).toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
