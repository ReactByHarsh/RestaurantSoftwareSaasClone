import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { useBillingStore } from './billingStore'
import { useStaffStore } from './staffStore'

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
  } })
})
vi.mock('../lib/localDb', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/localDb')>(),
  isTauriDesktop: () => true,
}))

describe('native desktop offline login', () => {
  beforeEach(() => {
    localStorage.clear()
    useBillingStore.getState().reset()
    useAuthStore.getState().logout()
    useStaffStore.getState().replaceStaff([])
    useBillingStore.getState().updateCloudSyncSettings({ enabled: false, accountLogin: 'owner@example.test' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No network in offline mode')))
  })
  afterEach(() => vi.unstubAllGlobals())

  const addAccount = (status: 'active' | 'halted' | 'inactive' = 'active') => useStaffStore.getState().addStaff({
    name: 'Test Owner', email: 'owner@example.test', password: 'test-only',
    role: 'admin', status, tenantId: 'cloud-tenant-1',
  })

  it('signs in a previously connected cloud account using saved credentials without any fetch', async () => {
    addAccount()
    expect((await useAuthStore.getState().login('owner@example.test', 'test-only')).success).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useBillingStore.getState().cloudSync.enabled).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['halted', 'inactive'] as const)('rejects a %s account offline', async status => {
    addAccount(status)
    expect((await useAuthStore.getState().login('owner@example.test', 'test-only')).success).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a wrong cached password locally and allows an explicit Cloud Admin sign-in', async () => {
    addAccount()
    expect((await useAuthStore.getState().login('owner@example.test', 'wrong')).success).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect((await useAuthStore.getState().login('unknown@example.test', 'test-only')).success).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/v1/auth/login')
  })
})
