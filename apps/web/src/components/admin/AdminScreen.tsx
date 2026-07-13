import { useMemo, useState } from 'react'
import { Activity, ChefHat, Eye, EyeOff, Layers, Plus, Receipt, ShieldCheck, Trash2, Users } from 'lucide-react'
import { clsx } from 'clsx'
import type { Role } from '../../lib/types'
import type { Station } from '../../lib/types'
import { useStaffStore, type StaffAccount } from '../../store/staffStore'
import { useUIStore } from '../../store/uiStore'
import { useBillingStore, type DataDeletionSection } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'
import { createCloudStaff, updateCloudStaff } from '../../lib/cloudSync'
import { normalizeNetworkPrinterAddress } from '../../lib/printer'

type AdminTab = 'staff' | 'floors' | 'stations' | 'taxes' | 'data' | 'audit'

const ROLES: Role[] = ['owner', 'admin', 'manager', 'cashier', 'captain', 'kitchen', 'inventory', 'viewer']

const ROLE_COLORS: Record<Role, string> = {
  owner: 'bg-purple-50 text-purple-700 border-purple-200',
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  cashier: 'bg-teal-50 text-teal-700 border-teal-200',
  captain: 'bg-amber-50 text-amber-700 border-amber-200',
  kitchen: 'bg-orange-50 text-orange-700 border-orange-200',
  inventory: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  viewer: 'bg-slate-100 text-slate-700 border-slate-300',
}

function emptyStaff(tenantId = 'local_restaurant'): StaffAccount {
  return {
    id: '',
    tenantId,
    name: '',
    email: '',
    phone: '',
    role: 'cashier',
    status: 'active',
    pin: '',
    password: '',
    createdAt: new Date().toISOString(),
  }
}

function emptyStation(): Station {
  return {
    id: '',
    outletId: 'out_local',
    name: '',
    appIp: '',
    printerTarget: '',
    printerMode: 'default',
  }
}

export default function AdminScreen() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<AdminTab>('staff')
  const [editingStaff, setEditingStaff] = useState<StaffAccount | null>(null)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [editingStation, setEditingStation] = useState<Station | null>(null)
  const [showStationModal, setShowStationModal] = useState(false)
  const { addToast } = useUIStore()
  const { staff, addStaff, updateStaff, setStaffStatus, removeStaff } = useStaffStore()
  const {
    floors,
    tables,
    stations,
    menuItems,
    menuCategories,
    inventoryItems,
    orders,
    orderItems,
    kots,
    payments,
    auditLogs,
    cloudSync,
    addFloor,
    updateFloor,
    deleteFloor,
    addTable,
    updateTable,
    deleteTable,
    addStation,
    updateStation,
    deleteStation,
    deleteDataSection,
  } = useBillingStore()
  const cloudAuth = { accountLogin: cloudSync.accountLogin, accountSecret: cloudSync.accountSecret }
  const shouldSyncCloud = cloudSync.enabled && Boolean(cloudSync.serverUrl) && user?.tenantId !== 'local_restaurant'
  const isPlatformAdmin = user?.tenantId === 'platform' && user.role === 'admin'
  const visibleTabs = isPlatformAdmin
    ? [
        { id: 'staff', label: 'Client Accounts', icon: Users },
      ]
    : [
        { id: 'staff', label: 'Staff & Roles', icon: Users },
        { id: 'floors', label: 'Floors & Tables', icon: Layers },
        { id: 'stations', label: 'Kitchen Stations', icon: ChefHat },
        { id: 'taxes', label: 'Taxes & Charges', icon: Receipt },
        { id: 'data', label: 'Data Deletion', icon: Trash2 },
      ]

  const sortedStaff = useMemo(
    () => staff
      .filter((account) => {
        if (isPlatformAdmin) {
          return account.role === 'admin'
        }
        return account.tenantId === user?.tenantId
      })
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    [staff, isPlatformAdmin, user?.tenantId]
  )

  const openAddStaff = () => {
    setEditingStaff(null)
    setShowStaffModal(true)
  }

  const openEditStaff = (account: StaffAccount) => {
    setEditingStaff(account)
    setShowStaffModal(true)
  }

  const openAddStation = () => {
    setEditingStation(emptyStation())
    setShowStationModal(true)
  }

  const openEditStation = (station: Station) => {
    setEditingStation(station)
    setShowStationModal(true)
  }

  const dataDeletionSections: Array<{
    id: DataDeletionSection
    title: string
    description: string
    count: number
    danger?: boolean
  }> = [
    { id: 'orders', title: 'Orders, KOTs & Payments', description: 'Deletes sales orders, order items, KOTs, payments, open carts, and clears active table links.', count: orders.length + orderItems.length + kots.length + payments.length, danger: true },
    { id: 'payments', title: 'Payment Records Only', description: 'Deletes payment entries and resets paid orders back to unpaid/billed status.', count: payments.length, danger: true },
    { id: 'menu', title: 'Menu Categories & Items', description: 'Deletes all menu categories, products, and unsaved carts.', count: menuCategories.length + menuItems.length, danger: true },
    { id: 'floorsTables', title: 'Floors & Tables', description: 'Deletes floors and tables, clears table selections, and removes table names from existing orders.', count: floors.length + tables.length, danger: true },
    { id: 'kitchenStations', title: 'Kitchen Stations', description: 'Resets kitchen stations to defaults and removes station assignment from menu items.', count: stations.length },
    { id: 'inventory', title: 'Inventory & Recipes', description: 'Deletes inventory stock records and clears recipes from menu items.', count: inventoryItems.length, danger: true },
    { id: 'auditLogs', title: 'Audit History', description: 'Deletes the local audit-history list.', count: auditLogs.length, danger: true },
    { id: 'allBusinessData', title: 'All Business Data', description: 'Deletes menu, tables, stations, inventory, orders, KOTs, payments, carts, and audit data. Outlet and print settings are kept.', count: menuCategories.length + menuItems.length + floors.length + tables.length + inventoryItems.length + orders.length + orderItems.length + kots.length + payments.length + auditLogs.length, danger: true },
  ]

  const handleDeleteData = (section: DataDeletionSection, title: string) => {
    const confirmation = window.prompt(`Type DELETE to permanently clear: ${title}`)
    if (confirmation !== 'DELETE') {
      addToast('warning', 'Data deletion cancelled')
      return
    }
    deleteDataSection(section)
    addToast('success', `${title} cleared`)
  }

  const handleSaveStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const password = String(form.get('password') ?? '').trim()
    const role = String(form.get('role') ?? 'cashier') as Role
    const status = String(form.get('status') ?? 'active') as StaffAccount['status']
    const pin = String(form.get('pin') ?? '').trim()
    const accessStartsAt = String(form.get('accessStartsAt') ?? '').trim()
    const accessEndsAt = String(form.get('accessEndsAt') ?? '').trim()
    const restaurantName = String(form.get('restaurantName') ?? '').trim()
    const paymentReceived = form.get('paymentReceived') === 'on'
    const renewalPaymentReceived = form.get('renewalPaymentReceived') === 'on'
    const paymentNote = String(form.get('paymentNote') ?? '').trim()
    const tenantId = isPlatformAdmin
      ? editingStaff?.tenantId || `ten_${crypto.randomUUID()}`
      : user?.tenantId || 'local_restaurant'
    const finalRole = isPlatformAdmin ? 'admin' : role

    if (!name || (!email && !phone) || (!editingStaff && !password)) {
      addToast('error', 'Name, contact, and password are required')
      return
    }
    if (isPlatformAdmin && !restaurantName) {
      addToast('error', 'Restaurant name is required for client accounts')
      return
    }

    try {
      if (editingStaff) {
        const updated: StaffAccount = {
          ...editingStaff,
          name,
          email: email || undefined,
          phone: phone || undefined,
          password: password || editingStaff.password,
          role: finalRole,
          status,
          pin: pin || undefined,
          accessStartsAt: accessStartsAt || undefined,
          accessEndsAt: accessEndsAt || undefined,
          tenantId,
          restaurantName: restaurantName || undefined,
          paymentReceived,
          renewalPaymentReceived,
          paymentNote: paymentNote || undefined,
        }
        if (shouldSyncCloud) await updateCloudStaff(updated, cloudSync.serverUrl, cloudAuth)
        updateStaff(editingStaff.id, updated)
        addToast('success', `${name}'s account was updated`)
      } else {
        const account = addStaff({ name, email, phone, password, role: finalRole, status, pin, accessStartsAt, accessEndsAt, tenantId, restaurantName, paymentReceived, renewalPaymentReceived, paymentNote })
        if (shouldSyncCloud) {
          try {
            await createCloudStaff(account, cloudSync.serverUrl, cloudAuth)
          } catch (error) {
            removeStaff(account.id)
            throw error
          }
        }
        addToast('success', isPlatformAdmin ? `${restaurantName} client admin was created` : `${name}'s staff login was created`)
      }
      setShowStaffModal(false)
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to save staff account')
    }
  }

  const handleSaveStation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const appIp = String(form.get('appIp') ?? '').trim()
    const printerMode = String(form.get('printerMode') ?? 'default') as Station['printerMode']
    const printerTargetInput = String(form.get('printerTarget') ?? '').trim()
    const printerTarget = printerMode === 'lan'
      ? (normalizeNetworkPrinterAddress(printerTargetInput) || printerTargetInput)
      : printerTargetInput

    if (!name) {
      addToast('error', 'Kitchen name is required')
      return
    }

    const exists = stations.some(candidate => candidate.id !== editingStation?.id && candidate.name.trim().toLowerCase() === name.toLowerCase())
    if (exists) {
      addToast('error', 'This kitchen station already exists')
      return
    }

    const payload = {
      name,
      appIp: appIp || undefined,
      printerTarget: printerTarget || undefined,
      printerMode,
    }

    if (editingStation?.id) {
      updateStation(editingStation.id, payload)
      addToast('success', 'Kitchen station updated', 'Station Saved')
    } else {
      addStation(name, payload)
      addToast('success', 'Kitchen station created', 'Station Saved')
    }

    setShowStationModal(false)
    setEditingStation(null)
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="bg-white border-b-2 border-slate-100 px-4 py-3 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-700 flex-shrink-0 border border-slate-200 shadow-inner">
            <ShieldCheck size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">{isPlatformAdmin ? 'Software Admin Panel' : 'Admin Panel'}</h1>
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              {isPlatformAdmin ? 'Create and manage restaurant owner accounts' : 'Restaurant setup, staff logins, and audit history'}
            </p>
          </div>
        </div>
        <button
          onClick={() => addToast('success', 'Exporting audit logs...')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-2 border-slate-200 text-slate-600 text-xs font-black rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-95 shadow-sm"
        >
          <Activity size={14} strokeWidth={2.5} /> EXPORT
        </button>
      </div>

      <div className="px-4 pt-4 bg-white border-b-2 border-slate-100 flex gap-6 overflow-x-auto scrollbar-hide flex-shrink-0 relative z-10 shadow-sm">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AdminTab)}
            className={clsx(
              'flex items-center gap-2.5 pb-4 font-black text-sm transition-all border-b-4 relative top-[2px]',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            )}
          >
            <tab.icon size={18} strokeWidth={2.5} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {activeTab === 'staff' && (
          <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="p-4 border-b-2 border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">{isPlatformAdmin ? 'Client Restaurant Accounts' : 'Staff Login Management'}</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                  {isPlatformAdmin ? 'Create one owner/admin login per restaurant. They manage their own chef, captain, cashier, and kitchen team.' : 'Admins create every staff ID/password and can change access anytime.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPasswords(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-slate-200 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
                >
                  {showPasswords ? <EyeOff size={14} strokeWidth={2.5} /> : <Eye size={14} strokeWidth={2.5} />}
                  {showPasswords ? 'HIDE' : 'SHOW'}
                </button>
                <button
                  onClick={openAddStaff}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-xs font-black rounded-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 border-2 border-primary/50"
                >
                  <Plus size={14} strokeWidth={2.5} /> {isPlatformAdmin ? 'ADD CLIENT' : 'ADD STAFF'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 border-b-2 border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Name</th>
                    {isPlatformAdmin && <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Restaurant</th>}
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Login ID</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Password</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">PIN</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Role</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Status</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Access Duration</th>
                    {isPlatformAdmin && <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Payment</th>}
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-50">
                  {sortedStaff.map(account => (
                    <tr key={account.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-4 py-2.5 font-black text-slate-800 group-hover:text-primary transition-colors">{account.name}</td>
                      {isPlatformAdmin && <td className="px-4 py-2.5 font-bold text-slate-600">{account.restaurantName || 'Restaurant Account'}</td>}
                      <td className="px-4 py-2.5 text-slate-600 font-bold">
                        {account.email || account.phone}
                        {account.email && account.phone && <span className="block text-[9px] text-slate-400 mt-0.5">{account.phone}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-slate-700">{showPasswords ? account.password : '••••••••'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-slate-700">{showPasswords ? account.pin || '-' : '••••'}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border inline-block', ROLE_COLORS[account.role])}>
                          {account.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={clsx(
                          'px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border inline-block',
                          account.status === 'active'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : account.status === 'halted'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-600 border-red-200'
                        )}>
                          {account.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[10px] font-bold text-slate-500">
                        <span className="block">{account.accessStartsAt ? new Date(account.accessStartsAt).toLocaleDateString('en-IN') : 'Now'}</span>
                        <span className="block">{account.accessEndsAt ? `Until ${new Date(account.accessEndsAt).toLocaleDateString('en-IN')}` : 'No expiry'}</span>
                      </td>
                      {isPlatformAdmin && (
                        <td className="px-4 py-2.5 text-[10px] font-bold">
                          <span className={clsx('block', account.paymentReceived === false ? 'text-red-600' : 'text-emerald-600')}>Payment: {account.paymentReceived === false ? 'Pending' : 'Received'}</span>
                          <span className={clsx('block', account.renewalPaymentReceived === false ? 'text-red-600' : 'text-emerald-600')}>Renewal: {account.renewalPaymentReceived === false ? 'Pending' : 'Received'}</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-[10px]">
                        <button onClick={() => openEditStaff(account)} className="text-primary hover:underline font-black mr-3 tracking-wider uppercase">Edit</button>
                        <button
                          onClick={async () => {
                            const nextStatus = account.status === 'active' ? 'halted' : 'active'
                            try {
                              if (shouldSyncCloud) await updateCloudStaff({ ...account, status: nextStatus }, cloudSync.serverUrl, cloudAuth)
                              setStaffStatus(account.id, nextStatus)
                              addToast('success', `${account.name} is now ${nextStatus}`)
                            } catch (error) {
                              addToast('error', error instanceof Error ? error.message : 'Could not update cloud staff')
                            }
                          }}
                          className={clsx('hover:underline font-black tracking-wider uppercase mr-3', account.status === 'active' ? 'text-amber-600' : 'text-emerald-600')}
                        >
                          {account.status === 'active' ? 'Halt' : 'Activate'}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              if (shouldSyncCloud) await updateCloudStaff({ ...account, status: 'inactive' }, cloudSync.serverUrl, cloudAuth)
                              setStaffStatus(account.id, 'inactive')
                              addToast('success', `${account.name} is now deactivated`)
                            } catch (error) {
                              addToast('error', error instanceof Error ? error.message : 'Could not update cloud staff')
                            }
                          }}
                          className="hover:underline font-black tracking-wider uppercase text-red-500"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'floors' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
              <div className="p-4 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-black text-slate-800 tracking-tight">Floors</h3>
                <button
                  onClick={() => {
                    const name = window.prompt('Floor name')
                    if (name?.trim()) {
                      addFloor(name.trim())
                      addToast('success', 'Floor added')
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-slate-200 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
                >
                  <Plus size={14} strokeWidth={2.5} /> ADD FLOOR
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 overflow-y-auto max-h-[250px]">
                {floors.length === 0 && <p className="text-xs font-bold text-slate-400">No floors yet.</p>}
                {floors.map(floor => (
                  <div key={floor.id} className="p-3 rounded-xl border-2 border-slate-100 bg-slate-50 flex items-center justify-between group hover:border-slate-200 transition-colors">
                    <span className="font-black text-slate-800 text-sm">{floor.name}</span>
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => {
                          const name = window.prompt('Floor name', floor.name)
                          if (name?.trim()) updateFloor(floor.id, { name: name.trim() })
                        }}
                        className="text-slate-400 hover:text-primary transition-colors text-[9px] font-black uppercase tracking-wider"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!deleteFloor(floor.id)) addToast('error', 'Move or delete tables before deleting this floor')
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors text-[9px] font-black uppercase tracking-wider"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col">
              <div className="p-4 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-black text-slate-800 tracking-tight">Tables</h3>
                <button
                  onClick={() => {
                    if (floors.length === 0) {
                      addToast('error', 'Create a floor first')
                      return
                    }
                    addTable({ floorId: floors[0].id, name: `T${tables.length + 1}`, seats: 4 })
                    addToast('success', 'Table added')
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-xs font-black rounded-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 border-2 border-primary/50"
                >
                  <Plus size={14} strokeWidth={2.5} /> ADD TABLE
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[350px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 border-b-2 border-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Table Name</th>
                      <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Floor</th>
                      <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Seats</th>
                      <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-50">
                    {tables.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-bold">No tables yet.</td>
                      </tr>
                    )}
                    {tables.map(table => {
                      const floor = floors.find(f => f.id === table.floorId)
                      return (
                        <tr key={table.id} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-4 py-2.5 font-black text-slate-800">{table.name}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-600">{floor?.name}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-600">{table.seats}</td>
                          <td className="px-4 py-2.5 text-right text-[10px]">
                            <button
                              onClick={() => {
                                const name = window.prompt('Table name', table.name)
                                if (name?.trim()) updateTable(table.id, { name: name.trim() })
                              }}
                              className="text-primary hover:underline font-black mr-3 tracking-wider uppercase"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (!deleteTable(table.id)) addToast('error', 'Cannot delete a table with an active order')
                              }}
                              className="text-red-500 hover:underline font-black tracking-wider uppercase"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stations' && (
          <div className="max-w-4xl bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="p-4 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">Kitchen Stations</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Products assigned here appear in kitchen station filters and KOT routing.</p>
              </div>
              <button
                onClick={openAddStation}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-xs font-black rounded-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 border-2 border-primary/50"
              >
                <Plus size={14} strokeWidth={2.5} /> ADD STATION
              </button>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 border-b-2 border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">ID</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Kitchen Name</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">App IP</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Printer Target</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px]">Assigned Items</th>
                    <th className="px-4 py-2.5 font-black uppercase tracking-widest text-[10px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-50">
                  {stations.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-bold">No kitchens yet.</td>
                    </tr>
                  )}
                  {stations.map((station, index) => {
                    const assignedCount = menuItems.filter(item => item.stationId === station.id).length
                    return (
                      <tr key={station.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-4 py-2.5 font-black text-slate-500">{index + 1}</td>
                        <td className="px-4 py-2.5 font-black text-slate-800">{station.name}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-600">{station.appIp || '-'}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-600">
                          {station.printerTarget || 'Default printer settings'}
                          {station.printerMode && station.printerMode !== 'default' ? <span className="block text-[9px] uppercase tracking-wider text-slate-400">{station.printerMode}</span> : null}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-600">{assignedCount}</td>
                        <td className="px-4 py-2.5 text-right text-[10px]">
                          <button
                            onClick={() => openEditStation(station)}
                            className="text-primary hover:underline font-black mr-3 tracking-wider uppercase"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (!deleteStation(station.id)) {
                                addToast('error', 'Reassign menu items before deleting this station')
                                return
                              }
                              addToast('success', 'Kitchen station deleted')
                            }}
                            className="text-red-500 hover:underline font-black tracking-wider uppercase"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'taxes' && (
          <div className="max-w-3xl bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
             <div className="p-4 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-black text-slate-800 tracking-tight">Tax Slabs</h3>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-slate-200 text-slate-700 text-xs font-black rounded-lg hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
                <Plus size={14} strokeWidth={2.5} /> ADD TAX
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { name: 'GST 5%', percent: 5, active: true },
                { name: 'GST 12%', percent: 12, active: true },
                { name: 'GST 18%', percent: 18, active: true },
                { name: 'Service Charge', percent: 10, active: false },
              ].map(tax => (
                <div key={tax.name} className="flex items-center justify-between p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 group hover:border-slate-200 transition-colors">
                  <div>
                    <h4 className="font-black text-slate-800 text-sm">{tax.name}</h4>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">{tax.percent}% applied on subtotal</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={clsx('px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border', tax.active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-200 text-slate-500 border-slate-300')}>
                      {tax.active ? 'Enabled' : 'Disabled'}
                    </span>
                    <button className="text-primary hover:underline text-[10px] font-black uppercase tracking-wider">Edit</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="max-w-5xl bg-white rounded-2xl border-2 border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
            <div className="p-4 border-b-2 border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-black text-slate-800 tracking-tight">Section-wise Data Deletion</h3>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">Use these actions when resetting demo data or cleaning a section. Outlet information and print settings are not deleted.</p>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {dataDeletionSections.map(section => (
                <div key={section.id} className={clsx(
                  'p-4 rounded-xl border-2 bg-slate-50 flex flex-col gap-3',
                  section.id === 'allBusinessData' ? 'md:col-span-2 border-red-200 bg-red-50/60' : 'border-slate-100'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{section.title}</h4>
                      <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">{section.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-600">{section.count}</span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDeleteData(section.id, section.title)}
                      disabled={section.count === 0 && section.id !== 'kitchenStations'}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
                        section.danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-900 text-white hover:bg-slate-800'
                      )}
                    >
                      <Trash2 size={14} strokeWidth={2.5} /> DELETE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {showStaffModal && (
        <StaffModal
          account={editingStaff ?? emptyStaff(user?.tenantId || 'local_restaurant')}
          isEditing={Boolean(editingStaff)}
          isPlatformAdmin={isPlatformAdmin}
          onClose={() => setShowStaffModal(false)}
          onSubmit={handleSaveStaff}
        />
      )}

      {showStationModal && editingStation && (
        <StationModal
          station={editingStation}
          isEditing={Boolean(editingStation.id)}
          onClose={() => {
            setShowStationModal(false)
            setEditingStation(null)
          }}
          onSubmit={handleSaveStation}
        />
      )}
    </div>
  )
}

function StaffModal({
  account,
  isEditing,
  isPlatformAdmin,
  onClose,
  onSubmit,
}: {
  account: StaffAccount
  isEditing: boolean
  isPlatformAdmin: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl md:rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-in-up border border-slate-100 max-h-[92dvh] flex flex-col">
        <div className="px-5 py-4 md:px-8 md:py-6 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div>
            <h3 className="text-lg md:text-2xl font-black text-slate-800 tracking-tight">
              {isPlatformAdmin ? (isEditing ? 'Edit Client Account' : 'Create Client Account') : (isEditing ? 'Edit Staff Login' : 'Create Staff Login')}
            </h3>
            <p className="text-[10px] md:text-sm font-bold text-slate-500 mt-1 leading-normal">
              {isPlatformAdmin ? 'Create the restaurant owner/admin login you will hand over to the client.' : 'This ID/password is what staff will use on the login screen.'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors flex-shrink-0">
            <Plus size={20} className="rotate-45" strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 md:p-8 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {isPlatformAdmin && (
              <label className="block md:col-span-2">
                <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Restaurant / Client Name</span>
                <input name="restaurantName" required defaultValue={account.restaurantName} placeholder="e.g. Grand Spice Kitchen" className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
              </label>
            )}
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">{isPlatformAdmin ? 'Owner/Admin Name' : 'Staff Name'}</span>
              <input name="name" required defaultValue={account.name} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
            {isPlatformAdmin ? (
              <label className="block">
                <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Role</span>
                <input type="hidden" name="role" value="admin" />
                <div className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-500 bg-slate-50">Client Admin</div>
              </label>
            ) : (
              <label className="block">
                <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Role</span>
                <select name="role" required defaultValue={account.role} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white capitalize">
                  {ROLES.filter(role => role !== 'owner').map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Email Login ID</span>
              <input name="email" type="email" defaultValue={account.email} placeholder="cashier@restaurant.com" className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Phone Login ID</span>
              <input name="phone" defaultValue={account.phone} placeholder="9876543210" className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            <label className="block md:col-span-2">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Password</span>
              <input name="password" required={!isEditing} defaultValue={account.password} placeholder={isEditing ? 'Leave blank to keep existing' : 'Create password'} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Manager PIN</span>
              <input name="pin" defaultValue={account.pin} maxLength={6} placeholder="1234" className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Status</span>
            <select name="status" required defaultValue={account.status} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white">
              <option value="active">Active</option>
              <option value="halted">Halted</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Access Starts</span>
              <input name="accessStartsAt" type="date" defaultValue={account.accessStartsAt?.slice(0, 10) ?? ''} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
            <label className="block">
              <span className="block text-xs md:text-sm font-black text-slate-700 mb-1.5 uppercase tracking-wider">Access Ends</span>
              <input name="accessEndsAt" type="date" defaultValue={account.accessEndsAt?.slice(0, 10) ?? ''} className="w-full px-3.5 py-2.5 md:px-4 md:py-3 rounded-xl md:rounded-2xl border-2 border-slate-200 text-sm md:text-base font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
            </label>
          </div>

          {isPlatformAdmin && (
            <div className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 px-3 py-3 cursor-pointer">
                  <input name="paymentReceived" type="checkbox" defaultChecked={account.paymentReceived !== false} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Payment received</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 px-3 py-3 cursor-pointer">
                  <input name="renewalPaymentReceived" type="checkbox" defaultChecked={account.renewalPaymentReceived !== false} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Renewal payment received</span>
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Payment note</span>
                <input name="paymentNote" defaultValue={account.paymentNote} placeholder="Optional note shown in billing warning" className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white" />
              </label>
            </div>
          )}

          <div className="pt-4 flex gap-3 flex-shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-3 md:py-4 bg-slate-100 text-slate-600 font-black rounded-xl md:rounded-2xl hover:bg-slate-200 transition-colors border-2 border-transparent active:scale-[0.98] text-xs md:text-sm">
              CANCEL
            </button>
            <button type="submit" className="flex-1 py-3 md:py-4 bg-primary text-white font-black rounded-xl md:rounded-2xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/30 border-2 border-primary/50 active:scale-[0.98] text-xs md:text-sm">
              {isEditing ? 'SAVE CHANGES' : 'CREATE LOGIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StationModal({
  station,
  isEditing,
  onClose,
  onSubmit,
}: {
  station: Station
  isEditing: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100">
        <div className="px-5 py-4 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{isEditing ? 'Edit Kitchen Station' : 'Add Kitchen Station'}</h3>
            <p className="text-[10px] font-bold text-slate-500 mt-1">Assign a printer route for LAN, Bluetooth, USB, or wired printing.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
            <Plus size={18} className="rotate-45" strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Kitchen Name</span>
              <input name="name" required defaultValue={station.name} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">App / Device IP</span>
              <input name="appIp" defaultValue={station.appIp} placeholder="Optional kitchen screen IP" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm" />
            </label>
            <label className="block">
              <span className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Printer Connection</span>
              <select name="printerMode" defaultValue={station.printerMode || 'default'} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm bg-white">
                <option value="default">Use outlet default printer</option>
                <option value="lan">LAN / network printer</option>
                <option value="bluetooth">Bluetooth Windows queue</option>
                <option value="usb">USB printer queue</option>
                <option value="wired">Wired Windows queue</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Printer Target</span>
              <input
                name="printerTarget"
                defaultValue={station.printerTarget}
                placeholder="LAN: 192.168.1.50 or tcp://192.168.1.50:9100, Bluetooth/USB/Wired: Windows printer queue name"
                className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
              />
              <p className="mt-1 text-[10px] font-bold text-slate-500">Queue names work for installed Bluetooth, USB, and wired printers through the Windows bridge. LAN printers are normalized to raw `tcp://...:9100` automatically.</p>
            </label>
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-xl hover:bg-slate-200 transition-colors">
              CANCEL
            </button>
            <button type="submit" className="flex-1 py-3 bg-primary text-white font-black rounded-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/30 border-2 border-primary/50">
              {isEditing ? 'SAVE STATION' : 'CREATE STATION'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
