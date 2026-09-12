import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Monitor,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Usb,
  Wifi,
} from 'lucide-react'
import ReceiptPreview from '../print/ReceiptPreview'
import { useUIStore } from '../../store/uiStore'
import { useBillingStore, type PrintSettings } from '../../store/billingStore'
import type { BridgePrinter, PrinterConnectionMode } from '../../lib/printer'
import {
  checkBridgeHealth,
  DEFAULT_BRIDGE_URL,
  discoverBridgePrinters,
  discoverNativePrinters,
  nativePrintSupported,
  normalizeNetworkPrinterAddress,
  normalizePrinterConnectionMode,
  requestUsbPrinter,
  resolveBridgeUrlInput,
  sendPrintJob,
  webUsbSupported,
} from '../../lib/printer'
import { buildKotPrintText, buildReceiptPrintParts } from '../../lib/printTemplates'
import type { KOT, MenuCategory, MenuItem, Order, OrderItem, Payment } from '../../lib/types'

const PREVIEW_CATEGORIES: MenuCategory[] = [
  {
    id: 'preview-food',
    outletId: 'preview-outlet',
    name: 'Food',
    billGroup: 'Food',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'preview-bar',
    outletId: 'preview-outlet',
    name: 'Bar',
    billGroup: 'Bar',
    separateBill: true,
    sortOrder: 2,
    isActive: true,
  },
]

const PREVIEW_MENU_ITEMS: MenuItem[] = [
  {
    id: 'preview-item-food',
    outletId: 'preview-outlet',
    categoryId: 'preview-food',
    name: 'Paneer Butter Masala',
    itemType: 'veg',
    pricePaise: 21900,
    taxPercent: 5,
    isAvailable: true,
    sortOrder: 1,
  },
  {
    id: 'preview-item-bar',
    outletId: 'preview-outlet',
    categoryId: 'preview-bar',
    name: 'Fresh Lime Soda',
    itemType: 'veg',
    pricePaise: 7000,
    taxPercent: 5,
    isAvailable: true,
    sortOrder: 2,
  },
]

function createPreviewDraft(source: PrintSettings): PrintSettings {
  return {
    ...source,
    connectionMode: normalizePrinterConnectionMode(source.connectionMode),
    headingSize: source.headingSize ?? 'standard',
    fontSize: source.fontSize ?? 'standard',
  }
}

function preparePrintSettings(settings: PrintSettings): { value: PrintSettings } | { error: string } {
  const connectionMode = normalizePrinterConnectionMode(settings.connectionMode)
  const trimmedPrinterName = settings.printerName.trim()
  const lanTarget = connectionMode === 'native'
    ? normalizeNetworkPrinterAddress(trimmedPrinterName)
    : normalizeNetworkPrinterAddress(settings.bridgeUrl)
  const bridgeUrl = lanTarget ? DEFAULT_BRIDGE_URL : resolveBridgeUrlInput(settings.bridgeUrl)
  const printerName = connectionMode === 'native' ? trimmedPrinterName : (lanTarget || trimmedPrinterName)

  if (connectionMode !== 'browser' && !printerName) {
    return { error: 'Select or enter a printer before saving.' }
  }

  return {
    value: {
      ...settings,
      connectionMode,
      printerName,
      bridgeUrl,
    },
  }
}

export default function PrinterSettingsScreen() {
  const { addToast } = useUIStore()
  const { outlet, printSettings, updatePrintSettings } = useBillingStore()
  const [draftSettings, setDraftSettings] = useState<PrintSettings>(() => createPreviewDraft(printSettings))
  const [detectedPrinters, setDetectedPrinters] = useState<BridgePrinter[]>([])
  const [printerBusy, setPrinterBusy] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle')
  const [bridgeVersion, setBridgeVersion] = useState('')

  useEffect(() => {
    setDraftSettings(createPreviewDraft(printSettings))
  }, [printSettings])

  useEffect(() => {
    if (draftSettings.connectionMode !== 'bridge') {
      setBridgeStatus('idle')
      return
    }

    let cancelled = false
    let consecutiveFailures = 0
    let hasConnected = false
    const refreshHealth = async () => {
      setBridgeStatus((current) => current === 'online' ? current : 'checking')
      try {
        const health = await checkBridgeHealth(draftSettings.bridgeUrl)
        if (cancelled) return
        setBridgeVersion(health.version ?? '')
        consecutiveFailures = 0
        hasConnected = true
        setBridgeStatus('online')
      } catch {
        consecutiveFailures += 1
        // A sleeping laptop, browser resume, or Windows spooler refresh can miss one
        // heartbeat. Keep a known-good bridge green unless three probes fail in a row.
        if (!cancelled && (!hasConnected || consecutiveFailures >= 3)) setBridgeStatus('offline')
      }
    }

    void refreshHealth()
    const timer = window.setInterval(() => void refreshHealth(), 30_000)
    const onFocus = () => void refreshHealth()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [draftSettings.bridgeUrl, draftSettings.connectionMode])

  const previewItems = useMemo<OrderItem[]>(() => ([
    {
      id: 'preview-order-item-1',
      orderId: 'preview-order',
      menuItemId: 'preview-item-food',
      nameSnapshot: 'Paneer Butter Masala',
      itemType: 'veg',
      quantity: 1,
      unitPricePaise: 21900,
      taxPercent: 5,
      taxType: 'GST',
      taxPaise: 1043,
      discountPaise: 0,
      totalPaise: 22943,
      status: 'served',
      note: 'Less spicy',
      createdAt: '2026-07-07T13:10:00.000Z',
    },
    {
      id: 'preview-order-item-2',
      orderId: 'preview-order',
      menuItemId: 'preview-item-bar',
      nameSnapshot: 'Fresh Lime Soda',
      itemType: 'veg',
      quantity: 2,
      unitPricePaise: 7000,
      taxPercent: 5,
      taxType: 'GST',
      taxPaise: 667,
      discountPaise: 0,
      totalPaise: 14667,
      status: 'served',
      createdAt: '2026-07-07T13:10:00.000Z',
    },
  ]), [])

  const previewOrder = useMemo<Order>(() => {
    const subtotalPaise = previewItems.reduce((sum, item) => sum + (item.unitPricePaise * item.quantity), 0)
    const taxPaise = previewItems.reduce((sum, item) => sum + item.taxPaise, 0)
    const discountPaise = previewItems.reduce((sum, item) => sum + item.discountPaise, 0)
    const totalPaise = previewItems.reduce((sum, item) => sum + item.totalPaise, 0)

    return {
      id: 'preview-order',
      outletId: outlet.id,
      orderNo: 'BP-1024',
      businessDate: '2026-07-07',
      type: 'dine_in',
      status: 'paid',
      tableId: 'preview-table',
      tableName: 'T4',
      customerName: 'Sample Guest',
      customerPhone: '9876543210',
      subtotalPaise,
      discountPaise,
      taxPaise,
      chargePaise: 0,
      totalPaise,
      paidPaise: totalPaise,
      paymentStatus: 'paid',
      createdAt: '2026-07-07T13:10:00.000Z',
      updatedAt: '2026-07-07T13:25:00.000Z',
    }
  }, [outlet.id, previewItems])

  const previewPayments = useMemo<Payment[]>(() => ([
    {
      id: 'preview-payment-1',
      orderId: 'preview-order',
      method: 'cash',
      amountPaise: 20000,
      status: 'success',
      collectedByUserId: 'preview-user',
      createdAt: '2026-07-07T13:20:00.000Z',
    },
    {
      id: 'preview-payment-2',
      orderId: 'preview-order',
      method: 'upi',
      amountPaise: Math.max(0, previewOrder.totalPaise - 20000),
      status: 'success',
      collectedByUserId: 'preview-user',
      createdAt: '2026-07-07T13:21:00.000Z',
    },
  ]), [previewOrder.totalPaise])

  const previewKot = useMemo<KOT>(() => ({
    id: 'preview-kot',
    orderId: 'preview-order',
    orderNo: previewOrder.orderNo,
    kotNo: 'KOT-88',
    tableName: previewOrder.tableName,
    orderType: previewOrder.type,
    status: 'new',
    createdByUserId: 'preview-user',
    createdAt: previewOrder.createdAt,
    items: previewItems.map((item, index) => ({
      id: `preview-kot-item-${index + 1}`,
      kotId: 'preview-kot',
      orderItemId: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      note: item.note,
      status: 'new',
      itemType: item.itemType,
    })),
  }), [previewItems, previewOrder.createdAt, previewOrder.orderNo, previewOrder.tableName, previewOrder.type])

  const previewParts = useMemo(() => buildReceiptPrintParts(
    previewOrder,
    previewItems,
    previewPayments,
    outlet,
    draftSettings,
    'invoice',
    PREVIEW_MENU_ITEMS,
    PREVIEW_CATEGORIES,
  ), [draftSettings, outlet, previewItems, previewOrder, previewPayments])

  const previewKotText = useMemo(() => buildKotPrintText(previewKot, outlet, draftSettings), [draftSettings, outlet, previewKot])

  const setDraftValue = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => {
    setDraftSettings((current) => ({ ...current, [key]: value }))
  }

  const selectConnectionMode = (mode: PrinterConnectionMode) => {
    const normalizedMode = normalizePrinterConnectionMode(mode)
    setDraftValue('connectionMode', normalizedMode)
    // Persist the transport choice immediately on this computer. This prevents
    // a cloud snapshot refresh or a browser reload from restoring legacy System mode.
    updatePrintSettings({
      connectionMode: normalizedMode,
      ...(normalizedMode === 'bridge' ? { bridgeUrl: resolveBridgeUrlInput(draftSettings.bridgeUrl) } : {}),
    })
  }

  const handleUsbConnect = async () => {
    setPrinterBusy(true)
    try {
      const printer = await requestUsbPrinter()
      setDraftSettings((current) => ({
        ...current,
        connectionMode: printer.directCompatible ? 'webusb' : 'browser',
        printerName: printer.name,
        usbVendorId: printer.vendorId,
        usbProductId: printer.productId,
        directKotPrint: Boolean(printer.directCompatible),
        directReceiptPrint: Boolean(printer.directCompatible),
        directProformaPrint: Boolean(printer.directCompatible),
      }))
      updatePrintSettings({
        connectionMode: printer.directCompatible ? 'webusb' : 'browser',
        printerName: printer.name,
        usbVendorId: printer.vendorId,
        usbProductId: printer.productId,
        directKotPrint: Boolean(printer.directCompatible),
        directReceiptPrint: Boolean(printer.directCompatible),
        directProformaPrint: Boolean(printer.directCompatible),
      })
      addToast(
        printer.directCompatible ? 'success' : 'warning',
        printer.directCompatible
          ? `${printer.name} connected for Chrome direct USB printing`
          : (printer.warning || `${printer.name} is installed through Windows. Use System Dialog or Desktop Built-in.`),
        'Printer Setup',
      )
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not connect the USB printer', 'Printer Setup')
    } finally {
      setPrinterBusy(false)
    }
  }

  const handleBridgeDiscover = async () => {
    setPrinterBusy(true)
    try {
      const lanTarget = normalizeNetworkPrinterAddress(draftSettings.bridgeUrl)
      const targetBridgeUrl = lanTarget ? DEFAULT_BRIDGE_URL : resolveBridgeUrlInput(draftSettings.bridgeUrl)
      const printers = await discoverBridgePrinters(targetBridgeUrl)
      const mergedPrinters = [
        ...(lanTarget ? [{ name: lanTarget, label: `${lanTarget} - LAN raw 9100`, portName: '9100', driverName: 'Network ESC/POS' }] : []),
        ...printers,
      ].filter((printer, index, all) => all.findIndex((candidate) => candidate.name === printer.name) === index)
      const selected = mergedPrinters.some((printer) => printer.name === draftSettings.printerName) ? draftSettings.printerName : (mergedPrinters[0]?.name ?? draftSettings.printerName)

      setDetectedPrinters(mergedPrinters)
      setBridgeStatus('online')
      setDraftSettings((current) => ({
        ...current,
        connectionMode: 'bridge',
        bridgeUrl: targetBridgeUrl,
        printerName: selected,
        directKotPrint: true,
        directReceiptPrint: true,
        directProformaPrint: true,
      }))
      addToast('success', mergedPrinters.length > 0 ? `${mergedPrinters.length} printer${mergedPrinters.length === 1 ? '' : 's'} detected` : 'Bridge checked. Enter a LAN printer manually if needed.', 'Printer Setup')
    } catch (error) {
      setBridgeStatus('offline')
      addToast('error', `${error instanceof Error ? error.message : 'Printer bridge unavailable'} Check the local bridge URL and CORS settings.`, 'Printer Setup')
    } finally {
      setPrinterBusy(false)
    }
  }

  const handleNativeDiscover = async () => {
    setPrinterBusy(true)
    try {
      const printers = await discoverNativePrinters()
      const selected = printers.some((printer) => printer.name === draftSettings.printerName) ? draftSettings.printerName : (printers[0]?.name ?? draftSettings.printerName)
      setDetectedPrinters(printers)
      setDraftSettings((current) => ({
        ...current,
        connectionMode: 'native',
        printerName: selected,
        directKotPrint: true,
        directReceiptPrint: true,
        directProformaPrint: true,
      }))
      addToast('success', printers.length > 0 ? `${printers.length} desktop printer${printers.length === 1 ? '' : 's'} detected` : 'No installed Windows printers were found', 'Printer Setup')
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Could not detect desktop printers', 'Printer Setup')
    } finally {
      setPrinterBusy(false)
    }
  }

  const handleSave = () => {
    const prepared = preparePrintSettings(draftSettings)
    if ('error' in prepared) {
      addToast('warning', prepared.error, 'Printer Setup')
      return
    }

    updatePrintSettings(prepared.value)
    setDraftSettings(prepared.value)
    addToast('success', 'Printer settings saved successfully', 'Printer Setup')
  }

  const handleTestPrint = async () => {
    const prepared = preparePrintSettings(draftSettings)
    if ('error' in prepared) {
      addToast('warning', prepared.error, 'Printer Setup')
      return
    }

    setPrinterBusy(true)
    try {
      const result = await sendPrintJob(prepared.value, {
        jobName: 'BhojPatra Printer Test',
        text: `BHOJPATRA PRINTER TEST\n${outlet.name}\n${new Date().toLocaleString('en-IN')}\n\nPrinter connection successful.\n`,
      })
      addToast('success', result === 'direct' ? 'Test page sent directly to the printer' : 'Test page opened in the system print dialog', 'Printer Setup')
    } catch (error) {
      if (prepared.value.connectionMode === 'webusb') {
        await sendPrintJob({ ...prepared.value, connectionMode: 'browser' }, {
          jobName: 'BhojPatra Printer Test',
          text: `BHOJPATRA PRINTER TEST\n${outlet.name}\n${new Date().toLocaleString('en-IN')}\n\nPrinter connection successful.\n`,
        })
        addToast('warning', `${error instanceof Error ? error.message : 'Direct USB failed'} Opened System Dialog instead.`, 'Printer Setup')
      } else {
        addToast('error', error instanceof Error ? error.message : 'Test print failed', 'Printer Setup')
      }
    } finally {
      setPrinterBusy(false)
    }
  }

  const selectedModeLabel = draftSettings.connectionMode === 'native'
    ? 'Desktop built-in direct print'
    : draftSettings.connectionMode === 'webusb'
      ? 'Chrome USB'
      : draftSettings.connectionMode === 'bridge'
        ? bridgeStatus === 'online' ? `Local bridge online${bridgeVersion ? ` · ${bridgeVersion}` : ''}` : 'Local bridge offline'
        : 'System print dialog'

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="bg-white border-b-2 border-slate-100 px-4 py-3 flex-shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm relative z-20">
        <div className="flex items-center gap-2.5">
          <div className="text-primary">
            <Printer size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">Printer Center</h1>
            <p className="text-xs font-bold text-slate-500 mt-0.5">All printer setup, print size controls, and live previews in one place</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={printerBusy || (draftSettings.connectionMode !== 'browser' && !draftSettings.printerName.trim())}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-40 flex items-center gap-1.5"
          >
            <Eye size={14} /> TEST PRINT
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={printerBusy}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            <Save size={14} /> SAVE PRINTER SETTINGS
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:px-8">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] gap-4 pb-8">
          <div className="space-y-4">
            <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Wifi size={18} className="text-primary" strokeWidth={2.5} />
                <h2 className="text-sm font-black text-slate-800 tracking-tight">Printer Connectivity</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-primary/15 bg-primary-50/50 p-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-primary">Active printer</p>
                    <p className="mt-1 text-sm font-black text-slate-800">{draftSettings.printerName || 'Not connected yet'}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white border border-primary/15 px-2 py-1 text-[10px] font-black text-slate-600">
                    <CheckCircle2 size={12} className={draftSettings.printerName ? 'text-emerald-500' : 'text-slate-300'} />
                    {selectedModeLabel}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    ...(nativePrintSupported() ? [{ mode: 'native' as const, icon: Printer, title: 'Desktop Built-in', detail: 'Recommended • no helper app' }] : []),
                    { mode: 'browser' as const, icon: Monitor, title: 'System', detail: 'Windows print dialog' },
                    { mode: 'webusb' as const, icon: Usb, title: 'Chrome USB', detail: 'Only WebUSB-compatible printers' },
                    ...(!nativePrintSupported() ? [{ mode: 'bridge' as const, icon: Server, title: 'BhojPatra Local Bridge', detail: 'For browser-only installations' }] : []),
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => selectConnectionMode(option.mode)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${draftSettings.connectionMode === option.mode ? 'border-primary bg-white shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                    >
                      <option.icon size={17} className={draftSettings.connectionMode === option.mode ? 'text-primary' : 'text-slate-400'} />
                      <p className="text-xs font-black text-slate-800 mt-1">{option.title}</p>
                      <p className="text-[9px] font-bold text-slate-400">{option.detail}</p>
                    </button>
                  ))}
                </div>

                {draftSettings.connectionMode === 'browser' && (
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <p className="text-xs font-black text-slate-700">System printer dialog</p>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">Best when you want the HTML receipt preview and full browser print formatting. Heading size and font size apply here directly.</p>
                  </div>
                )}

                {draftSettings.connectionMode === 'native' && (
                  <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
                    <div>
                      <p className="text-xs font-black text-slate-700">BhojPatra desktop built-in printing</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">Prints directly from BhojPatra through the Windows spooler—no PowerShell process or separate bridge. Use any installed USB, Bluetooth, or network printer, or enter a LAN target like `tcp://192.168.1.50:9100`.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      {detectedPrinters.length > 0 ? (
                        <select value={draftSettings.printerName} onChange={(event) => setDraftValue('printerName', event.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                          {detectedPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.label}</option>)}
                        </select>
                      ) : (
                        <input value={draftSettings.printerName} onChange={(event) => setDraftValue('printerName', event.target.value)} placeholder="Installed printer name or tcp://192.168.1.50:9100" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                      )}
                      <button type="button" onClick={handleNativeDiscover} disabled={printerBusy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5">
                        <RefreshCw size={14} className={printerBusy ? 'animate-spin' : ''} /> DETECT PRINTERS
                      </button>
                    </div>
                  </div>
                )}

                {draftSettings.connectionMode === 'webusb' && (
                  <div className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-black text-slate-700">Chrome WebUSB printer</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">Use only when Chrome can claim the printer directly. If the printer already appears in Windows, use Desktop Built-in or System.</p>
                    </div>
                    <button type="button" onClick={handleUsbConnect} disabled={printerBusy || !webUsbSupported()} className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5">
                      <Usb size={15} /> {printerBusy ? 'CONNECTING...' : 'CONNECT USB'}
                    </button>
                  </div>
                )}

                {draftSettings.connectionMode === 'bridge' && (
                  <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-700">BhojPatra local printer bridge</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">Runs automatically with Windows and supports installed USB, Bluetooth, and LAN printers.</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${bridgeStatus === 'online' ? 'bg-emerald-50 text-emerald-700' : bridgeStatus === 'checking' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                        <CheckCircle2 size={12} />
                        {bridgeStatus === 'online' ? `ONLINE${bridgeVersion ? ` · ${bridgeVersion}` : ''}` : bridgeStatus === 'checking' ? 'CHECKING' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      <input value={draftSettings.bridgeUrl} onChange={(event) => setDraftValue('bridgeUrl', event.target.value)} placeholder="Bridge URL or LAN printer IP/link" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-xs font-bold outline-none focus:border-primary/50" />
                      <button type="button" onClick={handleBridgeDiscover} disabled={printerBusy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40 flex items-center justify-center gap-1.5">
                        <RefreshCw size={14} className={printerBusy ? 'animate-spin' : ''} /> DETECT PRINTERS
                      </button>
                    </div>
                    {detectedPrinters.length > 0 ? (
                      <select value={draftSettings.printerName} onChange={(event) => setDraftValue('printerName', event.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                        {detectedPrinters.map((printer) => <option key={printer.name} value={printer.name}>{printer.label}</option>)}
                      </select>
                    ) : (
                      <input value={draftSettings.printerName} onChange={(event) => setDraftValue('printerName', event.target.value)} placeholder="Printer queue or LAN target, e.g. POS80 Printer or tcp://192.168.1.50:9100" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                    )}
                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] font-bold text-slate-500">All-in-one Windows bridge with automatic startup and crash recovery. Your printer and paper settings stay saved on this computer.</p>
                      <a href="/downloads/BhojPatra-Printer-Bridge-Setup.exe?v=3.1.2" download className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-black text-white">
                        <Download size={13} /> DOWNLOAD ALL-IN-ONE BRIDGE
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Settings2 size={18} className="text-primary" strokeWidth={2.5} />
                <h2 className="text-sm font-black text-slate-800 tracking-tight">Receipt Layout</h2>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Thermal Paper Width</label>
                  <select value={draftSettings.receiptWidth} onChange={(event) => setDraftValue('receiptWidth', event.target.value as PrintSettings['receiptWidth'])} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                    <option value="58mm">58mm / 2 inch</option>
                    <option value="72mm">72mm</option>
                    <option value="80mm">80mm / 3 inch</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Bill Printing Mode</label>
                  <select value={draftSettings.billMode} onChange={(event) => setDraftValue('billMode', event.target.value as PrintSettings['billMode'])} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                    <option value="separate">Separate food and liquor bills</option>
                    <option value="single">Single combined bill</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">KOT Printing Mode</label>
                  <select value={draftSettings.kotPrintMode} onChange={(event) => setDraftValue('kotPrintMode', event.target.value as PrintSettings['kotPrintMode'])} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                    <option value="separate">Separate KOTs for food and liquor</option>
                    <option value="single">Single combined KOT for food + liquor</option>
                  </select>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">Kitchen records stay separated by station; this controls only the automatic print output.</p>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Bill Heading Size</label>
                  <select value={draftSettings.headingSize} onChange={(event) => setDraftValue('headingSize', event.target.value as PrintSettings['headingSize'])} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                    <option value="compact">Smaller</option>
                    <option value="standard">Standard</option>
                    <option value="large">Bigger</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Body Font Size</label>
                  <select value={draftSettings.fontSize} onChange={(event) => setDraftValue('fontSize', event.target.value as PrintSettings['fontSize'])} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white">
                    <option value="compact">Compact</option>
                    <option value="standard">Standard</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Print Business Name</label>
                  <input value={draftSettings.businessName} onChange={(event) => setDraftValue('businessName', event.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">UPI ID for Bill QR</label>
                  <input value={draftSettings.upiId} onChange={(event) => setDraftValue('upiId', event.target.value)} placeholder="example@upi" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Receipt Header Text</label>
                  <textarea value={draftSettings.headerText} onChange={(event) => setDraftValue('headerText', event.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Receipt Footer Message</label>
                  <textarea value={draftSettings.footerText} onChange={(event) => setDraftValue('footerText', event.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div className="md:col-span-2 rounded-xl border-2 border-amber-100 bg-amber-50 p-3">
                  <p className="text-xs font-black text-amber-900">2-inch fit fix</p>
                  <p className="mt-1 text-[10px] font-bold leading-5 text-amber-800">The 58mm layout now uses tighter column widths and smaller safe defaults so totals like `0` at the end of the net amount line stop clipping.</p>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <ReceiptText size={18} className="text-primary" strokeWidth={2.5} />
                <h2 className="text-sm font-black text-slate-800 tracking-tight">Print Behavior</h2>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  ['showUpiQrOnBill', 'Show UPI QR on bill'],
                  ['showUpiIdOnBill', 'Show UPI ID text'],
                  ['showPaymentDetailsOnBill', 'Show payment details'],
                  ['autoPrintReceipt', 'Auto-print receipt on settle'],
                  ['autoPrintKot', 'Auto-print KOT on send'],
                  ['showGstin', 'Show GSTIN'],
                  ['showTaxInvoiceLabel', 'Show "Tax Invoice" label'],
                  ['showGstinOnFirstBill', 'GSTIN on first bill'],
                  ['showGstinOnSecondBill', 'GSTIN on second bill'],
                  ['showKotToken', 'Show KOT token number'],
                  ['showBillPartLabel', 'Show bill part label'],
                  ['directKotPrint', 'Direct KOT print'],
                  ['directReceiptPrint', 'Direct bill print'],
                  ['directProformaPrint', 'Direct proforma print'],
                  ['autoCut', 'Auto-cut paper'],
                  ['openCashDrawer', 'Open cash drawer on bill'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer rounded-xl border-2 border-slate-100 bg-slate-50 p-3">
                    <input
                      type="checkbox"
                      checked={Boolean(draftSettings[key as keyof PrintSettings])}
                      onChange={(event) => setDraftValue(key as keyof PrintSettings, event.target.checked as never)}
                      className="w-4 h-4 rounded text-primary"
                    />
                    <span className="text-xs font-black text-slate-800">{label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 self-start">
            <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <FileText size={18} className="text-primary" strokeWidth={2.5} />
                <h2 className="text-sm font-black text-slate-800 tracking-tight">Bill Preview</h2>
              </div>
              <div className="max-h-[70vh] overflow-auto">
                <ReceiptPreview
                  order={previewOrder}
                  outlet={outlet}
                  printSettings={draftSettings}
                  parts={previewParts}
                  orderPayments={previewPayments}
                  receiptType="invoice"
                  className="!bg-slate-100"
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <ReceiptText size={18} className="text-primary" strokeWidth={2.5} />
                <h2 className="text-sm font-black text-slate-800 tracking-tight">KOT Preview</h2>
              </div>
              <div className="px-5 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500">
                Print mode: <span className="font-black text-slate-700">{draftSettings.kotPrintMode === 'single' ? 'Single combined food + liquor KOT' : 'Separate food and liquor KOTs'}</span>
              </div>
              <div className="thermal-page !min-h-0 !bg-slate-100" style={{ ['--receipt-width' as string]: draftSettings.receiptWidth }} data-receipt-width={draftSettings.receiptWidth} data-heading-size={draftSettings.headingSize} data-font-size={draftSettings.fontSize}>
                <section className="thermal-slip kot-slip !mb-0">
                  <div className="thermal-center">
                    <h1>KITCHEN ORDER TICKET</h1>
                    <p>{outlet.name}</p>
                    {draftSettings.showKotToken && <div className="kot-token">{previewKot.kotNo}</div>}
                  </div>
                  <div className="thermal-rule" />
                  <div className="thermal-row"><span>Order</span><strong>{previewKot.orderNo}</strong></div>
                  <div className="thermal-row"><span>Type</span><strong>{previewKot.orderType.replace('_', ' ')}</strong></div>
                  <div className="thermal-row"><span>Time</span><strong>{new Date(previewKot.createdAt).toLocaleString('en-IN')}</strong></div>
                  <div className="kot-meta-grid">
                    {previewKot.tableName && <div className="kot-meta-box"><span>Table</span><strong>{previewKot.tableName}</strong></div>}
                    <div className="kot-meta-box"><span>Items</span><strong>{previewKot.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
                  </div>
                  <div className="thermal-rule" />
                  {previewKot.items.map((item) => (
                    <div className="kot-item" key={item.id}>
                      <div><strong>{item.quantity} x {item.name}</strong></div>
                      {item.note && <div className="kot-note">Note: {item.note}</div>}
                      {item.modifiers?.length ? <div className="kot-note">+ {item.modifiers.join(', ')}</div> : null}
                    </div>
                  ))}
                  <div className="kot-total">TOTAL ITEMS: {previewKot.items.reduce((sum, item) => sum + item.quantity, 0)}</div>
                </section>
                <pre className="sr-only">{previewKotText}</pre>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
