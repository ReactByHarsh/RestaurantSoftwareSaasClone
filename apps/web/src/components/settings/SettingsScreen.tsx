import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon, Save, Store, Printer, Bell, Wifi, Sparkles, Download, Upload, Cloud, ShieldCheck, ArrowUpCircle, Image as ImageIcon, Trash2, PanelRight } from 'lucide-react'
import QRCode from 'qrcode'
import { useUIStore } from '../../store/uiStore'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { useStaffStore } from '../../store/staffStore'
import { checkForAppUpdate, downloadAndInstallUpdate } from '../../lib/appUpdater'
import { runCloudLogin, saveCloudSnapshot, syncCloudStaff, type BillingSnapshot, type CloudSyncSettings } from '../../lib/cloudSync'
import { getLanServerStatus, isTauriDesktop, type LanServerStatus } from '../../lib/localDb'
import { getLanBridgeStatus, type LanBridgeStatus } from '../../lib/lanBridge'

type DisplayLanStatus = LanServerStatus | LanBridgeStatus

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()
  const { outlet, printSettings, cloudSync, appUpdate, updateOutlet, updateCloudSyncSettings, updateAppUpdateSettings, exportSnapshot, importSnapshot } = useBillingStore()
  const { showStaffLoginOnDesktop, setShowStaffLoginOnDesktop } = useAuthStore()
  const staff = useStaffStore((state) => state.staff)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const outletFormRef = useRef<HTMLFormElement>(null)
  const deviceAccessFormRef = useRef<HTMLFormElement>(null)
  const appUpdateFormRef = useRef<HTMLFormElement>(null)
  const cloudSyncFormRef = useRef<HTMLFormElement>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [logoPreview, setLogoPreview] = useState(outlet.logoDataUrl ?? '')
  const [lanStatus, setLanStatus] = useState<DisplayLanStatus | null>(null)
  const [lanQrDataUrl, setLanQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const status = isTauriDesktop() ? await getLanServerStatus() : await getLanBridgeStatus()
        if (!cancelled && status) setLanStatus(status)
      } catch {
        if (!cancelled) setLanStatus(null)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const url = lanStatus?.primaryUrl
    if (!url) {
      setLanQrDataUrl('')
      return
    }
    void QRCode.toDataURL(url, { margin: 1, width: 148 })
      .then(setLanQrDataUrl)
      .catch(() => setLanQrDataUrl(''))
  }, [lanStatus?.primaryUrl])

  const handleSave = (e: React.FormEvent, section: string) => {
    e.preventDefault()
    addToast('success', `${section} settings saved successfully`)
  }

  const saveOutletForm = (form: HTMLFormElement) => {
    const data = new FormData(form)
    updateOutlet({
      name: String(data.get('name') ?? ''),
      address: String(data.get('address') ?? ''),
      phone: String(data.get('phone') ?? ''),
      gstin: String(data.get('gstin') ?? ''),
      logoDataUrl: logoPreview,
    })
  }

  const saveDeviceAccessForm = (form: HTMLFormElement) => {
    const data = new FormData(form)
    setShowStaffLoginOnDesktop(data.get('showStaffLoginOnDesktop') === 'on')
  }

  const saveAppUpdateForm = (form: HTMLFormElement) => {
    const data = new FormData(form)
    updateAppUpdateSettings({
      autoCheck: data.get('autoCheck') === 'on',
      autoInstall: data.get('autoInstall') === 'on',
    })
  }

  const readCloudSettingsForm = (form: HTMLFormElement): CloudSyncSettings => {
    const data = new FormData(form)
    return {
      enabled: data.get('enabled') === 'on',
      serverUrl: String(data.get('serverUrl') ?? '').trim(),
      tenantId: String(data.get('tenantId') ?? '').trim(),
      outletId: String(data.get('outletId') ?? '').trim(),
      accountLogin: String(data.get('accountLogin') ?? '').trim(),
      accountSecret: String(data.get('accountSecret') ?? '').trim(),
      autoSyncDaily: data.get('autoSyncDaily') === 'on',
      syncHour24: Number(data.get('syncHour24') ?? 2),
      cloudMode: 'daily_snapshot',
      lastSyncedAt: cloudSync.lastSyncedAt,
      lastCloudUploadedAt: cloudSync.lastCloudUploadedAt,
      lastCloudDownloadedAt: cloudSync.lastCloudDownloadedAt,
    }
  }

  const saveCloudSyncForm = (form: HTMLFormElement) => {
    updateCloudSyncSettings(readCloudSettingsForm(form))
  }

  const handleSaveAllSettings = () => {
    if (outletFormRef.current) saveOutletForm(outletFormRef.current)
    if (deviceAccessFormRef.current) saveDeviceAccessForm(deviceAccessFormRef.current)
    if (appUpdateFormRef.current) saveAppUpdateForm(appUpdateFormRef.current)
    if (cloudSyncFormRef.current) saveCloudSyncForm(cloudSyncFormRef.current)
    addToast('success', 'All settings saved successfully')
  }

  const handleBackupDownload = () => {
    const payload = {
      app: 'BhojPatra Desk',
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshot: exportSnapshot(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `bhojpatra-backup-${date}.json`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addToast('success', 'Local backup exported successfully', 'Backup Export')
  }

  const isBillingSnapshot = (value: unknown): value is BillingSnapshot => {
    if (!value || typeof value !== 'object') return false
    const snapshot = value as Partial<BillingSnapshot>
    return Boolean(
      snapshot.outlet &&
      snapshot.printSettings &&
      Array.isArray(snapshot.menuCategories) &&
      Array.isArray(snapshot.menuItems) &&
      Array.isArray(snapshot.floors) &&
      Array.isArray(snapshot.tables) &&
      Array.isArray(snapshot.stations) &&
      Array.isArray(snapshot.inventoryItems) &&
      Array.isArray(snapshot.orders) &&
      Array.isArray(snapshot.orderItems) &&
      Array.isArray(snapshot.kots) &&
      Array.isArray(snapshot.payments) &&
      Array.isArray(snapshot.auditLogs)
    )
  }

  const handleBackupImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const snapshot = parsed && typeof parsed === 'object' && 'snapshot' in parsed
        ? (parsed as { snapshot?: unknown }).snapshot
        : parsed
      if (!isBillingSnapshot(snapshot)) {
        throw new Error('Invalid BhojPatra backup file')
      }
      importSnapshot(snapshot, false)
      addToast('success', 'Backup restored successfully', 'Backup Import')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not import backup', 'Backup Import')
    }
  }

  const handleOutletSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    saveOutletForm(e.currentTarget)
    addToast('success', 'Outlet settings saved successfully')
  }

  const handleLogoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast('warning', 'Select an image file for the restaurant logo')
      return
    }
    if (file.size > 700_000) {
      addToast('warning', 'Logo image should be below 700 KB')
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('Could not read logo image'))
        reader.readAsDataURL(file)
      })
      setLogoPreview(dataUrl)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not read logo image')
    }
  }

  const handleDeviceAccessSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const enabled = form.get('showStaffLoginOnDesktop') === 'on'
    setShowStaffLoginOnDesktop(enabled)
    addToast('success', enabled ? 'Desktop login screen enabled' : 'Desktop will open directly', 'Device Access')
  }

  const handleCloudSyncSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveCloudSyncForm(event.currentTarget)
    addToast('success', 'Cloud sync settings saved successfully', 'Cloud Sync')
  }

  const handleCloudSyncNow = async () => {
    if (cloudSyncFormRef.current) saveCloudSyncForm(cloudSyncFormRef.current)
    const formSettings = cloudSyncFormRef.current ? readCloudSettingsForm(cloudSyncFormRef.current) : cloudSync
    const snapshot = exportSnapshot()
    const serverUrl = formSettings.serverUrl.trim()
    let tenantId = formSettings.tenantId.trim()
    let outletId = formSettings.outletId.trim()
    if (!serverUrl) {
      addToast('warning', 'Enter cloud server URL and account login first', 'Cloud Sync')
      return
    }

    setCloudBusy(true)
    try {
      if (formSettings.accountLogin && formSettings.accountSecret) {
        const session = await runCloudLogin(serverUrl, formSettings.accountLogin, formSettings.accountSecret)
        tenantId = tenantId || session.user.tenantId
        outletId = outletId || session.outlets[0]?.id || `out_${session.user.tenantId}`
      }
      tenantId = tenantId || outlet.tenantId
      outletId = outletId || outlet.id
      const cloudAuth = { accountLogin: formSettings.accountLogin, accountSecret: formSettings.accountSecret }
      const syncedAt = new Date().toISOString()
      const effectiveCloud = { ...formSettings, enabled: true, tenantId, outletId, cloudMode: 'daily_snapshot' as const }
      await saveCloudSnapshot(outletId, tenantId, { ...snapshot, cloudSync: effectiveCloud }, 'desktop-manual', serverUrl, cloudAuth)
      await syncCloudStaff(staff, serverUrl, cloudAuth)
      updateCloudSyncSettings({ ...effectiveCloud, lastSyncedAt: syncedAt, lastCloudUploadedAt: syncedAt })
      addToast('success', 'Daily snapshot uploaded to cloud', 'Cloud Sync')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Cloud sync failed', 'Cloud Sync')
    } finally {
      setCloudBusy(false)
    }
  }

  const handleCloudConnect = async () => {
    if (!cloudSyncFormRef.current) return
    const formSettings = readCloudSettingsForm(cloudSyncFormRef.current)
    if (!formSettings.serverUrl || !formSettings.accountLogin || !formSettings.accountSecret) {
      addToast('warning', 'Enter cloud server URL, login, and password first', 'Cloud Sync')
      return
    }
    setCloudBusy(true)
    try {
      const session = await runCloudLogin(formSettings.serverUrl, formSettings.accountLogin, formSettings.accountSecret)
      const outletId = session.outlets[0]?.id || `out_${session.user.tenantId}`
      const tenantId = session.user.tenantId
      updateCloudSyncSettings({
        ...formSettings,
        enabled: true,
        tenantId,
        outletId,
        cloudMode: 'daily_snapshot',
      })
      updateOutlet(session.outlets[0] ? { ...session.outlets[0], enableDirtyTableStatus: outlet.enableDirtyTableStatus } : { tenantId, id: outletId })
      addToast('success', 'Cloud account connected. Use Sync Now to upload this desktop snapshot.', 'Cloud Sync')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Cloud account connection failed', 'Cloud Sync')
    } finally {
      setCloudBusy(false)
    }
  }

  const copyLanUrl = async () => {
    const url = lanStatus?.primaryUrl
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      addToast('success', 'LAN URL copied for Android setup', 'LAN Server')
    } catch {
      addToast('warning', url, 'LAN Server')
    }
  }

  const testLanServer = async () => {
    const urls = lanStatus?.urls?.filter((url) => !url.includes('127.0.0.1')) ?? []
    if (lanStatus?.primaryUrl && !urls.includes(lanStatus.primaryUrl)) urls.unshift(lanStatus.primaryUrl)
    if (urls.length === 0) return
    const errors: string[] = []
    for (const url of urls) {
      try {
        const response = await fetch(`${url}/api/v1/lan/hello`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        addToast('success', `LAN server reachable at ${url}`, 'LAN Server')
        return
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : 'failed'}`)
      }
    }
    addToast('error', errors[0] || 'LAN server test failed', 'LAN Server')
  }

  const handleAppUpdateSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveAppUpdateForm(event.currentTarget)
    addToast('success', 'App update settings saved', 'App Update')
  }

  const handleCheckForUpdates = async () => {
    setUpdateBusy(true)
    try {
      const result = await checkForAppUpdate()
      updateAppUpdateSettings({ lastCheckedAt: new Date().toISOString() })
      if (result.status === 'available') {
        updateAppUpdateSettings({ lastAvailableVersion: result.version })
        addToast('info', `Version ${result.version} is ready to install`, 'App Update')
      } else {
        addToast('success', 'You are already on the latest version', 'App Update')
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not check for updates', 'App Update')
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleInstallUpdate = async () => {
    setUpdateBusy(true)
    try {
      const installed = await downloadAndInstallUpdate()
      if (!installed) addToast('warning', 'No update is available to install', 'App Update')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not install update', 'App Update')
    } finally {
      setUpdateBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b-2 border-slate-100 px-4 py-3 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="text-slate-700">
            <SettingsIcon size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">Settings</h1>
            <p className="text-xs font-bold text-slate-500 mt-0.5">Configure outlet preferences</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <input ref={backupInputRef} type="file" accept="application/json,.json" onChange={handleBackupImport} className="hidden" />
          <button
            onClick={handleSaveAllSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-black rounded-lg hover:bg-primary-dark transition-all active:scale-95 shadow-sm"
          >
            <Save size={14} strokeWidth={2.5} /> SAVE SETTINGS
          </button>
          <button
            onClick={handleBackupDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-2 border-slate-200 text-slate-600 text-xs font-black rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-95 shadow-sm"
          >
            <Download size={14} strokeWidth={2.5} /> EXPORT BACKUP
          </button>
          <button
            onClick={() => backupInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 text-xs font-black rounded-lg hover:bg-emerald-100 transition-all active:scale-95 shadow-sm"
          >
            <Upload size={14} strokeWidth={2.5} /> IMPORT BACKUP
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:px-8">
        <div className="space-y-4 pb-8">

          {/* OUTLET INFO */}
          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Store size={18} className="text-primary" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">Outlet Information</h2>
            </div>
            <form ref={outletFormRef} onSubmit={handleOutletSave} className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div className="md:col-span-2 rounded-xl border-2 border-slate-100 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center">
                    <div className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-white p-2">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Restaurant logo preview" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-center text-slate-400">
                          <ImageIcon size={28} className="mx-auto" />
                          <p className="mt-1 text-[10px] font-black uppercase tracking-wider">No logo</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Restaurant Logo</label>
                      <p className="mb-2 text-[10px] font-bold leading-4 text-slate-500">Shown on the top-left of printed bills. Use a clean PNG/JPG below 700 KB.</p>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-primary-dark">
                          <Upload size={14} /> Choose Logo
                          <input type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                        </label>
                        {logoPreview && (
                          <button type="button" onClick={() => setLogoPreview('')} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-rose-100 bg-rose-50 px-4 py-2 text-xs font-black text-rose-600 hover:bg-rose-100">
                            <Trash2 size={14} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Outlet Name</label>
                  <input name="name" type="text" defaultValue={outlet.name} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Outlet Code</label>
                  <input type="text" defaultValue={outlet.code} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-500 focus:outline-none shadow-sm cursor-not-allowed" disabled />
                  <p className="text-[10px] font-bold text-slate-400 mt-1">Cannot be changed</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Address</label>
                  <textarea name="address" defaultValue={outlet.address} rows={2} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Phone Number</label>
                  <input name="phone" type="text" defaultValue={outlet.phone} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">GSTIN</label>
                  <input name="gstin" type="text" defaultValue={outlet.gstin} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="flex items-center gap-1.5 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all border-2 border-primary/50 active:scale-95">
                  <Save size={16} strokeWidth={2.5} /> SAVE CHANGES
                </button>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <PanelRight size={18} className="text-primary" strokeWidth={2.5} />
              <div><h2 className="text-sm font-black text-slate-800 tracking-tight">Order Workspace</h2><p className="text-[10px] font-bold text-slate-500">Optional order-page tools are off until enabled here.</p></div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { key: 'enableCreditAccounts' as const, title: 'Credit / Account payments', text: 'Ask for an existing or new customer before opening Sales Orders and allow pay-later accounts.', value: outlet.enableCreditAccounts },
                { key: 'enableOrderMenuPanelToggle' as const, title: 'Collapsible menu panel', text: 'Show a hide/expand control for the right-side product menu on the billing order workspace.', value: outlet.enableOrderMenuPanelToggle },
                { key: 'enableOrderTablesDrawer' as const, title: 'Tables drawer', text: 'Show a scrollable slide-out table list beside the order workspace.', value: outlet.enableOrderTablesDrawer },
              ].map(option => (
                <label key={option.key} className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-slate-100 bg-slate-50 p-3 hover:border-emerald-200 transition-colors">
                  <input type="checkbox" checked={option.value} onChange={event => updateOutlet({ [option.key]: event.target.checked })} className="peer sr-only" />
                  <span className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-colors ${option.value ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}><span className="h-4 w-4 rounded-full bg-white shadow-sm" /></span>
                  <span><p className="text-sm font-black text-slate-800">{option.title}</p><p className="mt-0.5 text-[10px] font-bold leading-4 text-slate-500">{option.text}</p></span>
                </label>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">Device Access</h2>
            </div>
            <form ref={deviceAccessFormRef} onSubmit={handleDeviceAccessSave} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <label className="flex flex-1 items-center gap-3 cursor-pointer rounded-xl border-2 border-slate-100 bg-slate-50 p-3">
                  <input name="showStaffLoginOnDesktop" type="checkbox" defaultChecked={showStaffLoginOnDesktop} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary shadow-sm" />
                  <div>
                    <p className="font-black text-slate-800 text-sm">Show staff login on this desktop</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Off by default. When off, this trusted counter device opens directly with the local admin context.</p>
                  </div>
                </label>
                <button type="submit" className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all border-2 border-primary/50 active:scale-95">
                  <Save size={15} strokeWidth={2.5} /> SAVE ACCESS
                </button>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Printer size={18} className="text-primary" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">Printer Center</h2>
            </div>
            <div className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-slate-800">Printer settings now live on a separate page.</p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                  Open Printer Center for 2-inch and 3-inch layout controls, heading size, font size, test print, and bill/KOT previews.
                </p>
                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-primary">
                  Current setup: {printSettings.receiptWidth} • {printSettings.headingSize} heading • {printSettings.fontSize} font
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app/printers')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-white shadow-lg shadow-primary/20 hover:bg-primary-dark"
              >
                <Printer size={15} strokeWidth={2.5} /> OPEN PRINTER CENTER
              </button>
            </div>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <ArrowUpCircle size={18} className="text-primary" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">App Updates</h2>
            </div>
            <form ref={appUpdateFormRef} onSubmit={handleAppUpdateSave} className="p-5 space-y-4">
              <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-sm font-black text-slate-800">Local data stays safe during updates.</p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-slate-600">
                  BhojPatra stores the desktop database in the Windows app-data folder, separate from the installed app files, so normal updater installs should not delete restaurant data.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
                  <input name="autoCheck" type="checkbox" defaultChecked={appUpdate.autoCheck} className="w-5 h-5 rounded text-primary" />
                  <div>
                    <p className="font-black text-slate-800 text-sm">Check on app startup</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Looks for a new signed version each time the desktop opens.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
                  <input name="autoInstall" type="checkbox" defaultChecked={appUpdate.autoInstall} className="w-5 h-5 rounded text-primary" />
                  <div>
                    <p className="font-black text-slate-800 text-sm">Auto-install when found</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Downloads the signed update and restarts the app automatically.</p>
                  </div>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-slate-500">
                  Last checked: {appUpdate.lastCheckedAt ? new Date(appUpdate.lastCheckedAt).toLocaleString('en-IN') : 'Never'}
                  {appUpdate.lastAvailableVersion ? ` | Last available version: ${appUpdate.lastAvailableVersion}` : ''}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCheckForUpdates} disabled={updateBusy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40">
                    {updateBusy ? 'CHECKING...' : 'CHECK NOW'}
                  </button>
                  <button type="button" onClick={handleInstallUpdate} disabled={updateBusy} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-40">
                    INSTALL UPDATE
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black shadow-sm">
                    SAVE UPDATE SETTINGS
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Cloud size={18} className="text-primary" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">Cloud Sync</h2>
            </div>
            <form ref={cloudSyncFormRef} onSubmit={handleCloudSyncSave} className="p-5 space-y-4">
              <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-white p-2 text-sky-600 shadow-sm">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">Cloud and LAN stay synchronized.</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-slate-600">
                      Products, tables, orders, KOTs, and staff accounts sync through the restaurant cloud account. BhojPatra Desk also keeps the same data available to phones over local Wi-Fi.
                    </p>
                  </div>
                </div>
              </div>

              {!isTauriDesktop() && (
                <div className={`rounded-2xl border-2 p-4 ${lanStatus?.running ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'}`}>
                  <p className="text-sm font-black text-slate-800">All-in-one Windows bridge {lanStatus?.running ? 'is connected' : 'is required for offline Wi-Fi'}</p>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-slate-600">
                    The bridge starts with Windows, keeps printer settings and restaurant data locally, and connects captain and kitchen phones through the restaurant router even when the internet is unavailable.
                  </p>
                  {!lanStatus?.running && (
                    <a href="/downloads/BhojPatra-Printer-Bridge-Setup.exe?v=3.1.2" className="mt-3 inline-flex rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black text-white">
                      DOWNLOAD / REPAIR BRIDGE
                    </a>
                  )}
                </div>
              )}

              {lanStatus && (
                <div className={`rounded-2xl border-2 p-4 ${lanStatus.running ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70'}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-white p-2 text-emerald-600 shadow-sm">
                      <Wifi size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-800">LAN server</p>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${lanStatus.running ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
                          {lanStatus.running ? 'Active' : 'Offline'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-slate-600">
                        Enter this URL in the Android app’s `Cloud or LAN server URL` field when the phone is on the same Wi-Fi.
                      </p>
                      <div className="mt-3 rounded-xl border border-white/80 bg-white/80 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Primary LAN URL</p>
                        <p className="mt-1 break-all font-mono text-sm font-black text-slate-800">{lanStatus.primaryUrl ?? `http://127.0.0.1:${lanStatus.port}`}</p>
                      </div>
                      {lanStatus.urls.filter(url => !url.includes('127.0.0.1')).length > 1 && (
                        <div className="mt-2 rounded-xl border border-white/80 bg-white/60 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Other detected LAN URLs</p>
                          <div className="mt-1 space-y-1">
                            {lanStatus.urls.filter(url => !url.includes('127.0.0.1') && url !== lanStatus.primaryUrl).map(url => (
                              <p key={url} className="break-all font-mono text-xs font-bold text-slate-700">{url}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={copyLanUrl} disabled={!lanStatus.primaryUrl} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">
                          COPY URL
                        </button>
                        <button type="button" onClick={testLanServer} disabled={!lanStatus.primaryUrl} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">
                          TEST SERVER
                        </button>
                      </div>
                      {lanStatus.lastError && (
                        <p className="mt-2 text-[11px] font-bold text-amber-700">Server note: {lanStatus.lastError}</p>
                      )}
                    </div>
                    {lanQrDataUrl && (
                      <div className="rounded-2xl border border-white/80 bg-white p-2 shadow-sm">
                        <img src={lanQrDataUrl} alt="LAN setup QR" className="h-36 w-36" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
                    <input name="enabled" type="checkbox" defaultChecked={cloudSync.enabled} className="w-5 h-5 rounded text-primary" />
                    <div>
                      <p className="font-black text-slate-800 text-sm">Enable cloud sync</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">Keep local desktop working offline and sync restaurant data to the cloud in the background.</p>
                    </div>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Cloud Server URL</label>
                  <input name="serverUrl" defaultValue={cloudSync.serverUrl} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Restaurant Tenant ID</label>
                  <input name="tenantId" defaultValue={cloudSync.tenantId || outlet.tenantId} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Outlet ID</label>
                  <input name="outletId" defaultValue={cloudSync.outletId || outlet.id} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Cloud Account Login</label>
                  <input name="accountLogin" defaultValue={cloudSync.accountLogin} placeholder="owner@restaurant.com" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Cloud Account Secret</label>
                  <input name="accountSecret" type="password" defaultValue={cloudSync.accountSecret} placeholder="App password or sync key" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Daily Sync Hour</label>
                  <select name="syncHour24" defaultValue={String(cloudSync.syncHour24)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50 w-full">
                    <input name="autoSyncDaily" type="checkbox" defaultChecked={cloudSync.autoSyncDaily} className="w-5 h-5 rounded text-primary" />
                    <div>
                      <p className="font-black text-slate-800 text-sm">Sync once per day</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">Runs one silent background sync after the selected hour.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-between">
                <p className="text-[11px] font-bold text-slate-500">
                  Last sync: {cloudSync.lastSyncedAt ? new Date(cloudSync.lastSyncedAt).toLocaleString('en-IN') : 'Not synced yet'}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCloudConnect} disabled={cloudBusy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40">
                    CONNECT ACCOUNT
                  </button>
                  <button type="button" onClick={handleCloudSyncNow} disabled={cloudBusy} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-black disabled:opacity-40">
                    {cloudBusy ? 'SYNCING...' : 'SYNC NOW'}
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black shadow-sm">
                    SAVE CLOUD SETTINGS
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2"><Sparkles size={18} className="text-primary" /><h2 className="text-sm font-black text-slate-800">Table Operations</h2></div>
            <div className="p-5">
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border-2 border-slate-100 bg-slate-50">
                <input type="checkbox" checked={outlet.enableDirtyTableStatus !== false} onChange={event => { updateOutlet({ enableDirtyTableStatus: event.target.checked }); addToast('success', event.target.checked ? 'Dirty-table cleaning step enabled' : 'Tables will be available immediately after payment') }} className="w-5 h-5 rounded text-primary" />
                <div><p className="font-black text-slate-800 text-sm">Dirty table / cleaning step</p><p className="text-[10px] font-bold text-slate-500 mt-0.5">Disable to skip “Dirty” and make a table available immediately after settlement.</p></div>
              </label>
            </div>
          </section>

          {/* NOTIFICATIONS */}
          <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Bell size={18} className="text-amber-500" strokeWidth={2.5} />
              <h2 className="text-sm font-black text-slate-800 tracking-tight">Notifications</h2>
            </div>
            <form onSubmit={e => handleSave(e, 'Notifications')} className="p-5">
              <div className="space-y-3 mb-5">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:border-slate-200 transition-colors">
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary shadow-sm" />
                  <div>
                    <p className="font-black text-slate-800 text-sm">Kitchen Sound Alerts</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Play a chime when new KOT arrives in Kitchen Display</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 bg-slate-50 hover:border-slate-200 transition-colors">
                  <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary shadow-sm" />
                  <div>
                    <p className="font-black text-slate-800 text-sm">Browser Notifications</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Show desktop notifications for new online orders</p>
                  </div>
                </label>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="flex items-center gap-1.5 px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-black hover:bg-slate-200 transition-all border-2 border-transparent active:scale-95">
                  <Save size={16} strokeWidth={2.5} /> SAVE SETTINGS
                </button>
              </div>
            </form>
          </section>

        </div>
      </div>
    </div>
  )
}
