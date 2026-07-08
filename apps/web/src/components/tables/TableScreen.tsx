import { useState, useMemo, useEffect } from 'react'
import {
  Grid2X2, Layers3, LayoutGrid, Pencil, Plus, Rows3, Trash2, X,
  ArrowRightLeft, GitMerge, Info, ListTodo, AlertTriangle,
  ToggleLeft, ToggleRight,
} from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { hasPermission } from '../../lib/permissions'
import type { RestaurantTable, TableStatus } from '../../lib/types'
import { clsx } from 'clsx'
import FloorTabs from './FloorTabs'
import TableCard from './TableCard'
import BillingScreen from '../billing/BillingScreen'
import TransferKOTModal from './TransferKOTModal'

const SECTION_PRESETS = ['Ground Floor', 'AC Section', 'Non-AC Section', 'Family', 'Rooftop', 'Outdoor']

type TableModalType = 'transfer' | 'merge' | null

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export default function TableScreen() {
  const {
    addToast,
    tableCompactView,
    tableRightSidebarOpen,
    setTableCompactView,
    setTableRightSidebarOpen,
  } = useUIStore()
  const { user } = useAuthStore()
  const {
    tables, orders, floors,
    addFloor, updateFloor, deleteFloor,
    addTable, updateTable, deleteTable,
    transferTable, mergeTable, getActiveKOTs
  } = useBillingStore()

  const [activeFloorId, setActiveFloorId] = useState<string>('all')
  const compactView = tableCompactView
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null)
  const [billingModalTableId, setBillingModalTableId] = useState<string | null>(null)
  const isRightSidebarOpen = tableRightSidebarOpen
  const [dismissedPaymentWarning, setDismissedPaymentWarning] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Transfer / Merge state
  const [tableOpModal, setTableOpModal] = useState<TableModalType>(null)
  const [sourceTable, setSourceTable] = useState<RestaurantTable | null>(null)
  const [targetTableId, setTargetTableId] = useState<string>('')

  const canManageTables = user ? hasPermission(user.role, 'tables:manage') : false
  const canEditTables = canManageTables && editMode
  const canTransfer = user ? hasPermission(user.role, 'tables:transfer') : false
  const canMerge = user ? hasPermission(user.role, 'tables:merge') : false

  useEffect(() => {
    if (!editMode) {
      setEditingTable(null)
      setShowSectionModal(false)
      setShowTableModal(false)
    }
  }, [editMode])

  const filteredTables = useMemo(() => {
    let result = tables
    if (activeFloorId !== 'all') {
      result = tables.filter(t => t.floorId === activeFloorId)
    }
    return [...result].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [tables, activeFloorId])

  const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders])

  // Tables available for transfer (available status)
  const availableTablesForTransfer = useMemo(() =>
    tables.filter(t => t.status === 'available' && t.id !== sourceTable?.id),
    [tables, sourceTable]
  )

  // Tables with active orders for merge target
  const occupiedTablesForMerge = useMemo(() =>
    tables.filter(t => t.activeOrderId && t.id !== sourceTable?.id),
    [tables, sourceTable]
  )

  const activeKOTsGroups = useMemo(() => {
    const activeKots = getActiveKOTs()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const groups = new Map<string, typeof activeKots>()
    activeKots.forEach(kot => {
      const tableName = kot.tableName || 'Unknown Table'
      if (!groups.has(tableName)) groups.set(tableName, [])
      groups.get(tableName)!.push(kot)
    })
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [getActiveKOTs, orders])

  const paymentWarning = useMemo(() => {
    if (!user || dismissedPaymentWarning) return null
    const issues: string[] = []
    if (user.paymentReceived === false) issues.push('software payment is pending')
    if (user.renewalPaymentReceived === false) issues.push('renewal payment is pending')
    if (issues.length === 0) return null
    return {
      title: 'Payment confirmation required',
      message: `This client account is marked as ${issues.join(' and ')}. Billing can continue after acknowledging this reminder.`,
      note: user.paymentNote,
    }
  }, [dismissedPaymentWarning, user])

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleCreateSection = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    if (!name) return
    if (floors.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      addToast('error', 'Section already exists')
      return
    }
    addFloor(name)
    setShowSectionModal(false)
    addToast('success', `${name} section created`)
  }

  const handleCreateTables = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const floorId = String(fd.get('floorId') ?? '')
    const prefix = String(fd.get('prefix') ?? 'T').trim() || 'T'
    const startNo = Math.max(1, Number(fd.get('startNo') ?? 1))
    const count = Math.min(200, Math.max(1, Number(fd.get('count') ?? 1)))
    const seats = Math.min(50, Math.max(1, Number(fd.get('seats') ?? 4)))
    if (!floorId) { addToast('warning', 'Create a section before adding tables'); return }
    const customNames = String(fd.get('names') ?? '')
      .split(/[\n,]+/)
      .map(name => name.trim())
      .filter(Boolean)
    const requestedNames = customNames.length > 0
      ? customNames
      : Array.from({ length: count }, (_, index) => `${prefix}${startNo + index}`)
    const existingNames = new Set(tables.filter(table => table.floorId === floorId).map(table => table.name.trim().toLowerCase()))
    const uniqueNames: string[] = []
    requestedNames.forEach(name => {
      const normalized = name.toLowerCase()
      if (existingNames.has(normalized) || uniqueNames.some(existing => existing.toLowerCase() === normalized)) return
      uniqueNames.push(name)
    })
    if (uniqueNames.length === 0) {
      addToast('error', 'All requested table names already exist in this section')
      return
    }
    uniqueNames.forEach(name => addTable({ floorId, name, seats }))
    setActiveFloorId(floorId)
    setShowTableModal(false)
    const skipped = requestedNames.length - uniqueNames.length
    addToast('success', `${uniqueNames.length} table${uniqueNames.length > 1 ? 's' : ''} added${skipped > 0 ? `, ${skipped} duplicate skipped` : ''}`)
  }

  const handleDeleteSection = (floorId: string) => {
    if (!deleteFloor(floorId)) {
      addToast('error', 'Delete or move tables before deleting this section')
      return
    }
    if (activeFloorId === floorId) setActiveFloorId('all')
    addToast('success', 'Section deleted')
  }

  const handleUpdateTable = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingTable) return
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    const floorId = String(fd.get('floorId') ?? '')
    const seats = Math.min(50, Math.max(1, Number(fd.get('seats') ?? editingTable.seats)))
    const status = String(fd.get('status') ?? editingTable.status) as TableStatus
    if (!name || !floorId) return
    updateTable(editingTable.id, { name, floorId, seats, status })
    setEditingTable(null)
    addToast('success', 'Table updated')
  }

  const handleDeleteTable = () => {
    if (!editingTable) return
    if (!deleteTable(editingTable.id)) {
      addToast('error', 'Settle or cancel this order before deleting the table')
      return
    }
    setEditingTable(null)
    addToast('success', 'Table deleted')
  }

  const openTransfer = (table: RestaurantTable) => {
    setSourceTable(table)
    setTargetTableId('')
    setTableOpModal('transfer')
  }

  const openMerge = (table: RestaurantTable) => {
    setSourceTable(table)
    setTargetTableId('')
    setTableOpModal('merge')
  }

  const handleTransfer = () => {
    if (!sourceTable || !targetTableId) return
    const ok = transferTable(sourceTable.id, targetTableId)
    if (ok) {
      const targetName = tables.find(t => t.id === targetTableId)?.name ?? ''
      addToast('success', `Order transferred to ${targetName}`)
      setTableOpModal(null)
    } else {
      addToast('error', 'Transfer failed — target table must be available')
    }
  }

  const handleMerge = () => {
    if (!sourceTable || !targetTableId) return
    const ok = mergeTable(sourceTable.id, targetTableId)
    if (ok) {
      const targetName = tables.find(t => t.id === targetTableId)?.name ?? ''
      addToast('success', `${sourceTable.name} merged into ${targetName}`)
      setTableOpModal(null)
    } else {
      addToast('error', 'Merge failed — both tables must have active orders')
    }
  }

  const handleShareTable = (table: RestaurantTable) => {
    // Determine the base name and current parts
    const match = table.name.trim().match(/^(.*?)(?:\s+\(([a-z])\))?$/)
    if (!match) return
    const baseName = match[1].trim()
    const currentLetter = match[2]

    if (!currentLetter) {
      // First time sharing: rename original to (a) and create (b)
      updateTable(table.id, { name: `${baseName} (a)` })
      addTable({ floorId: table.floorId, name: `${baseName} (b)`, seats: table.seats })
      addToast('success', 'Table shared')
    } else {
      // Already shared, find the next available letter
      const existingTables = tables.filter(t => t.name.startsWith(baseName + ' ('))
      const letters = existingTables.map(t => {
        const m = t.name.match(/\(([a-z])\)$/)
        return m ? m[1] : ''
      }).filter(Boolean).sort()
      
      let nextLetter = 'b'
      for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(97 + i)
        if (!letters.includes(char)) {
          nextLetter = char
          break
        }
      }
      addTable({ floorId: table.floorId, name: `${baseName} (${nextLetter})`, seats: table.seats })
      addToast('success', 'Table shared')
    }
  }

  const handleRemoveTable = (table: RestaurantTable) => {
    if (table.activeOrderId) {
      addToast('error', 'Cannot remove table with an active order')
      return
    }

    const match = table.name.trim().match(/^(.*?)\s+\(([a-z])\)$/)
    if (!match) return
    const baseName = match[1].trim()

    if (!deleteTable(table.id)) {
      addToast('error', 'Failed to remove table')
      return
    }

    // Check how many siblings remain
    const siblings = tables.filter(t => t.id !== table.id && t.name.startsWith(baseName + ' ('))
    if (siblings.length === 1) {
      // If only one remains, revert its name
      updateTable(siblings[0].id, { name: baseName })
    }
    
    addToast('success', 'Table removed')
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white px-3 py-2.5 flex items-center gap-3 flex-shrink-0 relative z-20 border-b border-slate-100 overflow-x-auto scrollbar-hide">
        <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center text-primary flex-shrink-0 border border-primary/20 shadow-sm">
          <LayoutGrid size={18} strokeWidth={2.5} />
        </div>
        <div className="flex-shrink-0">
          <h1 className="text-lg font-black text-slate-800 leading-none tracking-tight">Tables</h1>
          <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Live dining status</p>
        </div>
        <div className="flex-1 min-w-max flex flex-nowrap items-center justify-start xl:justify-center gap-3 text-[9px] font-black text-slate-500 uppercase tracking-wider px-2 whitespace-nowrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-slate-300 bg-white" />Available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Occupied</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />KOT Sent / Preparing</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Ready</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" />Payment Pending</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" />Dirty</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setTableCompactView(false)} className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center transition-all', !compactView ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')} title="Card view"><Grid2X2 size={16} /></button>
          <button onClick={() => setTableCompactView(true)} className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center transition-all', compactView ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')} title="Compact view"><Rows3 size={16} /></button>
          {canManageTables && (
            <>
              <button
                onClick={() => setEditMode(value => !value)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black border transition-all active:scale-95',
                  editMode
                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700'
                )}
                title={editMode ? 'Disable table editing' : 'Enable table editing'}
              >
                {editMode ? <ToggleRight size={16} strokeWidth={3} /> : <ToggleLeft size={16} strokeWidth={3} />}
                Edit Tables
              </button>
              {editMode && (
                <>
              <button onClick={() => setShowSectionModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 rounded-lg text-xs font-black border border-slate-200 hover:border-primary/30 hover:text-primary hover:bg-primary-50 transition-all active:scale-95">
                <Layers3 size={15} strokeWidth={3} />Section
              </button>
              <button onClick={() => setShowTableModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-xs font-black shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95">
                <Plus size={15} strokeWidth={3} />Table
              </button>
                </>
              )}
            </>
          )}
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button 
            onClick={() => setTableRightSidebarOpen(!isRightSidebarOpen)} 
            className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center transition-all', isRightSidebarOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')} 
            title="Toggle active KOTs"
          >
            <ListTodo size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content (Tabs + Grid) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Floor Tabs */}
      <FloorTabs
        floors={floors}
        activeFloorId={activeFloorId}
        onSelect={setActiveFloorId}
        onRename={canEditTables ? (id, name) => { updateFloor(id, { name }); addToast('success', 'Section renamed') } : undefined}
        onDelete={canEditTables ? handleDeleteSection : undefined}
      />

      {/* Tables Grid */}
      <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50">
        <div className={clsx(
          'grid',
          compactView
            ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10 gap-1.5'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2'
        )}>
          {filteredTables.map(table => {
            const activeOrder = table.activeOrderId ? ordersById.get(table.activeOrderId) ?? null : null
            return (
              <TableCard
                key={table.id}
                table={table}
                activeOrder={activeOrder}
                compact={compactView}
                canManage={canEditTables}
                onEdit={() => setEditingTable(table)}
                onTransfer={canTransfer && table.activeOrderId ? () => openTransfer(table) : undefined}
                onMerge={canMerge && table.activeOrderId ? () => openMerge(table) : undefined}
                onShare={() => handleShareTable(table)}
                onRemove={() => handleRemoveTable(table)}
                onClick={() => setBillingModalTableId(table.id)}
              />
            )
          })}
        </div>

        {floors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 mt-10">
            <LayoutGrid size={40} className="mb-3 opacity-20" />
            <p className="font-medium text-lg text-slate-500">No floors or tables yet</p>
            <p className="text-sm text-slate-400 mt-1">Get started by creating your first dining area.</p>
            {canManageTables && <button onClick={() => setShowSectionModal(true)} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl shadow-sm text-sm font-bold hover:bg-primary-dark transition-colors">Create Section</button>}
          </div>
        ) : filteredTables.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 mt-10">
            <LayoutGrid size={40} className="mb-3 opacity-20" />
            <p className="font-medium text-lg text-slate-500">No tables found</p>
            <p className="text-sm text-slate-400 mt-1">There are no tables configured for this floor yet.</p>
          </div>
        )}
        </div>
        </div>
        
        {/* Right Sidebar: Active KOTs */}
        {isRightSidebarOpen && (
          <div className="w-72 lg:w-80 border-l border-slate-200 bg-white flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] overflow-hidden shrink-0 z-10 animate-in slide-in-from-right-8 duration-300">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo size={18} className="text-blue-600" />
                <h2 className="font-black text-slate-800 text-sm">Active KOTs</h2>
              </div>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full">
                {activeKOTsGroups.length} Tables
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/30">
              {activeKOTsGroups.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <ListTodo size={32} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-xs font-bold text-slate-500">No active KOTs</p>
                </div>
              ) : (
                activeKOTsGroups.map(([tableName, kots]) => {
                  // Find oldest KOT for elapsed time
                  const oldestKotTime = Math.min(...kots.map(k => new Date(k.createdAt).getTime()))
                  const elapsedLabel = formatElapsed(now - oldestKotTime)
                  
                  return (
                    <div key={tableName} className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-blue-50 px-3 py-2 flex items-center justify-between border-b border-blue-100">
                        <span className="font-black text-sm text-blue-900">{tableName}</span>
                        <span className="text-[10px] font-black text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-200">
                          {elapsedLabel}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {kots.flatMap(kot => kot.items).map((item, idx) => (
                          <div key={`${item.id}-${idx}`} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50">
                            <span className="text-xs font-semibold text-slate-700 truncate flex-1">{item.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-black text-slate-900 w-4 text-center">{item.quantity}</span>
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── TRANSFER MODAL ────────────────────────────────────────── */}
      {tableOpModal === 'transfer' && sourceTable && (
        <TransferKOTModal 
          sourceTable={sourceTable} 
          onClose={() => setTableOpModal(null)} 
          onSuccess={() => setTableOpModal(null)} 
        />
      )}

      {/* ── MERGE MODAL ───────────────────────────────────────────── */}
      {tableOpModal === 'merge' && sourceTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 border border-violet-200">
                  <GitMerge size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Merge Tables</h2>
                  <p className="text-xs text-slate-500 font-bold">Combine <span className="text-violet-600">{sourceTable.name}</span>'s order into another</p>
                </div>
              </div>
              <button onClick={() => setTableOpModal(null)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Warning */}
              <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-amber-700">All items from <strong>{sourceTable.name}</strong> will be added to the target table's order. {sourceTable.name} will become available.</p>
              </div>

              {/* Target table selection */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Select Target Table (With Active Order)</p>
                {occupiedTablesForMerge.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <GitMerge size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold">No occupied tables</p>
                    <p className="text-xs mt-1">Need another table with an active order to merge into.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                    {occupiedTablesForMerge.map(t => {
                      const order = t.activeOrderId ? ordersById.get(t.activeOrderId) : null
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTargetTableId(t.id)}
                          className={clsx(
                            'p-3 rounded-xl border-2 text-center font-black text-sm transition-all',
                            targetTableId === t.id
                              ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50'
                          )}
                        >
                          {t.name}
                          {order && <p className="text-[10px] font-bold text-slate-400 mt-0.5">{order.orderNo}</p>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setTableOpModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-black hover:bg-slate-200 transition-colors">Cancel</button>
                <button
                  onClick={handleMerge}
                  disabled={!targetTableId}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-black hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200 disabled:opacity-40"
                >
                  <GitMerge size={15} className="inline mr-1.5" />
                  Merge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE SECTION MODAL ──────────────────────────────────── */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Add Dining Section</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">AC, Non-AC, Rooftop, Family and more</p>
              </div>
              <button onClick={() => setShowSectionModal(false)} className="w-9 h-9 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateSection} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Section Name</label>
                <input name="name" required autoFocus placeholder="e.g. AC Section" className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" />
              </div>
              <div className="flex flex-wrap gap-2">
                {SECTION_PRESETS.map(name => (
                  <button key={name} type="button" onClick={e => {
                    const input = e.currentTarget.closest('form')?.querySelector<HTMLInputElement>('input[name="name"]')
                    if (input) input.value = name
                  }} className="px-3 py-2 rounded-xl text-xs font-black bg-primary-50 text-primary border border-primary/10 hover:bg-primary hover:text-white transition-colors">{name}</button>
                ))}
              </div>
              <button type="submit" className="w-full py-3 bg-primary text-white rounded-2xl font-black hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">Create Section</button>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE TABLES MODAL ───────────────────────────────────── */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Add Tables</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Create one or many tables inside a section</p>
              </div>
              <button onClick={() => setShowTableModal(false)} className="w-9 h-9 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateTables} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Section</label>
                <select name="floorId" required defaultValue={activeFloorId !== 'all' ? activeFloorId : floors[0]?.id ?? ''} className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 bg-white">
                  <option value="" disabled>Create a section first</option>
                  {floors.filter(f => f.isActive).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Prefix</label>
                  <input name="prefix" defaultValue="T" className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Start No.</label>
                  <input name="startNo" type="number" min="1" defaultValue={tables.length + 1} className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Count</label>
                  <input name="count" type="number" min="1" max="200" defaultValue="1" className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Seats</label>
                  <input name="seats" type="number" min="1" max="50" defaultValue="4" className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Bulk custom names</label>
                <textarea
                  name="names"
                  rows={3}
                  placeholder={'Optional: paste names separated by comma or new line\nT1, T2, Rooftop 1, Rooftop 2'}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-primary/50"
                />
                <p className="mt-2 text-[11px] font-bold text-slate-400">If this is filled, Prefix / Start No. / Count are ignored. Duplicate names in the same section are skipped.</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 20, 50].map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={event => {
                      const input = event.currentTarget.closest('form')?.querySelector<HTMLInputElement>('input[name="count"]')
                      if (input) input.value = String(value)
                    }}
                    className="rounded-xl border border-primary/20 bg-primary-50 py-2 text-xs font-black text-primary hover:bg-primary hover:text-white"
                  >
                    {value} tables
                  </button>
                ))}
              </div>
              <button type="submit" disabled={floors.length === 0} className="w-full py-3 bg-primary text-white rounded-2xl font-black hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-50">Add Tables</button>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT TABLE MODAL ──────────────────────────────────────── */}
      {editingTable && canEditTables && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">Edit Table — {editingTable.name}</h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Admin table controls</p>
              </div>
              <button onClick={() => setEditingTable(null)} className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>
            </div>
            <form onSubmit={handleUpdateTable} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Table Name</label>
                  <input name="name" required defaultValue={editingTable.name} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Seats</label>
                  <input name="seats" type="number" min="1" max="50" required defaultValue={editingTable.seats} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Section</label>
                  <select name="floorId" required defaultValue={editingTable.floorId} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 bg-white">
                    {floors.filter(f => f.isActive).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Status</label>
                  <select name="status" required defaultValue={editingTable.status} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 bg-white">
                    {(['available', 'occupied', 'kot_sent', 'preparing', 'ready', 'bill_requested', 'payment_pending', 'reserved', 'dirty'] as TableStatus[]).map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={handleDeleteTable} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-black hover:bg-red-100 transition-colors">
                  <Trash2 size={15} />Delete
                </button>
                <button type="submit" className="ml-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">
                  <Pencil size={15} />Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── BILLING MODAL ────────────────────────────────────────── */}
      {billingModalTableId && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200">
          <BillingScreen 
              isModal={true} 
              modalTableId={billingModalTableId} 
              onCloseModal={() => setBillingModalTableId(null)} 
            />
          {paymentWarning && (
            <div className="absolute inset-0 z-[70] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-white border border-red-100 shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-red-100 bg-red-50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-red-100 text-red-600 flex items-center justify-center">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">{paymentWarning.title}</h2>
                    <p className="text-xs font-bold text-red-700 mt-0.5">Admin payment reminder</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-sm font-bold text-slate-700 leading-relaxed">{paymentWarning.message}</p>
                  {paymentWarning.note && <p className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">{paymentWarning.note}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setBillingModalTableId(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200">CANCEL BILLING</button>
                    <button onClick={() => setDismissedPaymentWarning(true)} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white hover:bg-primary-dark">CONTINUE</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
