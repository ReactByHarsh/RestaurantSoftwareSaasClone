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
import { fetchCloudSnapshot, getSnapshotDataScore, saveCloudSnapshot } from './lib/cloudSync'
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
    let hydrated = false
    let applyingRemote = false
    let saveTimer: number | undefined

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
            applyingRemote = true
            billing.importSnapshot(withActiveCloudCredentials(remote.payload), belongsToCurrentTenant)
            applyingRemote = false
          }
          applyingRemote = true
          billing.updateCloudSyncSettings({ lastSyncedAt: remote.updatedAt, lastCloudDownloadedAt: remote.updatedAt })
          applyingRemote = false
        }
      } catch {
        // Network error — keep using local data as fallback.
      } finally {
        hydrated = true
      }
    }

    refreshCloudData()

    realtimeClient.connect({
      serverUrl: cloud.serverUrl,
      outletId: cloud.outletId,
      accountLogin: cloud.accountLogin,
      accountSecret: cloud.accountSecret,
    })

    const unsubscribeRealtime = realtimeClient.subscribe((event) => {
      if (event.type !== 'STATE_UPDATED') return
      const payload = event.payload as any
      if (!payload || !Array.isArray(payload.orders) || !Array.isArray(payload.tables)) return
      applyingRemote = true
      useBillingStore.getState().importSnapshot(withActiveCloudCredentials(payload), true)
      useBillingStore.getState().updateCloudSyncSettings({
        lastSyncedAt: event.timestamp,
        lastCloudDownloadedAt: event.timestamp,
      })
      applyingRemote = false
    })

    const unsubscribeStore = useBillingStore.subscribe(() => {
      if (!hydrated || applyingRemote || cancelled) return
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(async () => {
        if (cancelled) return
        const current = useBillingStore.getState()
        const currentCloud = current.cloudSync
        if (!currentCloud.enabled || !currentCloud.accountLogin || !currentCloud.accountSecret) return
        try {
          const result = await saveCloudSnapshot(
            currentCloud.outletId,
            currentCloud.tenantId || current.outlet.tenantId,
            current.exportSnapshot(),
            realtimeClient.getClientId(),
            currentCloud.serverUrl,
            { accountLogin: currentCloud.accountLogin, accountSecret: currentCloud.accountSecret },
          )
          if (cancelled) return
          applyingRemote = true
          if (result.skipped && result.payload) {
            current.importSnapshot(withActiveCloudCredentials(result.payload), true)
          }
          current.updateCloudSyncSettings({ lastSyncedAt: result.updatedAt, lastCloudUploadedAt: result.updatedAt })
          applyingRemote = false
        } catch (error) {
          console.error('Web cloud autosave failed', error)
        }
      }, 750)
    })

    return () => {
      cancelled = true
      window.clearTimeout(saveTimer)
      unsubscribeStore()
      unsubscribeRealtime()
    }
  }, [user?.id])

  useEffect(() => {
    if (!user || user.tenantId === 'platform' || isTauriDesktop()) return

    let cancelled = false
    let hydrated = false
    let applyingLan = false
    let lastBridgeUpdatedAt = ''
    let syncTimer: number | undefined

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
      if (cancelled || applyingLan) return
      try {
        const result = await syncLanBridge(
          useBillingStore.getState().exportSnapshot(),
          useStaffStore.getState().staff,
        )
        if (!cancelled) lastBridgeUpdatedAt = result.updatedAt
      } catch {
        // The web app remains usable when the optional Windows bridge is absent.
      }
    }

    const schedulePush = () => {
      if (!hydrated || applyingLan || cancelled) return
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
        // Bridge may not be installed yet; retry through polling below.
      } finally {
        hydrated = true
        void pushCurrentState()
      }
    }

    const pollBridge = async () => {
      if (cancelled || applyingLan) return
      try {
        const remote = await getLanBridgeState()
        if (cancelled || !remote.updatedAt || remote.updatedAt === lastBridgeUpdatedAt) return
        applyBridgeState(remote)
      } catch {
        // LAN hosting automatically resumes when the bridge starts again.
      }
    }

    void hydrate()
    const unsubscribeBilling = useBillingStore.subscribe(schedulePush)
    const unsubscribeStaff = useStaffStore.subscribe(schedulePush)
    const pollTimer = window.setInterval(() => void pollBridge(), 1200)
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
