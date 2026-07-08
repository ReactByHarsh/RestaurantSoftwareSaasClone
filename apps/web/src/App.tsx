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

function ProtectedRoute({ children, permission }: { children: React.ReactNode; permission?: Permission }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (permission && user && !hasPermission(user.role, permission)) {
    return <Navigate to={getDefaultRoute(user.role)} replace />
  }
  return <>{children}</>
}

export default function App() {
  const { user, autoLoginIfEnabled, showStaffLoginOnDesktop } = useAuthStore()
  const staffCount = useStaffStore((state) => state.staff.length)
  const defaultRoute = user ? getDefaultRoute(user.role) : '/app/tables'

  useEffect(() => {
    autoLoginIfEnabled()
  }, [autoLoginIfEnabled])

  useEffect(() => {
    return realtimeClient.subscribe((event) => {
      if (event.type !== 'STATE_UPDATED') return
      const payload = event.payload
      if (!payload || !Array.isArray((payload as any).orders) || !Array.isArray((payload as any).tables)) return
      useBillingStore.getState().importSnapshot(payload as any, true)
    })
  }, [])

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
