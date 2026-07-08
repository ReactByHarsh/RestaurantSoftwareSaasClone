import { useNavigate, useLocation } from 'react-router-dom'
import {
  Activity,
  LayoutGrid,
  ChefHat,
  ClipboardList,
  ReceiptText,
  UserCircle,
  BookOpen,
  Package,
  BarChart3,
  ShieldCheck,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getNavItems } from '../../lib/permissions'
import { clsx } from 'clsx'
import { useState } from 'react'

const NAV_CONFIG = [
  { key: 'owner', label: 'Owner', icon: Activity, path: '/app/owner', color: 'text-emerald-400 group-hover:text-emerald-300', activeBg: 'bg-slate-800 border-slate-700/60 text-emerald-400' },
  { key: 'tables', label: 'Tables', icon: LayoutGrid, path: '/app/tables', color: 'text-blue-400 group-hover:text-blue-300', activeBg: 'bg-slate-800 border-slate-700/60 text-blue-400' },
  { key: 'captain', label: 'Captain', icon: UserCircle, path: '/app/captain', color: 'text-violet-400 group-hover:text-violet-300', activeBg: 'bg-slate-800 border-slate-700/60 text-violet-400' },
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat, path: '/app/kitchen', color: 'text-red-400 group-hover:text-red-300', activeBg: 'bg-slate-800 border-slate-700/60 text-red-400' },
  { key: 'orders', label: 'Orders', icon: ClipboardList, path: '/app/orders', color: 'text-cyan-400 group-hover:text-cyan-300', activeBg: 'bg-slate-800 border-slate-700/60 text-cyan-400' },
  { key: 'menu', label: 'Menu', icon: BookOpen, path: '/app/menu', color: 'text-emerald-400 group-hover:text-emerald-300', activeBg: 'bg-slate-800 border-slate-700/60 text-emerald-400' },
  { key: 'inventory', label: 'Inventory', icon: Package, path: '/app/inventory', color: 'text-amber-400 group-hover:text-amber-300', activeBg: 'bg-slate-800 border-slate-700/60 text-amber-400' },
  { key: 'reports', label: 'Reports', icon: BarChart3, path: '/app/reports', color: 'text-indigo-400 group-hover:text-indigo-300', activeBg: 'bg-slate-800 border-slate-700/60 text-indigo-400' },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, path: '/app/admin', color: 'text-rose-400 group-hover:text-rose-300', activeBg: 'bg-slate-800 border-slate-700/60 text-rose-400' },
  { key: 'printers', label: 'Printers', icon: ReceiptText, path: '/app/printers', color: 'text-orange-400 group-hover:text-orange-300', activeBg: 'bg-slate-800 border-slate-700/60 text-orange-400' },
  { key: 'settings', label: 'Settings', icon: Settings, path: '/app/settings', color: 'text-slate-400 group-hover:text-slate-200', activeBg: 'bg-slate-800 border-slate-700 text-slate-300' },
] as const

export default function LeftSideNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const [tooltip, setTooltip] = useState<{ key: string; y: number } | null>(null)

  if (!user) return null

  const allowedKeys = getNavItems(user.role)
  const visibleNav = NAV_CONFIG.filter((item) => allowedKeys.includes(item.key))

  return (
    <>
      <aside className="fixed inset-x-0 bottom-0 z-40 flex h-16 flex-row border-t border-slate-900 bg-slate-950 shadow-[0_-12px_36px_rgba(0,0,0,0.22)] sm:inset-y-0 sm:left-0 sm:top-0 sm:h-full sm:w-14 sm:flex-col sm:border-r sm:border-t-0 sm:shadow-[4px_0_24px_rgba(0,0,0,0.15)]">
        <div className="hidden items-center justify-center border-b border-slate-900 bg-slate-950 sm:flex sm:h-12 sm:flex-shrink-0">
          <button
            onClick={() => navigate('/app')}
            className="group flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-slate-900"
            title="BhojPatra Home"
          >
            <img
              src="/brand-icon-clean.webp"
              alt="BP"
              className="h-7 w-7 object-contain transition-transform group-hover:scale-110"
            />
          </button>
        </div>

        <nav
          className="flex flex-1 flex-row items-center justify-around gap-1 overflow-x-auto px-2 py-2 sm:flex-col sm:justify-start sm:gap-0.5 sm:px-0 sm:py-2 sm:overflow-x-hidden sm:overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {visibleNav.map(({ key, label, icon: Icon, path, color, activeBg }) => {
            const isActive = location.pathname.startsWith(path)
            return (
              <div key={key} className="relative flex-1 sm:w-full sm:flex-none sm:px-1.5">
                <button
                  onClick={() => navigate(path)}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setTooltip({ key, y: rect.top + rect.height / 2 })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  aria-label={label}
                  title={label}
                  className={clsx(
                    'group relative flex h-11 w-full items-center justify-center rounded-2xl border transition-all duration-200 sm:h-10 sm:rounded-xl',
                    isActive ? activeBg : 'border-transparent bg-transparent hover:border-slate-800 hover:bg-slate-900/60'
                  )}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.75 : 2.25}
                    className={clsx(
                      'transition-all duration-200',
                      isActive ? '' : `${color} opacity-70 group-hover:scale-105 group-hover:opacity-100`
                    )}
                  />
                  {isActive && (
                    <span
                      className={clsx(
                        'absolute left-1/2 top-0 h-1.5 w-5 -translate-x-1/2 rounded-b-full sm:-left-1.5 sm:top-1/2 sm:h-5 sm:w-1.5 sm:-translate-y-1/2 sm:translate-x-0 sm:rounded-b-none sm:rounded-r-full',
                        key === 'tables' && 'bg-blue-500',
                        key === 'captain' && 'bg-violet-500',
                        key === 'kitchen' && 'bg-red-500',
                        key === 'orders' && 'bg-cyan-600',
                        key === 'menu' && 'bg-emerald-500',
                        key === 'inventory' && 'bg-amber-500',
                        key === 'reports' && 'bg-indigo-500',
                        key === 'admin' && 'bg-rose-500',
                        key === 'printers' && 'bg-orange-500',
                        key === 'settings' && 'bg-slate-500'
                      ,
                        key === 'owner' && 'bg-emerald-500'
                      )}
                    />
                  )}
                </button>
              </div>
            )
          })}
        </nav>
      </aside>

      {tooltip && (
        <div className="pointer-events-none fixed z-[200] hidden sm:flex" style={{ top: tooltip.y, left: 60 }}>
          <div className="flex -translate-y-1/2 items-center">
            <div className="h-0 w-0 border-b-[5px] border-r-[6px] border-t-[5px] border-b-transparent border-r-slate-900 border-t-transparent" />
            <div className="whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl">
              {NAV_CONFIG.find((item) => item.key === tooltip.key)?.label}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
