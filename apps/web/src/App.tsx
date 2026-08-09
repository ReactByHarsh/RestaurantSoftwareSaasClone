import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginScreen from './components/auth/LoginScreen'
import FirstRunSetup from './components/auth/FirstRunSetup'
import AppShell from './components/shell/AppShell'
import BillingScreen from './components/billing/BillingScreen'
import TableScreen from './components/tables/TableScreen'
import CaptainScreen from './components/captain/CaptainScreen'
import KitchenScreen from './components/kitchen/KitchenScreen'
import OrdersScreen from './components/orders/OrdersScreen'
import MenuScreen from './components/menu/MenuScreen'
import InventoryScreen from './components/inventory/InventoryScreen'
import ReportsScreen from './components/reports/ReportsScreen'
import OwnerScreen from './components/owner/OwnerScreen'
import AdminScreen from './components/admin/AdminScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import PrinterSettingsScreen from './components/settings/PrinterSettingsScreen'
import PrintReceipt from './components/print/PrintReceipt'
import PrintKOT from './components/print/PrintKOT'
import { getDefaultRoute, hasPermission, type Permission } from './lib/permissions'
import ToastContainer from './components/shared/ToastContainer'
import { realtimeClient } from './lib/realtime'
import { useBillingStore } from './store/billingStore'
import { useStaffStore } from './store/staffStore'
import { isTauriDesktop } from './lib/localDb'
import { fetchCloudSnapshot, getSnapshotDataScore } from './lib/cloudSync'
import { syncOrderDeltasNow } from './lib/orderSync'
import { getLanBridgeState, syncLanBridge } from './lib/lanBridge'

function getNormalizedSnapshotIfNeeded(state: ReturnType<typeof useBillingStore.getState>) {
  const normalized = state.exportSnapshot()

  if (normalized.orders.length !== state.orders.length) return normalized
  if (normalized.orderItems.length !== state.orderItems.length) return normalized
  if (normalized.kots.length !== state.kots.length) return normalized
  if (normalized.payments.length !== state.payments.length) return normalized
  if (normalized.tables.length !== state.tables.length) return normalized

  const currentSavedCartKeys = Object.keys(state.savedCarts ?? {}).sort()
  const normalizedSavedCartKeys = Object.keys(normalized.savedCarts ?? {}).sort()
  if (currentSavedCartKeys.length !== normalizedSavedCartKeys.length) return normalized
  if (currentSavedCartKeys.some((key, index) => key !== normalizedSavedCartKeys[index])) return normalized

  const currentTablesById = new Map(state.tables.map((table) => [table.id, table]))
  for (const normalizedTable of normalized.tables) {
    const currentTable = currentTablesById.get(normalizedTable.id)
    if (!currentTable) return normalized
    if (currentTable.status !== normalizedTable.status) return normalized
    if (currentTable.activeOrderId !== normalizedTable.activeOrderId) return normalized
  }

  return null
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

function ProtectedRoute({ children, permission }: { children: React.ReactNode; permission?: Permission }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (permission && user && !hasPermission(user.role, permission)) {
    return <Navigate to={getDefaultRoute(user.role)} replace />
  }
  return <>{children}</>
}

export default function App() {
  const { user, autoLoginIfEnabled, showStaffLoginOnDesktop, logout } = useAuthStore()
  const staffCount = useStaffStore((state) => state.staff.length)
  const defaultRoute = user ? getDefaultRoute(user.role) : '/app/tables'

  useEffect(() => {
    autoLoginIfEnabled()
  }, [autoLoginIfEnabled])

  useEffect(() => {
    if (!user || user.tenantId === 'platform') return
    const currentTime = Date.now()
    const renewalEndsAt = parseDateBoundary(user.renewalDate, 'end')
    if (renewalEndsAt !== null && renewalEndsAt < currentTime) {
      logout()
      return
    }
    const accessEndsAt = parseDateBoundary(user.accessEndsAt, 'end')
    if (accessEndsAt !== null && accessEndsAt < currentTime) {
      logout()
    }
  }, [logout, user])

  useEffect(() => {
    let reconciling = false
    const initialState = useBillingStore.getState()
    const initialSnapshot = getNormalizedSnapshotIfNeeded(initialState)
    if (initialSnapshot) {
      reconciling = true
      initialState.importSnapshot(initialSnapshot, true)
      reconciling = false
    }

    return useBillingStore.subscribe((state) => {
      if (reconciling) return
      const normalized = getNormalizedSnapshotIfNeeded(state)
      if (!normalized) return
      reconciling = true
      state.importSnapshot(normalized, true)
      reconciling = false
    })
  }, [])

  useEffect(() => {
    if (!user || isTauriDesktop()) return
    const cloud = useBillingStore.getState().cloudSync
    if (!cloud.enabled || !cloud.serverUrl || !cloud.outletId || !cloud.accountLogin || !cloud.accountSecret) return
    if (user.tenantId === 'platform') return

    const auth = { accountLogin: cloud.accountLogin, accountSecret: cloud.accountSecret }
    let cancelled = false
    let cloudTimer: number | undefined
    let cloudSyncInFlight = false
    let retryAttempt = 0
    let scheduleConfigKey = ''

    const withActiveCloudCredentials = (payload: any) => ({
      ...payload,
      cloudSync: {
        ...(payload.cloudSync ?? {}),
        ...cloud,
        enabled: true,
        accountSecret: cloud.accountSecret,
      },
    })

    const refreshCloudData = async () => {
      try {
        // Full snapshots are reserved for first bootstrap/recovery.
        if (getSnapshotDataScore(useBillingStore.getState().exportSnapshot()) > 0) return
        const remote = await fetchCloudSnapshot(cloud.outletId, cloud.serverUrl, auth)
        if (cancelled) return
        if (remote.exists) {
          const billing = useBillingStore.getState()
          const localSnapshot = billing.exportSnapshot()
          const belongsToCurrentTenant = localSnapshot.outlet.tenantId === user.tenantId
          const localUploadedAt = Date.parse(cloud.lastCloudUploadedAt ?? '')
          const remoteUpdatedAt = Date.parse(remote.updatedAt)
          const remoteIsNewer = Number.isFinite(remoteUpdatedAt)
            && (!Number.isFinite(localUploadedAt) || remoteUpdatedAt > localUploadedAt)
          if (!belongsToCurrentTenant || getSnapshotDataScore(localSnapshot) === 0 || remoteIsNewer) {
            billing.importSnapshot(withActiveCloudCredentials(remote.payload), belongsToCurrentTenant)
          }
          billing.updateCloudSyncSettings({ lastSyncedAt: remote.updatedAt, lastCloudDownloadedAt: remote.updatedAt })
        }
      } catch {
        // Network error — keep using local data as fallback.
      } finally {
        void syncDailySnapshot()
        scheduleDailySync()
      }
    }

    const syncDailySnapshot = async () => {
      if (cancelled || cloudSyncInFlight) return
      const current = useBillingStore.getState()
      const currentCloud = current.cloudSync
      if (!currentCloud.enabled || !currentCloud.autoSyncEnabled || !currentCloud.accountLogin || !currentCloud.accountSecret) return
      cloudSyncInFlight = true
      try {
        const result = await syncOrderDeltasNow(current.exportSnapshot(), currentCloud)
        if (cancelled) return
        if (result.changed) current.importSnapshot(withActiveCloudCredentials(result.snapshot), true)
        const syncedAt = new Date().toISOString()
        current.updateCloudSyncSettings({
          cloudMode: 'delta_v2',
          lastSyncedAt: syncedAt,
          lastSuccessfulSyncAt: syncedAt,
          lastCloudUploadedAt: syncedAt,
          lastCloudDownloadedAt: syncedAt,
          nextSyncAt: new Date(Date.now() + Math.max(1, currentCloud.syncIntervalHours || 4) * 3_600_000).toISOString(),
        })
        retryAttempt = 0
      } catch (error) {
        console.error('Daily web cloud sync failed', error)
        const retryDelays = [60_000, 5 * 60_000, 15 * 60_000]
        if (!cancelled && retryAttempt < retryDelays.length) {
          const retryDelay = retryDelays[retryAttempt++]
          window.clearTimeout(cloudTimer)
          cloudTimer = window.setTimeout(() => void syncDailySnapshot(), retryDelay)
          return
        }
        const nextAttempt = new Date(Date.now() + 60 * 60_000)
        retryAttempt = 0
        window.clearTimeout(cloudTimer)
        cloudTimer = window.setTimeout(
          () => void syncDailySnapshot(),
          Math.max(60_000, nextAttempt.getTime() - Date.now()),
        )
        return
      } finally {
        cloudSyncInFlight = false
      }
      scheduleDailySync()
    }

    const scheduleDailySync = () => {
      window.clearTimeout(cloudTimer)
      if (cancelled) return
      const currentCloud = useBillingStore.getState().cloudSync
      scheduleConfigKey = JSON.stringify([
        currentCloud.enabled,
        currentCloud.autoSyncEnabled,
        currentCloud.syncIntervalHours,
        currentCloud.lastSuccessfulSyncAt,
      ])
      if (!currentCloud.enabled || !currentCloud.autoSyncEnabled) return
      const currentTime = new Date()
      const intervalMs = Math.max(1, currentCloud.syncIntervalHours || 4) * 3_600_000
      const lastSuccess = Date.parse(currentCloud.lastSuccessfulSyncAt || currentCloud.lastSyncedAt || '') || 0
      const nextRun = new Date(lastSuccess + intervalMs)
      if (nextRun.getTime() <= currentTime.getTime()) nextRun.setTime(currentTime.getTime() + 1_000)
      cloudTimer = window.setTimeout(
        () => void syncDailySnapshot(),
        Math.max(1000, nextRun.getTime() - currentTime.getTime()),
      )
    }

    realtimeClient.connect({
      serverUrl: cloud.serverUrl,
      outletId: cloud.outletId,
      accountLogin: cloud.accountLogin,
      accountSecret: cloud.accountSecret,
    })

    const unsubscribeRealtime = realtimeClient.subscribe((event) => {
      if (event.type === 'SYNC_DELTA_AVAILABLE') {
        void syncDailySnapshot()
        return
      }
      if (event.type !== 'STATE_UPDATED') return
      const payload = event.payload as any
      if (!payload || !Array.isArray(payload.orders) || !Array.isArray(payload.tables)) return
      useBillingStore.getState().importSnapshot(withActiveCloudCredentials(payload), true)
      useBillingStore.getState().updateCloudSyncSettings({
        lastSyncedAt: event.timestamp,
        lastCloudDownloadedAt: event.timestamp,
      })
    })

    const unsubscribeSchedule = useBillingStore.subscribe((state) => {
      const nextConfigKey = JSON.stringify([
        state.cloudSync.enabled,
        state.cloudSync.autoSyncEnabled,
        state.cloudSync.syncIntervalHours,
        state.cloudSync.lastSuccessfulSyncAt,
      ])
      if (nextConfigKey !== scheduleConfigKey) scheduleDailySync()
    })

    void refreshCloudData()
    const catchUp = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncDailySnapshot()
    }
    window.addEventListener('focus', catchUp)
    window.addEventListener('online', catchUp)
    document.addEventListener('visibilitychange', catchUp)

    return () => {
      cancelled = true
      window.clearTimeout(cloudTimer)
      unsubscribeSchedule()
      unsubscribeRealtime()
      window.removeEventListener('focus', catchUp)
      window.removeEventListener('online', catchUp)
      document.removeEventListener('visibilitychange', catchUp)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user || user.tenantId === 'platform' || isTauriDesktop()) return

    let cancelled = false
    let hydrated = false
    let applyingLan = false
    let lastBridgeUpdatedAt = ''
    let lastPushedFingerprint = ''
    let bridgeAvailable = false
    let syncTimer: number | undefined

    const fingerprint = (value: unknown) => {
      const serialized = JSON.stringify(value)
      let hash = 2166136261
      for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return `${serialized.length}:${hash >>> 0}`
    }

    const withActiveCloudCredentials = (payload: any) => {
      const activeCloud = useBillingStore.getState().cloudSync
      return {
        ...payload,
        cloudSync: {
          ...(payload.cloudSync ?? {}),
          ...activeCloud,
          accountSecret: activeCloud.accountSecret,
        },
      }
    }

    const tenantMatches = (tenantId?: string, outletId?: string) => {
      const billing = useBillingStore.getState()
      return tenantId === user.tenantId
        || tenantId === billing.outlet.tenantId
        || outletId === billing.outlet.id
    }

    const pushCurrentState = async () => {
      if (cancelled || applyingLan || !bridgeAvailable) return
      try {
        const snapshot = useBillingStore.getState().exportSnapshot()
        const staff = useStaffStore.getState().staff
        const nextFingerprint = fingerprint({ snapshot, staff })
        if (nextFingerprint === lastPushedFingerprint) return
        const result = await syncLanBridge(
          snapshot,
          staff,
        )
        if (!cancelled) {
          lastBridgeUpdatedAt = result.updatedAt
          lastPushedFingerprint = nextFingerprint
        }
      } catch {
        bridgeAvailable = false
      }
    }

    const schedulePush = () => {
      if (!hydrated || applyingLan || cancelled || !bridgeAvailable) return
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => void pushCurrentState(), 450)
    }

    const applyBridgeState = (remote: Awaited<ReturnType<typeof getLanBridgeState>>) => {
      if (!remote.exists || !remote.payload || !tenantMatches(remote.tenantId, remote.outletId)) return
      applyingLan = true
      useBillingStore.getState().importSnapshot(withActiveCloudCredentials(remote.payload), true)
      applyingLan = false
      lastBridgeUpdatedAt = remote.updatedAt
    }

    const hydrate = async () => {
      try {
        const remote = await getLanBridgeState()
        if (cancelled) return
        bridgeAvailable = true
        const billing = useBillingStore.getState()
        const cloud = billing.cloudSync
        const localReference = Math.max(
          Date.parse(cloud.lastSyncedAt ?? '') || 0,
          Date.parse(cloud.lastCloudDownloadedAt ?? '') || 0,
          Date.parse(cloud.lastCloudUploadedAt ?? '') || 0,
        )
        const bridgeTime = Date.parse(remote.updatedAt) || 0
        if (remote.payload && (getSnapshotDataScore(billing.exportSnapshot()) === 0 || bridgeTime > localReference)) {
          applyBridgeState(remote)
        } else {
          lastBridgeUpdatedAt = remote.updatedAt
        }
      } catch {
        bridgeAvailable = false
      } finally {
        hydrated = true
        void pushCurrentState()
      }
    }

    const pollBridge = async () => {
      if (cancelled || applyingLan) return
      try {
        const remote = await getLanBridgeState()
        bridgeAvailable = true
        if (cancelled) return
        if (remote.updatedAt && remote.updatedAt !== lastBridgeUpdatedAt) applyBridgeState(remote)
        void pushCurrentState()
      } catch {
        bridgeAvailable = false
      }
    }

    void hydrate()
    const unsubscribeBilling = useBillingStore.subscribe(schedulePush)
    const unsubscribeStaff = useStaffStore.subscribe(schedulePush)
    const pollTimer = window.setInterval(() => void pollBridge(), 30_000)
    const onFocus = () => void pollBridge()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearTimeout(syncTimer)
      window.clearInterval(pollTimer)
      window.removeEventListener('focus', onFocus)
      unsubscribeBilling()
      unsubscribeStaff()
    }
  }, [user?.id])

  if (isTauriDesktop() && staffCount === 0) {
    return (
      <>
        <FirstRunSetup />
        <ToastContainer />
      </>
    )
  }

  const fallbackRoute = user || (isTauriDesktop() && !showStaffLoginOnDesktop) ? '/app' : '/login'

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/print/receipt/:orderId" element={<PrintReceipt />} />
        <Route path="/print/kot/:kotId" element={<PrintKOT />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={defaultRoute} replace />} />
          <Route path="billing" element={<ProtectedRoute permission="billing:view"><BillingScreen /></ProtectedRoute>} />
          <Route path="owner" element={<ProtectedRoute permission="reports:view_today"><OwnerScreen /></ProtectedRoute>} />
          <Route path="tables" element={<ProtectedRoute permission="tables:view"><TableScreen /></ProtectedRoute>} />
          <Route path="captain" element={<ProtectedRoute permission="captain:view"><CaptainScreen /></ProtectedRoute>} />
          <Route path="kitchen" element={<ProtectedRoute permission="kitchen:view"><KitchenScreen /></ProtectedRoute>} />
          <Route path="orders" element={<ProtectedRoute permission="orders:view"><OrdersScreen /></ProtectedRoute>} />
          <Route path="menu" element={<ProtectedRoute permission="menu:view"><MenuScreen /></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute permission="inventory:view"><InventoryScreen /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute permission="reports:view_today"><ReportsScreen /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute permission="admin:manage_staff"><AdminScreen /></ProtectedRoute>} />
          <Route path="printers" element={<ProtectedRoute permission="settings:view"><PrinterSettingsScreen /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute permission="settings:view"><SettingsScreen /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to={fallbackRoute} replace />} />
      </Routes>
      <ToastContainer />
    </>
  )
}
