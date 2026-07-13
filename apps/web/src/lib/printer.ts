import { invoke } from '@tauri-apps/api/core'

export type PrinterConnectionMode = 'browser' | 'system' | 'webusb' | 'bridge' | 'native'

export function normalizePrinterConnectionMode(mode?: PrinterConnectionMode): Exclude<PrinterConnectionMode, 'system'> {
  if (mode === 'bridge' || mode === 'native' || mode === 'webusb') return mode
  return 'browser'
}

export interface PrinterTransportSettings {
  connectionMode: PrinterConnectionMode
  printerName: string
  usbVendorId?: number
  usbProductId?: number
  bridgeUrl?: string
  autoCut?: boolean
  openCashDrawer?: boolean
}

export interface PrinterIdentity {
  name: string
  vendorId: number
  productId: number
  directCompatible?: boolean
  warning?: string
}

export interface BridgePrinter {
  name: string
  label: string
  portName?: string
  driverName?: string
  status?: string
  isDefault?: boolean
}

export interface BridgeHealth {
  ok: boolean
  service?: string
  version?: string
  spoolerStatus?: string
  printerCount?: number
}

export interface PrintJob {
  jobName: string
  text: string
  browserUrl?: string
  logoDataUrl?: string
  qrCodes?: Array<{ data: string; label?: string }>
}

export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8181'

type UsbEndpointLike = { direction: 'in' | 'out'; endpointNumber: number }
type UsbAlternateLike = { alternateSetting: number; endpoints: UsbEndpointLike[] }
type UsbInterfaceLike = { interfaceNumber: number; alternates: UsbAlternateLike[] }
type UsbConfigurationLike = { configurationValue: number; interfaces: UsbInterfaceLike[] }
type UsbDeviceLike = {
  vendorId: number
  productId: number
  productName?: string
  manufacturerName?: string
  opened: boolean
  configurations: UsbConfigurationLike[]
  configuration?: UsbConfigurationLike | null
  open: () => Promise<void>
  close: () => Promise<void>
  selectConfiguration: (configurationValue: number) => Promise<void>
  claimInterface: (interfaceNumber: number) => Promise<void>
  selectAlternateInterface?: (interfaceNumber: number, alternateSetting: number) => Promise<void>
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>
  forget?: () => Promise<void>
}
type UsbApiLike = {
  requestDevice: (options: { filters: Array<Record<string, number>> }) => Promise<UsbDeviceLike>
  getDevices: () => Promise<UsbDeviceLike[]>
}

function tauriAvailable() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export function nativePrintSupported() {
  return tauriAvailable()
}

function usbApi() {
  return (navigator as Navigator & { usb?: UsbApiLike }).usb
}

export function webUsbSupported() {
  return Boolean(usbApi() && window.isSecureContext)
}

export async function requestUsbPrinter(): Promise<PrinterIdentity> {
  const usb = usbApi()
  if (!usb || !window.isSecureContext) throw new Error('Direct USB printing requires Chrome or Edge on HTTPS.')
  const device = await usb.requestDevice({ filters: [] })
  let directCompatible = true
  let warning: string | undefined
  try {
    await openUsbPrinter(device)
  } catch (error) {
    directCompatible = false
    warning = error instanceof Error ? error.message : 'Chrome could not open this USB printer.'
  } finally {
    if (device.opened) await device.close().catch(() => undefined)
  }
  return {
    name: usbPrinterName(device),
    vendorId: device.vendorId,
    productId: device.productId,
    directCompatible,
    warning,
  }
}

function usbPrinterName(device: Pick<UsbDeviceLike, 'vendorId' | 'productId' | 'productName' | 'manufacturerName'>) {
  const product = device.productName?.trim()
  const manufacturer = device.manufacturerName?.trim()
  if (product && !/^unknown device/i.test(product)) return product
  const vendor = device.vendorId.toString(16).padStart(4, '0')
  const productId = device.productId.toString(16).padStart(4, '0')
  if (/imc/i.test(manufacturer || '') || vendor === '0001') return `POS80 USB Printer (${vendor}:${productId})`
  if (manufacturer) return `${manufacturer} USB Printer (${vendor}:${productId})`
  return `USB Printer (${vendor}:${productId})`
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  parts.forEach((part) => {
    bytes.set(part, offset)
    offset += part.length
  })
  return bytes
}

function escPosQrBytes(data: string, label?: string) {
  const value = data.trim()
  if (!value) return new Uint8Array()
  const encoder = new TextEncoder()
  const qrData = encoder.encode(value)
  const storeLength = qrData.length + 3
  const pL = storeLength % 256
  const pH = Math.floor(storeLength / 256)
  const labelBytes = label?.trim() ? encoder.encode(`${label.trim()}\n`) : new Uint8Array()
  return concatBytes([
    new Uint8Array([0x0a, 0x1b, 0x61, 0x01]),
    labelBytes,
    new Uint8Array([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    new Uint8Array([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
    qrData,
    new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, 0x0a, 0x1b, 0x61, 0x00]),
  ])
}

function escPosBytes(job: Pick<PrintJob, 'text' | 'qrCodes'>, settings: PrinterTransportSettings) {
  const safeText = job.text
    .replace(/₹/g, 'Rs.')
    .replace(/[–—]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
  const body = new TextEncoder().encode(safeText.endsWith('\n') ? safeText : `${safeText}\n`)
  const prefix = new Uint8Array([0x1b, 0x40])
  const drawer = settings.openCashDrawer ? new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]) : new Uint8Array()
  const qrCodes = (job.qrCodes ?? []).map((qr) => escPosQrBytes(qr.data, qr.label))
  const suffix = settings.autoCut === false
    ? new Uint8Array([0x0a, 0x0a, 0x0a])
    : new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00])
  return concatBytes([prefix, drawer, body, ...qrCodes, suffix])
}

function usbOpenError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/access denied|permission|denied|security/i.test(message)) {
    return new Error('Chrome cannot claim this printer while Windows owns it. Use Printer Bridge with the POS80 Windows queue for no-dialog USB/Bluetooth/LAN printing, or use System Dialog.')
  }
  return error instanceof Error ? error : new Error(message || 'USB printer failed to open.')
}

function findWritableUsbEndpoint(device: UsbDeviceLike) {
  const interfaces = device.configuration?.interfaces ?? []
  for (const candidateInterface of interfaces) {
    for (const alternate of candidateInterface.alternates) {
      const endpoint = alternate.endpoints.find(candidate => candidate.direction === 'out')
      if (endpoint) {
        return { interfaceNumber: candidateInterface.interfaceNumber, alternateSetting: alternate.alternateSetting, endpointNumber: endpoint.endpointNumber }
      }
    }
  }
  return null
}

async function openUsbPrinter(device: UsbDeviceLike) {
  try {
    if (!device.opened) await device.open()
    if (!device.configuration) {
      const configurationValue = device.configurations[0]?.configurationValue ?? 1
      await device.selectConfiguration(configurationValue)
    }
    const target = findWritableUsbEndpoint(device)
    if (!target) throw new Error('No writable USB endpoint was found on this printer.')
    await device.claimInterface(target.interfaceNumber)
    if (target.alternateSetting && device.selectAlternateInterface) {
      await device.selectAlternateInterface(target.interfaceNumber, target.alternateSetting)
    }
    return target
  } catch (error) {
    throw usbOpenError(error)
  }
}

async function findSavedUsbPrinter(settings: PrinterTransportSettings) {
  const usb = usbApi()
  if (!usb) throw new Error('WebUSB is not supported in this browser.')
  const devices = await usb.getDevices()
  const savedDevice = devices.find(candidate => candidate.vendorId === settings.usbVendorId && candidate.productId === settings.usbProductId)
  if (savedDevice) return savedDevice

  const canPrompt = Boolean((navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation?.isActive)
  if (settings.usbVendorId && settings.usbProductId && canPrompt) {
    return usb.requestDevice({ filters: [{ vendorId: settings.usbVendorId, productId: settings.usbProductId }] })
  }
  throw new Error('The saved USB printer is not connected. Reconnect it from Settings.')
}

async function printWebUsb(settings: PrinterTransportSettings, job: PrintJob) {
  const device = await findSavedUsbPrinter(settings)

  try {
    const target = await openUsbPrinter(device)
    const bytes = escPosBytes(job, settings)
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      await device.transferOut(target.endpointNumber, bytes.slice(offset, offset + 4096))
    }
  } finally {
    if (device.opened) await device.close().catch(() => undefined)
  }
}

function cleanBridgeUrl(value?: string) {
  return (value || DEFAULT_BRIDGE_URL).trim().replace(/\/+$/, '')
}

export function resolveBridgeUrlInput(value?: string) {
  const raw = String(value ?? '').trim()
  const localMatch = raw.match(/https?:\/\/(?:127\.0\.0\.1|localhost|\[?::1\]?)(?::\d+)?/i)
  if (localMatch) return localMatch[0].replace(/\/+$/, '')
  try {
    const parsed = new URL(raw)
    if (['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)) return cleanBridgeUrl(raw)
  } catch {
    // Fall back to the default bridge URL.
  }
  return DEFAULT_BRIDGE_URL
}

export function isLocalBridgeUrl(value?: string) {
  try {
    const url = new URL(cleanBridgeUrl(value))
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export async function checkBridgeHealth(bridgeUrl?: string, timeoutMs = 2500): Promise<BridgeHealth> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${resolveBridgeUrlInput(bridgeUrl)}/health`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(await bridgeErrorMessage(response))
    const health = await response.json() as BridgeHealth
    if (!health?.ok) throw new Error('The local printer bridge returned an unhealthy status.')
    return health
  } finally {
    window.clearTimeout(timer)
  }
}

async function waitForBridge(bridgeUrl?: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await checkBridgeHealth(bridgeUrl, 2500)
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
    }
  }
  const detail = lastError instanceof Error && lastError.name !== 'AbortError' ? ` ${lastError.message}` : ''
  throw new Error(`BhojPatra Printer Bridge is temporarily unavailable after automatic retries.${detail} Windows will restart it automatically; wait a moment and retry.`)
}

function isPrivateLanHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.pages.dev') || host.endsWith('.workers.dev')) return false
  if (host.endsWith('.local')) return true
  // Local printer DNS names are commonly single-label names such as `POS80` or
  // `receipt-printer`. They are not public DNS names, so allow them as explicit
  // LAN targets instead of sending the unnormalised value to the bridge.
  if (/^[a-z0-9][a-z0-9-]*$/i.test(host)) return true
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
}

export function normalizeNetworkPrinterAddress(value?: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw)
    if (['tcp:', 'socket:', 'raw:'].includes(parsed.protocol)) {
      if (!parsed.hostname) return ''
      return `tcp://${parsed.hostname}:${parsed.port || '9100'}`
    }
    if (['http:', 'https:'].includes(parsed.protocol) && isPrivateLanHost(parsed.hostname)) {
      return `tcp://${parsed.hostname}:${parsed.port || '9100'}`
    }
  } catch {
    // Fall through to host[:port] parsing.
  }

  const hostPort = raw.match(/^([a-z0-9.-]+|\[[a-f0-9:]+\])(?::(\d{2,5}))?$/i)
  if (!hostPort) return ''
  const host = hostPort[1].replace(/^\[|\]$/g, '')
  if (!isPrivateLanHost(host)) return ''
  if (!/^[a-z0-9.-]+$|^[a-f0-9:]+$/i.test(host)) return ''
  return `tcp://${host}:${hostPort[2] || '9100'}`
}

export async function discoverBridgePrinters(bridgeUrl?: string): Promise<BridgePrinter[]> {
  // Printer enumeration may legitimately take longer while Windows refreshes a USB queue.
  // First prove the lightweight bridge heartbeat, then allow discovery its own timeout.
  await checkBridgeHealth(bridgeUrl, 4000)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20_000)
  let response: Response
  try {
    response = await fetch(`${resolveBridgeUrlInput(bridgeUrl)}/printers`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
  if (!response.ok) {
    if ([404, 405].includes(response.status) && !isLocalBridgeUrl(bridgeUrl)) {
      throw new Error('That looks like a printer IP/link, not the local print bridge. Use the local bridge URL and put the LAN printer IP as the printer target.')
    }
    throw new Error(await bridgeErrorMessage(response))
  }
  const payload = await response.json() as unknown
  const list = Array.isArray(payload) ? payload : (payload as { printers?: unknown[] })?.printers
  if (!Array.isArray(list)) throw new Error('The print bridge returned an invalid printer list.')
  return list
    .map((item): BridgePrinter => {
      if (typeof item === 'string') return { name: item, label: item }
      const record = item as BridgePrinter
      const name = String(record.name || '')
      return {
        name,
        label: String(record.label || [record.name, record.portName, record.driverName].filter(Boolean).join(' - ') || name),
        portName: record.portName,
        driverName: record.driverName,
        status: record.status,
        isDefault: record.isDefault,
      }
    })
    .filter(item => item.name)
    .sort((a, b) => {
      const score = (value: BridgePrinter) => /pos|80|thermal|receipt|rongta|kpc|epson|foodkart|cp001|tcp/i.test(`${value.name} ${value.portName} ${value.driverName}`) ? 0 : 1
      return score(a) - score(b) || a.name.localeCompare(b.name)
    })
}

export async function discoverNativePrinters(): Promise<BridgePrinter[]> {
  if (!tauriAvailable()) throw new Error('Built-in desktop printing is available only inside the BhojPatra desktop app.')
  const printers = await invoke<BridgePrinter[]>('list_native_printers')
  return printers
    .filter(printer => printer.name)
    .sort((a, b) => {
      const score = (value: BridgePrinter) => /pos|80|thermal|receipt|rongta|kpc|epson|foodkart|cp001|bluetooth|tcp/i.test(`${value.name} ${value.portName} ${value.driverName}`) ? 0 : 1
      return score(a) - score(b) || a.name.localeCompare(b.name)
    })
}

async function printNative(settings: PrinterTransportSettings, job: PrintJob) {
  if (!tauriAvailable()) throw new Error('Built-in desktop printing is available only inside the BhojPatra desktop app.')
  if (!settings.printerName.trim()) throw new Error('Select a printer queue in Settings first.')
  const networkTarget = normalizeNetworkPrinterAddress(settings.printerName)
  await invoke('print_native', {
    payload: {
      printer: networkTarget || settings.printerName,
      jobName: job.jobName,
      text: job.text,
      autoCut: settings.autoCut !== false,
      openCashDrawer: Boolean(settings.openCashDrawer),
      qrCodes: job.qrCodes ?? [],
      logoDataUrl: job.logoDataUrl ?? null,
    },
  })
}

async function printBridge(settings: PrinterTransportSettings, job: PrintJob) {
  if (!settings.printerName.trim()) throw new Error('Select a printer queue in Settings first.')
  await waitForBridge(settings.bridgeUrl)
  const networkTarget = normalizeNetworkPrinterAddress(settings.printerName)
  const requestedPrinter = networkTarget || settings.printerName
  const sendToBridge = async (printer: string) => {
    const response = await fetch(`${resolveBridgeUrlInput(settings.bridgeUrl)}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        printer,
        jobName: job.jobName,
        contentType: 'text/plain',
        content: job.text,
        logoDataUrl: job.logoDataUrl ?? null,
        options: { raw: true, autoCut: settings.autoCut !== false, openCashDrawer: Boolean(settings.openCashDrawer), qrCodes: job.qrCodes ?? [] },
      }),
    })
    if (!response.ok) throw new Error(await bridgeErrorMessage(response))
  }

  try {
    await sendToBridge(requestedPrinter)
  } catch (error) {
    // A stale hostname can fail even while the bridge and the Windows queue are
    // healthy. Enumerate queues once and retry through the installed queue so the
    // cashier does not need to know the printer's IP address.
    if (!networkTarget || !isHostResolutionError(error)) throw error
    let fallback: string | undefined
    try {
      fallback = await findInstalledQueueFallback(settings.bridgeUrl, networkTarget)
    } catch {
      throw error
    }
    if (!fallback) throw error
    await sendToBridge(fallback)
  }
}

function isHostResolutionError(error: unknown) {
  return /no such host|enotfound|name or service not known|could not resolve/i.test(error instanceof Error ? error.message : String(error || ''))
}

async function findInstalledQueueFallback(bridgeUrl: string | undefined, networkTarget: string) {
  const printers = await discoverBridgePrinters(bridgeUrl)
  const parsed = new URL(networkTarget)
  const host = parsed.hostname.toLowerCase()
  const hostKey = host.replace(/[^a-z0-9]/g, '')
  const fields = (printer: BridgePrinter) => `${printer.name} ${printer.label} ${printer.portName ?? ''} ${printer.driverName ?? ''}`.toLowerCase()
  const matching = printers.filter((printer) => {
    const value = fields(printer)
    return value.includes(host) || value.replace(/[^a-z0-9]/g, '').includes(hostKey)
  })
  if (matching.length === 1) return matching[0].name

  const preferred = printers.filter((printer) => printer.isDefault || /pos|thermal|receipt|printer|epson|rongta|kpc|80mm|58mm/i.test(fields(printer)))
  if (preferred.length === 1) return preferred[0].name
  return printers.length === 1 ? printers[0].name : undefined
}

async function bridgeErrorMessage(response: Response) {
  try {
    const payload = await response.json() as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  } catch {
    // Fall back to a status-only message.
  }
  return `Print bridge returned ${response.status}.`
}

function appendHiddenFrame() {
  const frame = document.createElement('iframe')
  frame.title = 'Background print frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '1px'
  frame.style.height = '1px'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  frame.style.border = '0'
  frame.style.right = '0'
  frame.style.bottom = '0'
  document.body.appendChild(frame)
  window.setTimeout(() => frame.remove(), 120_000)
  return frame
}

export function printUrlWithoutPopup(url: string) {
  const frame = appendHiddenFrame()
  const separator = url.includes('?') ? '&' : '?'
  frame.src = `${url}${separator}embedded=1`
}

function printTextWithDialog(job: PrintJob) {
  const frame = appendHiddenFrame()
  const escaped = job.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Use a generous font size and margins so the receipt is legible on any paper size
  frame.srcdoc = `<!doctype html><html><head><title>${job.jobName}</title><style>@page{size:80mm auto;margin:6mm 4mm}body{margin:0;font:13px/1.5 'Courier New',Courier,monospace;white-space:pre-wrap;word-break:break-word}pre{margin:0;padding:0}</style></head><body><pre>${escaped}</pre><script>setTimeout(()=>window.print(),300)<\/script></body></html>`
}

export async function sendPrintJob(settings: PrinterTransportSettings, job: PrintJob): Promise<'direct' | 'dialog'> {
  if (settings.connectionMode === 'native') {
    await printNative(settings, job)
    return 'direct'
  }
  if (settings.connectionMode === 'webusb') {
    await printWebUsb(settings, job)
    return 'direct'
  }
  if (settings.connectionMode === 'bridge') {
    await printBridge(settings, job)
    return 'direct'
  }
  // Browser / system dialog mode: prefer the rich HTML receipt page when available
  if (job.browserUrl) printUrlWithoutPopup(job.browserUrl)
  else printTextWithDialog(job)
  return 'dialog'
}

export function describePrinterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Direct print failed')
  if (/no such host|enotfound|name or service not known|could not resolve/i.test(message)) {
    return 'The bridge is online, but the saved LAN printer hostname cannot be resolved. Open Printer Settings, click Detect Printers, select the Windows printer queue, or enter the printer IP address (for example 192.168.1.50:9100).'
  }
  return message
}
