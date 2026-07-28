import { useEffect, useState, useRef } from 'react'
import {
  Users, PlayCircle, ReceiptText, Printer, CheckCircle,
  HandPlatter, Pencil, ArrowRightLeft, GitMerge, MoreVertical, LayoutGrid, X
} from 'lucide-react'
import type { RestaurantTable, Order } from '../../lib/types'
import { clsx } from 'clsx'
import { useBillingStore } from '../../store/billingStore'
import { useNavigate } from 'react-router-dom'

interface Props {
  table: RestaurantTable
  activeOrder: Order | null
  compact?: boolean
  canManage?: boolean
  floorColor?: string
  floorBadge?: string
  floorName?: string
  onEdit?: () => void
  onTransfer?: () => void
  onMerge?: () => void
  onShare?: () => void
  onRemove?: () => void
  onClick?: () => void
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; pill: string; action: string }> = {
  available:       { bg: 'bg-white',      text: 'text-slate-800',   border: 'border-slate-200',          pill: 'bg-slate-50 text-slate-500 border-slate-200',   action: 'Start Order'   },
  occupied:        { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-300',            pill: 'bg-blue-100 text-blue-700 border-blue-200',     action: 'Add Items'     },
  kot_sent:        { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',           pill: 'bg-amber-100 text-amber-700 border-amber-200',  action: 'View Order'    },
  preparing:       { bg: 'bg-orange-50',  text: 'text-orange-800',  border: 'border-orange-300',          pill: 'bg-orange-100 text-orange-700 border-orange-200',action:'View Order'    },
  ready:           { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300',         pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', action: 'Serve / Bill' },
  bill_requested:  { bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-300',          pill: 'bg-purple-100 text-purple-700 border-purple-200',action: 'Settle'       },
  payment_pending: { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-300',             pill: 'bg-red-100 text-red-700 border-red-200',        action: 'Settle'        },
  reserved:        { bg: 'bg-cyan-50',    text: 'text-cyan-800',    border: 'border-cyan-300',            pill: 'bg-cyan-100 text-cyan-700 border-cyan-200',     action: 'Open'          },
  dirty:           { bg: 'bg-slate-100',  text: 'text-slate-700',   border: 'border-slate-300 border-dashed', pill: 'bg-white text-slate-500 border-slate-200',  action: 'Clean'         },
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export default function TableCard({ table, activeOrder, compact = false, canManage = false, floorColor, floorBadge, floorName, onEdit, onTransfer, onMerge, onShare, onRemove, onClick }: Props) {
  const navigate = useNavigate()
  const { selectTable, updateTableStatus } = useBillingStore()
  const config = STATUS_CONFIG[table.status] || STATUS_CONFIG.available
  const [now, setNow] = useState(Date.now())
  const [showPopover, setShowPopover] = useState(false)
  const [popoverAlign, setPopoverAlign] = useState<'center' | 'right'>('center')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const orderStartedAt = activeOrder ? new Date(activeOrder.createdAt) : null
  const elapsedLabel = orderStartedAt ? formatElapsed(now - orderStartedAt.getTime()) : '0m 00s'
  const orderTimeLabel = orderStartedAt?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  const handleBodyClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showPopover) {
      setShowPopover(false)
      return
    }
    if (onClick) {
      onClick()
    } else {
      selectTable(table.id)
      navigate('/app/billing')
    }
  }

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // If the right side of the card is close to the right edge of the screen, align right
    if (window.innerWidth - rect.right < 120) {
      setPopoverAlign('right')
    } else {
      setPopoverAlign('center')
    }
    setShowPopover(!showPopover)
  }

  const handleEmpty = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateTableStatus(table.id, { status: 'available' })
    setShowPopover(false)
  }

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPopover(false)
    if (onClick) onClick()
    else {
      selectTable(table.id)
      navigate('/app/billing')
    }
  }

  const handleTransferClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPopover(false)
    onTransfer?.()
  }

  const handleMergeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPopover(false)
    onMerge?.()
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit?.()
  }

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPopover(false)
    onShare?.()
  }

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPopover(false)
    onRemove?.()
  }

  const isSharedTable = /\([a-z]\)$/.test(table.name.trim())

  return (
    <div
      onClick={handleBodyClick}
      role="button"
      tabIndex={0}
      className={clsx(
        'group relative min-w-0 flex flex-col overflow-visible border-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
        showPopover ? 'z-50' : 'z-0 hover:z-40',
        compact ? 'h-[88px] rounded-md' : 'h-[160px] rounded-xl',
        floorColor || config.border, config.bg
      )}
    >
      {/* Clickable Header Section */}
      <div 
        onClick={handleHeaderClick}
        className={clsx(
          'flex items-center justify-between w-full z-10 border-b hover:opacity-90 transition-opacity',
          compact ? 'rounded-t-md px-1.5 py-1' : 'rounded-t-xl px-2.5 py-1.5',
          table.status === 'available' ? "bg-slate-50 border-slate-200" : "bg-white border-black/10"
        )}
      >
        <div className="flex-1">
          <h3 className={clsx(compact ? 'text-sm' : 'text-lg', 'font-black leading-none tracking-tight truncate pr-1', config.text)}>
            {table.name}
          </h3>
        </div>
        <div className={clsx('flex items-center gap-1 font-black rounded-md border shadow-sm', compact ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5', table.status === 'available' ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-50/50 border-black/5 ' + config.text)}>
          <Users size={compact ? 9 : 11} />{table.seats}
        </div>
      </div>

      {/* Popover Menu */}
      {showPopover && (
        <div 
          ref={popoverRef} 
          className={clsx(
            compact ? 'absolute top-8 z-[60] bg-white shadow-2xl rounded-xl border border-slate-200 p-1.5 flex gap-1 animate-in fade-in zoom-in-95 duration-200' : 'absolute top-11 z-[60] bg-white shadow-2xl rounded-xl border border-slate-200 p-1.5 flex gap-1 animate-in fade-in zoom-in-95 duration-200',
            popoverAlign === 'right' ? "right-2" : "left-1/2 -translate-x-1/2"
          )}
        >
          <button onClick={handleView} className="flex flex-col items-center justify-center w-14 py-2 hover:bg-slate-50 rounded-lg transition-colors">
            <LayoutGrid size={16} className="mb-1 text-primary" strokeWidth={2.5}/>
            <span className="text-[8px] font-black uppercase text-slate-600">View</span>
          </button>
          <button onClick={handleTransferClick} disabled={!onTransfer} className="flex flex-col items-center justify-center w-14 py-2 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-30">
            <ArrowRightLeft size={16} className="mb-1 text-blue-600" strokeWidth={2.5}/>
            <span className="text-[8px] font-black uppercase text-slate-600">Trnsfr</span>
          </button>
          {isSharedTable ? (
            <button onClick={handleRemoveClick} disabled={!onRemove} className="flex flex-col items-center justify-center w-14 py-2 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-30">
              <X size={16} className="mb-1 text-red-600" strokeWidth={2.5}/>
              <span className="text-[8px] font-black uppercase text-slate-600">Remove</span>
            </button>
          ) : (
            <button onClick={handleShareClick} disabled={!onShare} className="flex flex-col items-center justify-center w-14 py-2 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-30">
              <GitMerge size={16} className="mb-1 text-violet-600" strokeWidth={2.5}/>
              <span className="text-[8px] font-black uppercase text-slate-600">Share</span>
            </button>
          )}
          <button onClick={handleEmpty} className="flex flex-col items-center justify-center w-14 py-2 hover:bg-slate-50 rounded-lg transition-colors">
            <CheckCircle size={16} className="mb-1 text-emerald-600" strokeWidth={2.5}/>
            <span className="text-[8px] font-black uppercase text-slate-600">Empty</span>
          </button>
        </div>
      )}

      {/* Edit button (Admin) */}
      {canManage && (
        <button
          onClick={handleEdit}
          className={clsx('absolute z-20 rounded bg-white/85 border border-white text-slate-500 hover:text-primary hover:border-primary/30 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity', compact ? 'right-8 top-1 w-4 h-4' : 'right-10 top-2 w-5 h-5')}
          title="Edit table"
        >
          <Pencil size={compact ? 9 : 10} />
        </button>
      )}

      {/* Card Body */}
      <div className={clsx('flex-1 flex flex-col', compact ? 'px-1.5 py-1' : 'p-2.5 pt-1.5')}>
        <div className={clsx('min-w-0 z-0', compact ? 'space-y-0.5' : 'space-y-1')}>
          {floorName && floorBadge && (
            <div>
              <span title={floorName} className={clsx('inline-flex max-w-full items-center truncate rounded border font-black uppercase', compact ? 'px-1 py-0 text-[7px]' : 'px-1.5 py-0.5 text-[8px] tracking-wide', floorBadge)}>
                {floorName}
              </span>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-1">
            <span title={table.status.replace(/_/g, ' ')} className={clsx('inline-flex min-w-0 shrink-0 items-center truncate rounded border font-black uppercase', compact ? 'px-1 py-0 text-[7px]' : 'px-1 py-0.5 text-[8px] tracking-wide', config.pill)}>
              {table.status.replace(/_/g, ' ')}
            </span>
            {activeOrder && (
              <span title={activeOrder.orderNo} className={clsx('inline-flex min-w-0 items-center truncate rounded border border-white/70 bg-white/70 font-black text-slate-600', compact ? 'px-1 py-0 text-[7px]' : 'px-1 py-0.5 text-[8px]')}>
                {activeOrder.orderNo}
              </span>
            )}
          </div>
        </div>

        {activeOrder && (
          <div className={clsx('mt-1.5 min-w-0 space-y-0.5', compact ? 'text-[7px]' : 'text-[10px]')}>
            <p className={clsx('whitespace-nowrap font-black', config.text)} title={`Order time ${orderTimeLabel}`}>
              Time: {orderTimeLabel}
            </p>
            <p className={clsx('whitespace-nowrap font-black', config.text)} title={`Waiting ${elapsedLabel}`}>
              Waiting: {elapsedLabel}
            </p>
          </div>
        )}

        {!activeOrder && (
          <div className={clsx('flex items-end justify-end w-full z-0 mt-auto', compact ? 'text-[8px]' : 'text-[9px]')}>
            <span className={clsx('font-black shrink-0', config.text)}>{config.action}</span>
          </div>
        )}
      </div>
    </div>
  )
}
