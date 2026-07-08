import { useState, useMemo } from 'react'
import { X, ArrowRightLeft } from 'lucide-react'
import type { RestaurantTable, KOT } from '../../lib/types'
import { useBillingStore } from '../../store/billingStore'
import { useUIStore } from '../../store/uiStore'

interface Props {
  sourceTable: RestaurantTable
  onClose: () => void
  onSuccess: () => void
}

export default function TransferKOTModal({ sourceTable, onClose, onSuccess }: Props) {
  const { tables, getActiveKOTs, transferKOTs } = useBillingStore()
  const { addToast } = useUIStore()
  
  const [targetTableId, setTargetTableId] = useState<string>('')
  const [selectedKotIds, setSelectedKotIds] = useState<Set<string>>(new Set())

  // Get KOTs belonging to the source table's active order
  const orderKOTs = useMemo(() => {
    if (!sourceTable.activeOrderId) return []
    return getActiveKOTs().filter(k => k.orderId === sourceTable.activeOrderId && k.status !== 'cancelled')
  }, [sourceTable.activeOrderId, getActiveKOTs])

  // Get available target tables (excluding current)
  const availableTables = useMemo(() => {
    return tables.filter(t => t.id !== sourceTable.id).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tables, sourceTable.id])

  const handleToggleKOT = (kotId: string) => {
    const next = new Set(selectedKotIds)
    if (next.has(kotId)) {
      next.delete(kotId)
    } else {
      next.add(kotId)
    }
    setSelectedKotIds(next)
  }

  const handleToggleAll = () => {
    if (selectedKotIds.size === orderKOTs.length) {
      setSelectedKotIds(new Set())
    } else {
      setSelectedKotIds(new Set(orderKOTs.map(k => k.id)))
    }
  }

  const handleTransfer = () => {
    if (!targetTableId) {
      addToast('error', 'Please select a counter/table')
      return
    }
    if (selectedKotIds.size === 0) {
      addToast('error', 'Select atleast 1 KOT to transfer')
      return
    }

    const success = transferKOTs(sourceTable.id, targetTableId, Array.from(selectedKotIds))
    if (success) {
      addToast('success', 'KOTs transferred successfully')
      onSuccess()
    } else {
      addToast('error', 'Failed to transfer KOTs')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <ArrowRightLeft size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">Transfer Items</h2>
              <p className="text-sm font-medium text-slate-500">From {sourceTable.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-6">
            {/* Target Selection */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Transfer items From {sourceTable.name} To :</label>
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full sm:w-1/2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-700 font-medium"
              >
                <option value="">--Select Counter--</option>
                {availableTables.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.status !== 'available' ? '(Occupied)' : ''}</option>
                ))}
              </select>
            </div>

            {/* KOT List */}
            <div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-amber-400 border-b border-slate-200">
                      <th className="py-3 px-4 text-center w-12">
                        <input 
                          type="checkbox" 
                          checked={selectedKotIds.size === orderKOTs.length && orderKOTs.length > 0}
                          onChange={handleToggleAll}
                          className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                        />
                      </th>
                      <th className="py-3 px-4 text-xs font-bold text-slate-800 uppercase tracking-wider">KOT Num</th>
                      <th className="py-3 px-4 text-xs font-bold text-slate-800 uppercase tracking-wider">Created On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderKOTs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-slate-500 font-medium bg-slate-50/50">
                          No active KOTs to transfer.
                        </td>
                      </tr>
                    ) : (
                      orderKOTs.map(kot => {
                        const isSelected = selectedKotIds.has(kot.id)
                        return (
                          <tr 
                            key={kot.id} 
                            onClick={() => handleToggleKOT(kot.id)}
                            className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="py-3 px-4 text-center">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => {}} // handled by row click
                                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer pointer-events-none"
                              />
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-700">{kot.kotNo}</td>
                            <td className="py-3 px-4 text-sm font-medium text-slate-500">
                              {new Date(kot.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            className="px-8 py-2.5 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-colors flex items-center gap-2"
          >
            <ArrowRightLeft size={18} strokeWidth={3} />
            Transfer
          </button>
        </div>
      </div>
    </div>
  )
}
