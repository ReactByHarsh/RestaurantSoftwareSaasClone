import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Outlet } from '../lib/types'
import { fetchCloudSnapshot, fetchCloudStaff, runCloudLogin, syncCloudStaff } from '../lib/cloudSync'
import { isTauriDesktop } from '../lib/localDb'
import { useBillingStore } from './billingStore'
import { toPublicUser, useStaffStore, type StaffAccount } from './staffStore'

interface AuthStore {
  user: User | null
  outlet: Outlet | null
  isAuthenticated: boolean
  bypassStaffLogin: boolean
  showStaffLoginOnDesktop: boolean
  firstRunComplete: boolean
  login: (emailOrPhone: string, password: string) => Promise<{ success: boolean; error?: string }>
  autoLoginIfEnabled: () => boolean
  completeFirstRun: (account: StaffAccount) => void
  setBypassStaffLogin: (enabled: boolean) => void
  setShowStaffLoginOnDesktop: (enabled: boolean) => void
  logout: () => void
}

export const LOCAL_TENANT_ID = 'local_restaurant'

function isCloudAccount(account: StaffAccount) {
  return account.tenantId && account.tenantId !== LOCAL_TENANT_ID && account.tenantId !== 'platform'
}

async function verifyStoredCredential(stored: string | undefined, candidate: string) {
  const value = stored?.trim() ?? ''
  if (!value) return false
  if (!value.startsWith('sha256$')) return value === candidate
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate))
  const hex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return value === `sha256$${hex}`
}

function parseDateBoundary(value?: string, boundary: 'start' | 'end' = 'end') {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
  }
  return boundary === 'start'
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime()
    : new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime()
}

function getAccountAccessError(account: Pick<StaffAccount, 'accessStartsAt' | 'accessEndsAt' | 'renewalDate'>) {
  const currentTime = Date.now()
  const accessStartsAt = parseDateBoundary(account.accessStartsAt, 'start')
  if (accessStartsAt !== null && accessStartsAt > currentTime) {
    return 'This staff login is not active yet'
  }
  const renewalDate = parseDateBoundary(account.renewalDate, 'end')
  if (renewalDate !== null && renewalDate < currentTime) {
    return 'Renewal date has expired. Contact 9028414428 to renew access.'
  }
  const accessEndsAt = parseDateBoundary(account.accessEndsAt, 'end')
  if (accessEndsAt !== null && accessEndsAt < currentTime) {
    return 'This staff login duration has expired'
  }
  return null
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      outlet: null,
      isAuthenticated: false,
      bypassStaffLogin: false,
      showStaffLoginOnDesktop: false,
      firstRunComplete: false,

      login: async (emailOrPhone, password) => {
        // The installed desktop is a cloud-managed client. Its only valid
        // login source is the account created in Cloud Admin; local staff
        // records are retained for LAN/role data, not as desktop credentials.
        if (isTauriDesktop()) {
          const billing = useBillingStore.getState()
          const serverUrl = billing.cloudSync.serverUrl || 'https://bhojpatra-cloud.yash-v-shinde.workers.dev'
          try {
            const session = await runCloudLogin(serverUrl, emailOrPhone, password)
            if (session.user.tenantId === 'platform' || session.user.id === 'usr_super_admin') {
              return { success: false, error: 'This is a platform administrator account. Use the Cloud Admin panel to manage customers.' }
            }
            const outlet = session.outlets[0]
            if (!outlet) return { success: false, error: 'No outlet is assigned to this login' }

            // Desktop startup only validates the Workers credentials. Local
            // SQLite has already been hydrated by DesktopBootstrap; importing
            // a cloud snapshot here can replace open table carts during a
            // refresh. Cloud data is handled later by the four-hour sync.
            useBillingStore.getState().updateOutlet(outlet)

            useBillingStore.getState().updateCloudSyncSettings({
              enabled: true,
              serverUrl,
              tenantId: session.user.tenantId,
              outletId: outlet.id,
              accountLogin: emailOrPhone.trim(),
              accountSecret: password,
              autoSyncEnabled: true,
              syncIntervalHours: 4,
              cloudMode: 'delta_v2',
            })

            const cloudAccount: StaffAccount = {
              ...session.user,
              password,
              pin: session.user.pin || password,
              restaurantName: session.user.restaurantName || outlet.name,
            }
            useStaffStore.getState().replaceStaff([cloudAccount, ...useStaffStore.getState().staff])

            set({
              user: { ...session.user, lastLoginAt: new Date().toISOString() },
              outlet,
              isAuthenticated: true,
            })
            return { success: true }
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Cloud login failed' }
          }
        }

        const account = useStaffStore.getState().findByLogin(emailOrPhone)

        if (!account || isCloudAccount(account)) {
          const billing = useBillingStore.getState()
          const serverUrl = billing.cloudSync.serverUrl || 'https://bhojpatra-cloud.yash-v-shinde.workers.dev'
          try {
            const session = await runCloudLogin(serverUrl, emailOrPhone, password)
            if (session.user.tenantId === 'platform' || session.user.id === 'usr_super_admin') {
              return { success: false, error: 'This is a platform administrator account. Use the Cloud Admin panel to manage customers.' }
            }
            const outlet = session.outlets[0]
            if (!outlet) return { success: false, error: 'No outlet is assigned to this login' }

            const cloudAuth = { accountLogin: emailOrPhone, accountSecret: password }
            const remote = await fetchCloudSnapshot(outlet.id, serverUrl, cloudAuth)
            if (remote.exists) {
              useBillingStore.getState().importSnapshot(remote.payload)
            } else {
              useBillingStore.getState().reset()
              useBillingStore.getState().updateOutlet(outlet)
            }

            useBillingStore.getState().updateCloudSyncSettings({
              enabled: true,
              serverUrl,
              tenantId: session.user.tenantId,
              outletId: outlet.id,
              accountLogin: emailOrPhone,
              accountSecret: password,
              lastSyncedAt: new Date().toISOString(),
            })

            const cloudAccount: StaffAccount = {
              ...session.user,
              password,
              pin: session.user.pin || password,
              restaurantName: session.user.restaurantName || outlet.name,
            }
            const tenantStaff = [cloudAccount, ...useStaffStore.getState().staff]
              .filter((account) => account.tenantId === session.user.tenantId)
            try {
              const syncedStaff = await syncCloudStaff(tenantStaff, serverUrl, cloudAuth)
              useStaffStore.getState().replaceStaff([...syncedStaff.staff, ...tenantStaff])
            } catch (error) {
              console.error('Cloud staff reconciliation failed', error)
              useStaffStore.getState().replaceStaff(tenantStaff)
            }
            set({
              user: { ...session.user, lastLoginAt: new Date().toISOString() },
              outlet,
              isAuthenticated: true,
            })
            return { success: true }
          } catch (error) {
            if (account && isCloudAccount(account)) {
              const credentialChecks = await Promise.all([
                verifyStoredCredential(account.password, password),
                verifyStoredCredential(account.pin, password),
              ])
              const credentialsMatch = credentialChecks.some(Boolean)
              const accessError = getAccountAccessError(account)
              if (credentialsMatch && account.status === 'active' && !accessError) {
                set({
                  user: { ...toPublicUser(account), lastLoginAt: new Date().toISOString() },
                  outlet: useBillingStore.getState().outlet,
                  isAuthenticated: true,
                })
                return { success: true }
              }
              if (credentialsMatch && accessError) {
                return { success: false, error: accessError }
              }
            }
            return { success: false, error: error instanceof Error ? error.message : 'Staff account not found' }
          }
        }
        if (account.status === 'inactive') return { success: false, error: 'This staff login is deactivated' }
        if (account.status === 'halted') return { success: false, error: 'This staff login is halted by admin' }
        const accessError = getAccountAccessError(account)
        if (accessError) return { success: false, error: accessError }

        const credentialsMatch = (await verifyStoredCredential(account.password, password)) || (await verifyStoredCredential(account.pin, password))
        if (!credentialsMatch) {
          return { success: false, error: 'Invalid credentials' }
        }

        set({
          user: { ...toPublicUser(account), lastLoginAt: new Date().toISOString() },
          outlet: useBillingStore.getState().outlet,
          isAuthenticated: true,
        })

        return { success: true }
      },

      autoLoginIfEnabled: () => {
        const state = useAuthStore.getState()
        if (isTauriDesktop()) return false
        const shouldBypass = isTauriDesktop() ? !state.showStaffLoginOnDesktop : state.bypassStaffLogin
        if (!shouldBypass || state.isAuthenticated) return false
        const staff = useStaffStore.getState().staff
        const account = staff.find(candidate => candidate.status === 'active' && candidate.role === 'owner') ||
          staff.find(candidate => candidate.status === 'active' && candidate.role === 'admin') ||
          staff.find(candidate => candidate.status === 'active')
        if (!account) return false
        if (getAccountAccessError(account)) return false

        set({
          user: { ...toPublicUser(account), lastLoginAt: new Date().toISOString() },
          outlet: useBillingStore.getState().outlet,
          isAuthenticated: true,
        })
        return true
      },

      completeFirstRun: (account) => {
        set({
          user: { ...toPublicUser(account), lastLoginAt: new Date().toISOString() },
          outlet: useBillingStore.getState().outlet,
          isAuthenticated: true,
          firstRunComplete: true,
          showStaffLoginOnDesktop: false,
          bypassStaffLogin: true,
        })
      },

      setBypassStaffLogin: (enabled) => {
        set({ bypassStaffLogin: enabled })
        if (enabled) useAuthStore.getState().autoLoginIfEnabled()
      },

      setShowStaffLoginOnDesktop: (enabled) => {
        set({ showStaffLoginOnDesktop: enabled, bypassStaffLogin: !enabled })
        if (!enabled) useAuthStore.getState().autoLoginIfEnabled()
      },

      logout: () => {
        set({ user: null, outlet: null, isAuthenticated: false })
      },
    }),
    {
      name: 'bhojpatra-auth-v2',
      version: 4,
      partialize: (state) => ({
        user: state.user,
        outlet: state.outlet,
        isAuthenticated: state.isAuthenticated,
        bypassStaffLogin: state.bypassStaffLogin,
        showStaffLoginOnDesktop: state.showStaffLoginOnDesktop,
        firstRunComplete: state.firstRunComplete,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<AuthStore>
        if (state.user?.tenantId === 'platform' || state.user?.id === 'usr_super_admin') {
          return { user: null, outlet: null, isAuthenticated: false, bypassStaffLogin: false, showStaffLoginOnDesktop: false, firstRunComplete: false }
        }
        return {
          user: state.user ?? null,
          outlet: state.outlet ?? null,
          isAuthenticated: state.isAuthenticated ?? false,
          bypassStaffLogin: state.bypassStaffLogin ?? false,
          showStaffLoginOnDesktop: state.showStaffLoginOnDesktop ?? false,
          firstRunComplete: state.firstRunComplete ?? Boolean(state.user),
        }
      },
    }
  )
)
