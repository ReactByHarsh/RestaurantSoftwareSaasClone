import { useState, useMemo, useEffect } from 'react'
import { ChefHat, Expand, Shrink, BellRing } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import { realtimeClient } from '../../lib/realtime'
import StationFilter from './StationFilter'
import KOTCard from './KOTCard'
import { clsx } from 'clsx'
import ReasonDialog from '../shared/ReasonDialog'

type StatusFilter = 'all' | 'new' | 'preparing' | 'ready'

export default function KitchenScreen() {
  const { kots, orders, stations, updateKOTItemStatus, updateKOTStatus, cancelKOT } = useBillingStore()
  const { addToast } = useUIStore()
  
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeStationId, setActiveStationId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [cancelKotId, setCancelKotId] = useState<string | null>(null)

  // Realtime listener for new KOT alerts
  useEffect(() => {
    const unsub = realtimeClient.subscribe((event) => {
      if (event.type === 'KOT_CREATED') {
        const { kot } = event.payload as any
        addToast('info', `New KOT Received: ${kot.kotNo}`)
        // Play sound if possible
      }
    })
    return unsub
  }, [addToast])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
        setIsFullscreen(false)
      }
    }
  }

  // Filter KOTs
  const activeKOTs = useMemo(() => {
    const closedOrderIds = new Set(orders.filter(order => ['paid', 'cancelled', 'void'].includes(order.status)).map(order => order.id))
    return kots
      .filter(k => !closedOrderIds.has(k.orderId))
      .filter(k => k.status !== 'cancelled' && k.status !== 'served')
      .filter(k => {
        if (statusFilter === 'all') return ['new', 'preparing', 'ready'].includes(k.status)
        return k.status === statusFilter
      })
      .filter(k => activeStationId === 'all' || k.stationId === activeStationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [kots, orders, statusFilter, activeStationId])

  return (
    <div className={clsx(
      'flex flex-col bg-slate-900 text-slate-200 transition-all min-w-0 overflow-hidden',
      isFullscreen ? 'fixed inset-0 z-[100] h-[100dvh] w-screen' : 'h-full w-full'
    )}>
      {/* Top Header */}
      <div className="bg-slate-950 px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3 flex-shrink-0 relative z-20 shadow-sm min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary border border-primary/30 shadow-inner flex-shrink-0">
            <ChefHat size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight truncate leading-none">KITCHEN DISPLAY</h1>
              <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20 shadow-sm font-bold tracking-wider">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                LIVE
              </span>
            </div>
            <div className="mt-0.5">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400">
                {activeKOTs.length} Active Orders
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-hide pb-1 md:pb-0">
          <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-800 shadow-inner flex-shrink-0">
            {(['all', 'new', 'preparing', 'ready'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'flex-shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-black transition-all capitalize whitespace-nowrap',
                  statusFilter === s
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )}
              >
                {s === 'all' ? 'Active Orders' : s}
              </button>
            ))}
          </div>

          <StationFilter
            stations={stations}
            activeStationId={activeStationId}
            onSelect={setActiveStationId}
          />
          
          <div className="hidden sm:block w-px h-6 bg-slate-800 mx-0.5 rounded-full flex-shrink-0" />
          
          <button
            onClick={toggleFullscreen}
            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 flex items-center justify-center rounded-md bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all active:scale-95 border border-slate-700 shadow-sm"
          >
            {isFullscreen ? <Shrink size={14} strokeWidth={2.5} /> : <Expand size={14} strokeWidth={2.5} />}
          </button>
        </div>
      </div>


      {/* Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-slate-900/50 min-w-0">
        {activeKOTs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <BellRing size={64} strokeWidth={1} className="mb-4 opacity-20" />
            <h2 className="text-2xl font-bold text-slate-500">No active orders</h2>
            <p className="text-slate-600 mt-2">Waiting for new KOTs...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3 sm:gap-6 auto-rows-max min-w-0">
            {activeKOTs.map(kot => (
              <KOTCard
                key={kot.id}
                kot={kot}
                onItemStatusChange={(itemId, status) => updateKOTItemStatus(kot.id, itemId, status)}
                onKOTStatusChange={(status) => updateKOTStatus(kot.id, status)}
                onCancel={() => setCancelKotId(kot.id)}
              />
            ))}
          </div>
        )}
      </div>
      {cancelKotId && (
        <ReasonDialog
          title="Cancel kitchen ticket"
          description="This removes the KOT from the active kitchen queue and recalculates its order."
          confirmLabel="Cancel KOT"
          onClose={() => setCancelKotId(null)}
          onConfirm={(reason) => {
            const cancelled = cancelKOT(cancelKotId, reason)
            addToast(cancelled ? 'success' : 'error', cancelled ? 'KOT cancelled' : 'KOT could not be cancelled')
            setCancelKotId(null)
          }}
        />
      )}
    </div>
  )
}
