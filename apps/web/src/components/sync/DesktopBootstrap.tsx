import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChefHat, DatabaseZap, MonitorSmartphone } from 'lucide-react'
import {
  checkDesktopLicense,
  getDesktopLicenseStatus,
  loadDesktopState,
  saveDesktopState,
  isTauriDesktop,
  type LicenseStatus,
} from '../../lib/localDb'
import { checkForAppUpdate, downloadAndInstallUpdate } from '../../lib/appUpdater'
import { fetchCloudStaff, runCloudLogin, saveCloudSnapshot, syncCloudStaff } from '../../lib/cloudSync'
import { realtimeClient } from '../../lib/realtime'
import { useBillingStore } from '../../store/billingStore'
import { useStaffStore } from '../../store/staffStore'
import { useUIStore } from '../../store/uiStore'
import ActivationScreen from '../auth/ActivationScreen'

export default function DesktopBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !isTauriDesktop())
  const [licensed, setLicensed] = useState(() => !isTauriDesktop())
  const [checkingLicense, setCheckingLicense] = useState(() => isTauriDesktop())
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [licenseError, setLicenseError] = useState('')

  useEffect(() => {
    if (!isTauriDesktop()) return

    let disposed = false
    let saveTimer: number | undefined
    let hydrationComplete = false
    let cloudTimer: number | undefined
    let staffTimer: number | undefined
    let unsubscribeBilling: (() => void) | undefined
    let unsubscribeStaff: (() => void) | undefined
    let unlistenLanState: (() => void) | undefined

    const queueSave = () => {
      if (!hydrationComplete || disposed) return
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        void saveDesktopState(
          useBillingStore.getState().exportSnapshot(),
          useStaffStore.getState().staff
        ).catch((error) => {
          console.error('Failed to save desktop state', error)
        })
      }, 180)
    }

    const runAutoUpdate = async () => {
      const { appUpdate, updateAppUpdateSettings } = useBillingStore.getState()
      if (!appUpdate.autoCheck) return
      try {
        const result = await checkForAppUpdate()
        updateAppUpdateSettings({ lastCheckedAt: new Date().toISOString() })
        if (result.status === 'available') {
          updateAppUpdateSettings({ lastAvailableVersion: result.version })
          useUIStore.getState().addToast('info', `Version ${result.version} is available`, 'App Update')
          if (appUpdate.autoInstall) {
            useUIStore.getState().addToast('info', 'Downloading app update. The app will restart after install.', 'App Update')
            await downloadAndInstallUpdate()
          }
        }
      } catch (error) {
        console.error('App update check failed', error)
      }
    }

    const syncCloudSnapshotNow = async (reason: 'startup' | 'daily') => {
      const billing = useBillingStore.getState()
      const cloud = billing.cloudSync
      if (!cloud.enabled || !cloud.serverUrl) return
      try {
        let tenantId = cloud.tenantId.trim()
        let outletId = cloud.outletId.trim()
        if (cloud.accountLogin && cloud.accountSecret) {
          const session = await runCloudLogin(cloud.serverUrl, cloud.accountLogin, cloud.accountSecret)
          tenantId = tenantId || session.user.tenantId
          outletId = outletId || session.outlets[0]?.id || `out_${session.user.tenantId}`
        }
        tenantId = tenantId || billing.outlet.tenantId
        outletId = outletId || billing.outlet.id
        const effectiveCloud = { ...cloud, tenantId, outletId }
        const cloudAuth = { accountLogin: cloud.accountLogin, accountSecret: cloud.accountSecret }
        const localSnapshot = billing.exportSnapshot()
        await saveCloudSnapshot(outletId, tenantId, { ...localSnapshot, cloudSync: effectiveCloud }, `desktop-${reason}`, cloud.serverUrl, cloudAuth)
        const cloudStaff = await syncCloudStaff(useStaffStore.getState().staff, cloud.serverUrl, cloudAuth)
        useStaffStore.getState().replaceStaff([...cloudStaff.staff, ...useStaffStore.getState().staff])
        const syncedAt = new Date().toISOString()
        useBillingStore.getState().updateCloudSyncSettings({
          tenantId,
          outletId,
          cloudMode: 'daily_snapshot',
          lastSyncedAt: syncedAt,
          lastCloudUploadedAt: syncedAt,
        })
        if (reason === 'daily') useUIStore.getState().addToast('success', 'Daily cloud sync completed', 'Cloud Sync')
      } catch (error) {
        console.error('Cloud sync failed', error)
      }
    }

    const refreshCloudStaff = async () => {
      const cloud = useBillingStore.getState().cloudSync
      if (!cloud.enabled || !cloud.serverUrl || !cloud.accountLogin || !cloud.accountSecret) return
      try {
        const result = await fetchCloudStaff(cloud.serverUrl, {
          accountLogin: cloud.accountLogin,
          accountSecret: cloud.accountSecret,
        })
        if (disposed) return
        useStaffStore.getState().replaceStaff([...result.staff, ...useStaffStore.getState().staff])
        queueSave()
      } catch (error) {
        console.error('Cloud staff refresh failed', error)
      }
    }

    const scheduleCloudSync = () => {
      window.clearInterval(cloudTimer)
      cloudTimer = window.setInterval(() => {
        const cloud = useBillingStore.getState().cloudSync
        if (!cloud.enabled || !cloud.autoSyncDaily) return
        const now = new Date()
        const last = cloud.lastSyncedAt ? new Date(cloud.lastSyncedAt) : null
        const alreadyToday = last && last.toDateString() === now.toDateString()
        if (!alreadyToday && now.getHours() >= cloud.syncHour24) {
          void syncCloudSnapshotNow('daily')
        }
      }, 15 * 60 * 1000)
      window.clearInterval(staffTimer)
      staffTimer = window.setInterval(() => void refreshCloudStaff(), 60 * 1000)
    }

    const hydrateRestaurantState = async () => {
      let loadedSuccessfully = false
      try {
        const data = await loadDesktopState()
        if (disposed) return

        if (data?.snapshot) {
          useBillingStore.getState().importSnapshot(data.snapshot)
        }

        if (data?.staff?.length) {
          useStaffStore.getState().replaceStaff(data.staff)
        }
        loadedSuccessfully = true
      } catch (error) {
        console.error('Failed to load desktop state', error)
        useUIStore.getState().addToast('error', 'Local restaurant data could not be loaded. Automatic saving is paused to protect the existing database.', 'Data Protection')
      } finally {
        if (disposed) return
        hydrationComplete = loadedSuccessfully
        setReady(true)
        if (loadedSuccessfully) queueSave()
        scheduleCloudSync()
        void refreshCloudStaff()
        if (isTauriDesktop()) void runAutoUpdate()
        const cloud = useBillingStore.getState().cloudSync
        const last = cloud.lastSyncedAt ? new Date(cloud.lastSyncedAt) : null
        const now = new Date()
        const dueToday = !last || last.toDateString() !== now.toDateString()
        if (cloud.enabled && cloud.autoSyncDaily && dueToday && now.getHours() >= cloud.syncHour24) {
          void syncCloudSnapshotNow('startup')
        }
      }
    }

    const start = async () => {
      setCheckingLicense(true)
      setLicenseError('')
      try {
        const valid = await checkDesktopLicense()
        const status = await getDesktopLicenseStatus()
        if (disposed) return
        setLicenseStatus(status)
        setLicensed(valid)
        if (valid) {
          await hydrateRestaurantState()
          const onStateChanged = () => {
            queueSave()
          }
          unsubscribeBilling = useBillingStore.subscribe(onStateChanged)
          unsubscribeStaff = useStaffStore.subscribe(onStateChanged)
          const { listen } = await import('@tauri-apps/api/event')
          unlistenLanState = await listen('lan_state_updated', (event) => {
            const payload = event.payload
            if (!payload || typeof payload !== 'object') return
            const snapshot = payload as Record<string, unknown>
            if (!Array.isArray(snapshot.orders) || !Array.isArray(snapshot.tables)) return
            useBillingStore.getState().importSnapshot(snapshot as any, true)
          })
          const unsubscribeRealtime = realtimeClient.subscribe((event) => {
            if (event.type === 'STAFF_UPDATED') {
              void refreshCloudStaff()
              return
            }
            if (event.type !== 'STATE_UPDATED') return
            const payload = event.payload
            if (!payload || !Array.isArray((payload as any).orders) || !Array.isArray((payload as any).tables)) return
            useBillingStore.getState().importSnapshot(payload as any, true)
          })
          const previousBillingUnsubscribe = unsubscribeBilling
          unsubscribeBilling = () => {
            previousBillingUnsubscribe?.()
            unsubscribeRealtime()
          }
          const cloud = useBillingStore.getState().cloudSync
          if (cloud.enabled && cloud.serverUrl && cloud.outletId && cloud.accountLogin && cloud.accountSecret) {
            realtimeClient.connect({
              serverUrl: cloud.serverUrl,
              outletId: cloud.outletId,
              accountLogin: cloud.accountLogin,
              accountSecret: cloud.accountSecret,
              clientId: 'desktop-lan-host',
            })
          }
        } else {
          setReady(true)
        }
      } catch (error) {
        if (disposed) return
        setLicensed(false)
        setReady(true)
        setLicenseError(error instanceof Error ? error.message : 'License check failed')
      } finally {
        if (!disposed) setCheckingLicense(false)
      }
    }

    void start()

    return () => {
      disposed = true
      hydrationComplete = false
      window.clearTimeout(saveTimer)
      window.clearInterval(cloudTimer)
      window.clearInterval(staffTimer)
      unsubscribeBilling?.()
      unsubscribeStaff?.()
      unlistenLanState?.()
      realtimeClient.disconnect()
    }
  }, [])

  const unlockAfterActivation = async () => {
    setCheckingLicense(true)
    setLicenseError('')
    try {
      const valid = await checkDesktopLicense()
      const status = await getDesktopLicenseStatus()
      setLicenseStatus(status)
      setLicensed(valid)
      if (!valid) {
        setLicenseError('License is not active for this device')
        return
      }
      window.location.reload()
    } catch (error) {
      setLicenseError(error instanceof Error ? error.message : 'License check failed')
    } finally {
      setCheckingLicense(false)
    }
  }

  if (ready && !licensed) {
    return (
      <ActivationScreen
        status={licenseStatus}
        checking={checkingLicense}
        error={licenseError}
        onActivated={unlockAfterActivation}
      />
    )
  }

  if (ready) return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#1f2937_0%,#0f172a_42%,#020617_100%)] px-6 text-white">
      <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/40 backdrop-blur-2xl md:p-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.35em] text-amber-200">
              <ChefHat size={16} />
              BhojPatra Desk
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-white md:text-5xl">
              Preparing your local restaurant workspace
            </h1>
            <p className="mt-4 max-w-lg text-sm font-semibold leading-7 text-slate-200">
              Loading tables, menu, kitchen, reports, and staff data from the desktop database so the counter opens exactly where you left it.
            </p>
          </div>

          <div className="grid gap-3 text-sm font-bold text-slate-100">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
              <DatabaseZap size={18} className="text-emerald-300" />
              Local SQLite data
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
              <MonitorSmartphone size={18} className="text-sky-300" />
              Desktop POS shell
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
