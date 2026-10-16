import type { KOT, Station } from './types'
import type { PrintSettings } from '../store/billingStore'
import { DEFAULT_BRIDGE_URL, normalizeNetworkPrinterAddress, type PrinterTransportSettings, type PrintJob } from './printer'
import { buildKotPrintText } from './printTemplates'

export interface RoutedKotJob { id: string; kotIds: string[]; settings: PrinterTransportSettings; job: PrintJob }

/** Combine only tickets for the SAME order and physical printer. Station routes win. */
export function planKotPrintJobs(kots: KOT[], stations: Station[], settings: PrintSettings,
  outlet: { name: string; address?: string; phone?: string }): RoutedKotJob[] {
  const grouped = new Map<string, { kots: KOT[]; settings: PrinterTransportSettings }>()
  kots.forEach(kot => {
    const station = stations.find(s => s.id === kot.stationId)
    const target = station?.printerTarget?.trim() || settings.kotPrinterName?.trim() || settings.printerName.trim()
    const explicit = Boolean(station?.printerTarget?.trim() || settings.kotPrinterName?.trim())
    const transport: PrinterTransportSettings = {
      ...settings, printerName: normalizeNetworkPrinterAddress(target) || target, openCashDrawer: false, strictTarget: true,
      connectionMode: explicit ? (settings.connectionMode === 'bridge' ? 'bridge' : 'native') : settings.connectionMode,
      bridgeUrl: settings.bridgeUrl || DEFAULT_BRIDGE_URL,
    }
    const groupKey = settings.kotPrintMode === 'single'
      ? JSON.stringify([kot.orderId, transport.connectionMode, transport.printerName]) : kot.id
    const group = grouped.get(groupKey) ?? { kots: [], settings: transport }
    group.kots.push(kot)
    grouped.set(groupKey, group)
  })
  return [...grouped.values()].map(group => {
    const first = group.kots[0]
    const printable = { ...first, kotNo: group.kots.map(k => k.kotNo).join(' + '), items: group.kots.flatMap(k => k.items) }
    const kotIds = group.kots.map(k => k.id).sort()
    return { id: `kot:${kotIds.join('|')}`, kotIds, settings: group.settings,
      job: { jobName: `KOT ${printable.kotNo}`, text: buildKotPrintText(printable, outlet, settings),
        browserUrl: `/print/kot/${first.id}${group.kots.length > 1 ? `?ids=${encodeURIComponent(kotIds.join(','))}` : ''}` } }
  })
}
