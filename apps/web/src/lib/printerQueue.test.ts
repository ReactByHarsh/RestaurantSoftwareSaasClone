import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPrintJob, type PrinterTransportSettings } from './printer'

const settings: PrinterTransportSettings = { connectionMode: 'bridge', printerName: 'tcp://kitchen.local:9100', strictTarget: true }
const job = (name: string) => ({ jobName: name, text: name })
beforeEach(() => vi.stubGlobal('window', { setTimeout, clearTimeout }))
afterEach(() => vi.unstubAllGlobals())

describe('Physical printer safety', () => {
  it('a kitchen DNS failure never falls back to a different installed printer', async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/health')
      ? new Response(JSON.stringify({ ok: true }))
      : new Response(JSON.stringify({ error: 'Could not resolve kitchen.local' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendPrintJob(settings, job('Kitchen KOT'))).rejects.toThrow('Could not resolve')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8181/health', 'http://127.0.0.1:8181/print'])
  })
  it('bill and KOT jobs to the same target never overlap', async () => {
    let finishFirst!: (response: Response) => void
    let startedFirst!: () => void
    const firstStarted = new Promise<void>(resolve => { startedFirst = resolve })
    const sent: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }))
      const name = JSON.parse(options.body as string).jobName
      sent.push(name)
      if (name === 'Bill') {
        startedFirst()
        return new Promise<Response>(resolve => { finishFirst = resolve })
      }
      return new Response('{}')
    }))
    const bill = sendPrintJob(settings, job('Bill'))
    const kot = sendPrintJob(settings, job('KOT'))
    await firstStarted
    expect(sent).toEqual(['Bill'])
    finishFirst(new Response('{}'))
    await Promise.all([bill, kot])
    expect(sent).toEqual(['Bill', 'KOT'])
  })
})
