import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChefHat, DatabaseZap, MonitorSmartphone } from 'lucide-react'
import {
  createDailyLocalBackup,
  loadDesktopState,
  saveDesktopState,
  isTauriDesktop,
} from '../../lib/localDb'
import { checkForAppUpdate, downloadAndInstallUpdate } from '../../lib/appUpdater'
import {
  DAILY_CLOUD_SYNC_INTERVAL_MS,
  fetchCloudStaff,
  fetchCloudSnapshot,
  getDailyCloudSyncDueAt,
  hasSnapshotData,
  mergeOperationalSnapshot,
  runCloudLogin,
  saveCloudDailyBackup,
  saveCloudSnapshot,
  syncCloudStaff,
} from '../../lib/cloudSync'
import { getDeviceId, syncOrderDeltasNow } from '../../lib/orderSync'
import { realtimeClient } from '../../lib/realtime'
import { guardCloudSession } from '../../lib/cloudTransport'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { useStaffStore } from '../../store/staffStore'
import { useUIStore } from '../../store/uiStore'
import { planKotPrintJobs } from '../../lib/kotPrintRouting'
import { desktopKotPrintQueue } from '../../lib/kotPrintQueue'

const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000

export default function DesktopBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !isTauriDesktop())

  useEffect(() => {
    if (!isTauriDesktop()) return

    let disposed = false
    let saveTimer: number | undefined
    let hydrationComplete = false
    let cloudTimer: number | undefined
    let backupTimer: number | undefined
    let cloudSyncInFlight = false
    let cloudRetryAttempt = 0
    let saveInFlight: Promise<void> = Promise.resolve()
    let unsubscribeBilling: (() => void) | undefined
    let unsubscribeStaff: (() => void) | undefined
    let unlistenLanState: (() => void) | undefined
    let cloudScheduleKey = ''

    const saveNow = () => {
      if (!hydrationComplete || disposed) return Promise.resolve()
      const snapshot = useBillingStore.getState().exportSnapshot()
      const staff = useStaffStore.getState().staff
      // Serialize writes so a slower older invocation cannot finish after a
      // newer one and put stale table carts back into SQLite.
      saveInFlight = saveDesktopState(snapshot, staff)
      return saveInFlight
    }

    const queueSave = () => {
      if (!hydrationComplete || disposed) return
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        void saveNow().catch((error) => {
          console.error('Failed to save desktop state', error)
        })
      }, 50)
    }

    const flushSave = () => {
      window.clearTimeout(saveTimer)
      return saveNow().catch((error) => {
        console.error('Failed to flush desktop state', error)
      })
    }

    const runDailyBackup = async () => {
      if (!hydrationComplete || disposed) return
      await flushSave()
      // Refresh the date-stamped snapshot so bills recorded later today are
      // covered by the recovery copy, not just the database as it looked at
      // the first app launch that day.
      const result = await createDailyLocalBackup(true)
      if (result?.errors.length) {
        console.warn('Daily backup completed with inaccessible drive targets', result.errors)
      }
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

    const syncCloudSnapshotNow = async (reason: 'daily') => {
      if (cloudSyncInFlight) return
      if (!useAuthStore.getState().isAuthenticated) return
      const billing = useBillingStore.getState()
      const cloud = billing.cloudSync
      if (disposed || !cloud.enabled || !cloud.autoSyncEnabled || !cloud.serverUrl) return
      const isCurrent = guardCloudSession(cloud)
      cloudSyncInFlight = true
      let retryScheduled = false
      try {
        let tenantId = cloud.tenantId.trim()
        let outletId = cloud.outletId.trim()
        if (cloud.accountLogin && cloud.accountSecret) {
          const session = await runCloudLogin(cloud.serverUrl, cloud.accountLogin, cloud.accountSecret)
          if (disposed || !isCurrent()) return
          tenantId = session.user.tenantId
          outletId = session.outlets[0]?.id || `out_${session.user.tenantId}`
        }
        tenantId = tenantId || billing.outlet.tenantId
        outletId = outletId || billing.outlet.id
        const effectiveCloud = { ...cloud, tenantId, outletId }
        const cloudAuth = { accountLogin: cloud.accountLogin, accountSecret: cloud.accountSecret }
        const localSnapshot = billing.exportSnapshot()
        const result = await syncOrderDeltasNow(localSnapshot, effectiveCloud)
        if (disposed || !isCurrent()) return
        if (result.changed) useBillingStore.getState().importSnapshot(result.snapshot, true)
        if (result.skipped || result.conflicts || result.pending) throw new Error('Cloud sync is incomplete; pending changes or conflicts need attention')
        const signedInRole = useAuthStore.getState().user?.role
        const canUploadSetup = signedInRole === 'owner' || signedInRole === 'admin' || signedInRole === 'manager'
        let uploadedAt = cloud.lastCloudUploadedAt
        if (canUploadSetup) {
          const fullLocalSnapshot = useBillingStore.getState().exportSnapshot()
          const uploaded = await saveCloudSnapshot(
            outletId,
            tenantId,
            fullLocalSnapshot,
            await getDeviceId(),
            cloud.serverUrl,
            cloudAuth,
          )
          uploadedAt = uploaded.updatedAt
          await saveCloudDailyBackup(
            outletId,
            tenantId,
            fullLocalSnapshot,
            await getDeviceId(),
            cloud.serverUrl,
            cloudAuth,
          )
          if (uploaded.payload) {
            if (disposed || !isCurrent()) return
            const current = useBillingStore.getState().exportSnapshot()
            useBillingStore.getState().importSnapshot(mergeOperationalSnapshot(current, uploaded.payload), true)
          }
        }
        const remote = await fetchCloudSnapshot(outletId, cloud.serverUrl, cloudAuth)
        if (disposed || !isCurrent()) return
        if (remote.exists) {
          const remoteUpdatedAt = Date.parse(remote.updatedAt) || 0
          const lastDownloadedAt = Date.parse(cloud.lastCloudDownloadedAt || '') || 0
          if (remoteUpdatedAt > lastDownloadedAt) {
            const current = useBillingStore.getState().exportSnapshot()
            useBillingStore.getState().importSnapshot(mergeOperationalSnapshot(current, remote.payload), true)
          }
        }
        const cloudStaff = await fetchCloudStaff(cloud.serverUrl, cloudAuth)
        if (disposed || !isCurrent()) return
        useStaffStore.getState().replaceStaff([...cloudStaff.staff, ...useStaffStore.getState().staff])
        await syncCloudStaff(useStaffStore.getState().staff, cloud.serverUrl, cloudAuth)
        if (disposed || !isCurrent()) return
        const syncedAt = new Date().toISOString()
        useBillingStore.getState().updateCloudSyncSettings({
          tenantId,
          outletId,
          cloudMode: 'delta_v2',
          lastSyncedAt: syncedAt,
          lastSuccessfulSyncAt: syncedAt,
          lastCloudUploadedAt: uploadedAt || syncedAt,
          lastCloudDownloadedAt: syncedAt,
          syncIntervalHours: 24,
          nextSyncAt: new Date(Date.now() + DAILY_CLOUD_SYNC_INTERVAL_MS).toISOString(),
        })
        cloudRetryAttempt = 0
        if (reason === 'daily') useUIStore.getState().addToast('success', 'Cloud delta sync completed', 'Cloud Sync')
      } catch (error) {
        if (disposed || !isCurrent()) return
        console.error('Cloud sync failed', error)
        const retryMinutes = [1, 5, 15, 60]
        const delay = retryMinutes[Math.min(cloudRetryAttempt, retryMinutes.length - 1)]
        cloudRetryAttempt += 1
        window.clearTimeout(cloudTimer)
        cloudTimer = window.setTimeout(() => void syncCloudSnapshotNow(reason), delay * 60_000)
        retryScheduled = true
      } finally {
        cloudSyncInFlight = false
        if (!retryScheduled) scheduleCloudSync()
      }
    }

    const scheduleCloudSync = () => {
      window.clearTimeout(cloudTimer)
      const cloud = useBillingStore.getState().cloudSync
      cloudScheduleKey = JSON.stringify([
        cloud.enabled,
        cloud.autoSyncEnabled,
        cloud.accountLogin,
        cloud.accountSecret,
        cloud.lastSuccessfulSyncAt,
        cloud.nextSyncAt,
      ])
      if (disposed || !useAuthStore.getState().isAuthenticated || !cloud.enabled || !cloud.autoSyncEnabled) return

      const now = Date.now()
      let nextRun = getDailyCloudSyncDueAt(cloud, now)

      // Never perform a cloud restore as part of credential validation. A due
      // cycle gets a short post-login grace period while local SQLite remains
      // the source of truth during startup. A fresh installation therefore
      // performs its first daily sync once, rather than waiting another day.
      if (nextRun <= now) nextRun = now + 60_000
      const nextSyncAt = new Date(nextRun).toISOString()
      if (cloud.syncIntervalHours !== 24 || cloud.nextSyncAt !== nextSyncAt) {
        useBillingStore.getState().updateCloudSyncSettings({ syncIntervalHours: 24, nextSyncAt })
      }

      cloudTimer = window.setTimeout(
        () => void syncCloudSnapshotNow('daily'),
        Math.max(1000, nextRun - now)
      )
    }

    const hydrateRestaurantState = async () => {
      let loadedSuccessfully = false
      try {
        // The billing store also has an asynchronous browser/Dexie persist
        // layer. Let it finish first, otherwise it can complete after the
        // Tauri load and overwrite SQLite data with an older empty snapshot.
        const billingPersist = useBillingStore.persist
        if (!billingPersist.hasHydrated()) {
          await new Promise<void>((resolve) => {
            let unsubscribe: (() => void) | undefined
            const finish = () => {
              unsubscribe?.()
              resolve()
            }
            unsubscribe = billingPersist.onFinishHydration(finish)
            if (billingPersist.hasHydrated()) finish()
          })
        }
        const data = await loadDesktopState()
        if (disposed) return

        const browserSnapshot = useBillingStore.getState().exportSnapshot()
        if (data?.snapshot) {
          // A previous interrupted build may have left SQLite with an empty
          // or partial snapshot while the browser persist layer still has the
          // restaurant. Fill only missing collections from that local copy so
          // products/tables cannot be wiped during startup recovery.
          const diskSnapshot = data.snapshot
          const recoveredSnapshot = {
            ...diskSnapshot,
            menuCategories: diskSnapshot.menuCategories?.length ? diskSnapshot.menuCategories : browserSnapshot.menuCategories,
            menuItems: diskSnapshot.menuItems?.length ? diskSnapshot.menuItems : browserSnapshot.menuItems,
            floors: diskSnapshot.floors?.length ? diskSnapshot.floors : browserSnapshot.floors,
            tables: diskSnapshot.tables?.length ? diskSnapshot.tables : browserSnapshot.tables,
            stations: diskSnapshot.stations?.length ? diskSnapshot.stations : browserSnapshot.stations,
            inventoryItems: diskSnapshot.inventoryItems?.length ? diskSnapshot.inventoryItems : browserSnapshot.inventoryItems,
            purchaseEntries: diskSnapshot.purchaseEntries?.length ? diskSnapshot.purchaseEntries : browserSnapshot.purchaseEntries,
            orders: diskSnapshot.orders?.length ? diskSnapshot.orders : browserSnapshot.orders,
            orderItems: diskSnapshot.orderItems?.length ? diskSnapshot.orderItems : browserSnapshot.orderItems,
            kots: diskSnapshot.kots?.length ? diskSnapshot.kots : browserSnapshot.kots,
            payments: diskSnapshot.payments?.length ? diskSnapshot.payments : browserSnapshot.payments,
            auditLogs: diskSnapshot.auditLogs?.length ? diskSnapshot.auditLogs : browserSnapshot.auditLogs,
            savedCarts: { ...(browserSnapshot.savedCarts ?? {}), ...(diskSnapshot.savedCarts ?? {}) },
          }
          useBillingStore.getState().importSnapshot(recoveredSnapshot)
          if (!hasSnapshotData(diskSnapshot) && hasSnapshotData(browserSnapshot)) {
            await saveDesktopState(browserSnapshot, data.staff ?? [])
          }
        } else if (hasSnapshotData(browserSnapshot)) {
          await saveDesktopState(browserSnapshot, data?.staff ?? [])
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
        if (loadedSuccessfully) {
          await flushSave()
          void runDailyBackup().catch((error) => {
            console.error('Daily local backup failed', error)
          })
          backupTimer = window.setInterval(() => {
            void runDailyBackup().catch((error) => console.error('Daily local backup failed', error))
          }, BACKUP_CHECK_INTERVAL_MS)
        }
        if (isTauriDesktop()) void runAutoUpdate()
        scheduleCloudSync()
      }
    }

    const start = async () => {
      // Restore SQLite before rendering. Keep a remembered sign-in unless the
      // user explicitly logged out; license validation is handled separately
      // by DesktopLicenseGuard and cloud sync is independently opt-in.
      await hydrateRestaurantState()
      if (disposed) return
      const kotQueue = desktopKotPrintQueue(message => useUIStore.getState().addToast('error', message, 'Kitchen printer'))
      void kotQueue.flush(useBillingStore.getState().outlet.id).catch(error => {
        useUIStore.getState().addToast('error', String(error), 'Kitchen print queue')
      })

      const onStateChanged = () => {
        queueSave()
        const state = useBillingStore.getState().cloudSync
        const nextScheduleKey = JSON.stringify([
          state.enabled,
          state.autoSyncEnabled,
          state.accountLogin,
          state.accountSecret,
          state.lastSuccessfulSyncAt,
          state.nextSyncAt,
        ])
        if (nextScheduleKey !== cloudScheduleKey) scheduleCloudSync()
      }
      unsubscribeBilling = useBillingStore.subscribe(onStateChanged)
      unsubscribeStaff = useStaffStore.subscribe(onStateChanged)
      const unsubscribeAuth = useAuthStore.subscribe((state) => {
        if (!state.isAuthenticated) {
          window.clearTimeout(cloudTimer)
          realtimeClient.disconnect()
          return
        }
        scheduleCloudSync()
      })

      const { listen } = await import('@tauri-apps/api/event')
      unlistenLanState = await listen('lan_state_updated', (event) => {
        const payload = event.payload
        if (!payload || typeof payload !== 'object') return
        const snapshot = payload as Record<string, unknown>
        if (!Array.isArray(snapshot.orders) || !Array.isArray(snapshot.tables)) return
        // LAN writes are already committed to this desktop's SQLite. Keep local
        // unsent drafts, but never replace accepted captain items with an older
        // active-table session from the counter.
        const previousKotIds = new Set(useBillingStore.getState().kots.map(kot => kot.id))
        useBillingStore.getState().importSnapshot(snapshot as any, true, true)
        const billing = useBillingStore.getState()
        const receivedKots = billing.kots.filter(kot => kot.id.startsWith('captain_') && !previousKotIds.has(kot.id) && kot.status === 'new')
        if (receivedKots.length) {
          useUIStore.getState().addToast('success', `Captain sent ${receivedKots.length} KOT(s)`, 'Captain LAN')
          if (billing.printSettings.autoPrintCaptainKot !== false) {
            try {
              kotQueue.enqueue(billing.outlet.id, planKotPrintJobs(receivedKots, billing.stations, billing.printSettings, billing.outlet))
              void kotQueue.flush(billing.outlet.id).catch(error => useUIStore.getState().addToast('error', String(error), 'Kitchen print queue'))
            } catch (error) {
              useUIStore.getState().addToast('error', `Could not save KOT print queue: ${String(error)}`, 'Kitchen printer')
            }
          }
        }
      })
      const previousBillingUnsubscribe = unsubscribeBilling
      unsubscribeBilling = () => {
        previousBillingUnsubscribe?.()
        unsubscribeAuth()
      }

      if (disposed) return

      const flushOnPageExit = () => {
        void flushSave()
      }
      window.addEventListener('beforeunload', flushOnPageExit)
      window.addEventListener('pagehide', flushOnPageExit)
      setReady(true)
      scheduleCloudSync()

      const priorBillingCleanup = unsubscribeBilling
      const priorStaffCleanup = unsubscribeStaff
      unsubscribeBilling = () => {
        priorBillingCleanup?.()
        priorStaffCleanup?.()
        window.removeEventListener('beforeunload', flushOnPageExit)
        window.removeEventListener('pagehide', flushOnPageExit)
      }
      // The billing cleanup now owns both Zustand subscriptions and the
      // window listeners, so the outer cleanup must not invoke staff twice.
      unsubscribeStaff = undefined
    }

    void start()

    return () => {
      disposed = true
      hydrationComplete = false
      window.clearTimeout(saveTimer)
      window.clearTimeout(cloudTimer)
      window.clearInterval(backupTimer)
      unsubscribeBilling?.()
      unsubscribeStaff?.()
      unlistenLanState?.()
      realtimeClient.disconnect()
    }
  }, [])

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
