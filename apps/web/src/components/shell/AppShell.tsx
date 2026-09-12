import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertTriangle, Phone, XCircle } from 'lucide-react'
import TopStatusBar from './TopStatusBar'
import LeftSideNav from './LeftSideNav'
import { useAuthStore } from '../../store/authStore'

function parseDateStart(value?: string) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime()
}

function renewalDaysLeft(value?: string) {
  const target = parseDateStart(value)
  if (target === null) return null
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((target - startOfToday) / 86400000)
}

export default function AppShell() {
  const user = useAuthStore((state) => state.user)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const renewalWarning = useMemo(() => {
    if (!user || user.tenantId === 'platform') return null
    const daysLeft = renewalDaysLeft(user.renewalDate)
    if (daysLeft === null || daysLeft < 0 || daysLeft > 10) return null
    return {
      key: `${user.id}:${user.renewalDate}`,
      daysLeft,
      renewalDate: user.renewalDate,
      renewalAmount: user.renewalAmount,
      restaurantName: user.restaurantName || user.name,
    }
  }, [user])

  useEffect(() => {
    if (!renewalWarning) return
    const dismissed = window.sessionStorage.getItem('renewal-warning-dismissed')
    setDismissedKey(dismissed)
  }, [renewalWarning])

  const showRenewalWarning = renewalWarning && dismissedKey !== renewalWarning.key

  const dismissRenewalWarning = () => {
    if (!renewalWarning) return
    window.sessionStorage.setItem('renewal-warning-dismissed', renewalWarning.key)
    setDismissedKey(renewalWarning.key)
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#F8FAFC]">
      <LeftSideNav />
      <div className="flex h-full flex-col pb-16 sm:pb-0 sm:pl-14">
        <TopStatusBar />
        <main className="main-content w-full min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {showRenewalWarning && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-start gap-3 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-600">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-700">Renewal Reminder</p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">{renewalWarning.restaurantName}</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {renewalWarning.daysLeft === 0 ? 'Renewal is due today.' : `Renewal is due in ${renewalWarning.daysLeft} day${renewalWarning.daysLeft === 1 ? '' : 's'}.`}
                </p>
              </div>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Renewal Date</p>
                <p className="mt-1 text-base font-black text-slate-900">{renewalWarning.renewalDate}</p>
                {typeof renewalWarning.renewalAmount === 'number' && renewalWarning.renewalAmount > 0 && (
                  <p className="mt-1 text-sm font-bold text-slate-600">Renewal amount: Rs {renewalWarning.renewalAmount.toFixed(2)}</p>
                )}
              </div>
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-900">
                Renewal time is near. For more info, contact `9028414428`.
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={dismissRenewalWarning}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  <XCircle size={16} />
                  Cancel
                </button>
                <a
                  href="tel:9028414428"
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-600"
                >
                  <Phone size={16} />
                  Call 9028414428
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
