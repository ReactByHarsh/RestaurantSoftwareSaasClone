import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelCloudRequests, cloudFetch, guardCloudSession } from './cloudTransport'
import { fetchCloudSnapshot, fetchCloudStaff, saveCloudSnapshot, saveCloudDailyBackup, fetchCompleteCloudSnapshot, runCloudLogin, type CloudSyncSettings, type BillingSnapshot } from './cloudSync'
import { syncOrderDeltasNow } from './orderSync'

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
  } })
})

const settings: CloudSyncSettings = {
  enabled: true, serverUrl: 'https://example.test', tenantId: 'tenant-1', outletId: 'outlet-1',
  accountLogin: 'test-owner', accountSecret: 'test-only', autoSyncEnabled: true, syncIntervalHours: 24,
}
const savePreference = (enabled: boolean) => localStorage.setItem('bhojpatra-cloud-settings-v2', JSON.stringify({ ...settings, enabled }))

describe('offline cloud transport', () => {
  beforeEach(() => { localStorage.clear(); cancelCloudRequests() })
  afterEach(() => { cancelCloudRequests(); vi.unstubAllGlobals() })

  it('blocks snapshots, staff sync, backups and full restore even with explicit server arguments', async () => {
    savePreference(false)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const snapshot = { outlet: { id: settings.outletId }, printSettings: {},
      orders: [], orderItems: [], tables: [], kots: [], payments: [], savedCarts: {},
      menuItems: [], menuCategories: [], floors: [], stations: [], inventoryItems: [], auditLogs: [],
    } as unknown as BillingSnapshot
    const auth = { accountLogin: settings.accountLogin, accountSecret: settings.accountSecret }
    const results = await Promise.allSettled([
      fetchCloudSnapshot(settings.outletId, settings.serverUrl, auth),
      fetchCloudStaff(settings.serverUrl, auth),
      saveCloudSnapshot(settings.outletId, settings.tenantId, snapshot, 'device-1', settings.serverUrl, auth),
      saveCloudDailyBackup(settings.outletId, settings.tenantId, snapshot, 'device-1', settings.serverUrl, auth),
      fetchCompleteCloudSnapshot(settings.outletId, settings.serverUrl, auth),
    ])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect((await syncOrderDeltasNow(snapshot, settings)).skipped).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows an explicit account sign-in while restaurant data sync is disabled', async () => {
    savePreference(false)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'owner-1' }, outlets: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetch)
    const result = await runCloudLogin(settings.serverUrl, settings.accountLogin, settings.accountSecret)
    expect(result.user.id).toBe('owner-1')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toContain('/api/v1/auth/login')
  })

  it('fails closed when no local cloud-sync opt-in has been saved', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(cloudFetch('https://example.test/state')).rejects.toThrow('Cloud sync is disabled')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborts an in-flight request and discards its response even if fetch ignores abort', async () => {
    savePreference(true)
    let finish!: (response: Response) => void
    const fetch = vi.fn((_url: string, _options: RequestInit) => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const request = cloudFetch('https://example.test/state')
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    savePreference(false)
    cancelCloudRequests()
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
    finish(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    await rejection
  })

  it('cancels a delayed JSON body and keeps an old cycle invalid after re-enabling', async () => {
    savePreference(true)
    let finish!: (value: unknown) => void
    const response = new Response()
    response.json = () => new Promise(resolve => { finish = resolve })
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const isCurrent = guardCloudSession(settings)
    const received = await cloudFetch('https://example.test/state')
    const json = received.json()
    const rejection = expect(json).rejects.toMatchObject({ name: 'AbortError' })
    savePreference(false)
    cancelCloudRequests()
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    savePreference(true)
    expect(isCurrent()).toBe(false)
    finish({ staleSnapshot: true })
    await rejection
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"fresh":true}')))
    expect(await (await cloudFetch('https://example.test/state')).json()).toEqual({ fresh: true })
  })
})
