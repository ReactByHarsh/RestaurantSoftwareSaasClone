import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Search, Bell } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'

export default function TopStatusBar() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const activeKOTs = useBillingStore(s => s.getActiveKOTs())
  const outlet = useBillingStore(s => s.outlet)
  const accessLabel = user?.accessStartsAt || user?.accessEndsAt
    ? `${user.accessStartsAt ? new Date(user.accessStartsAt).toLocaleDateString('en-IN') : 'Now'} - ${user.accessEndsAt ? new Date(user.accessEndsAt).toLocaleDateString('en-IN') : 'No expiry'}`
    : ''

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-3 flex-shrink-0 z-30 shadow-sm">
      {/* Left: Brand name (logo icon is in sidebar at top) */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => navigate('/app')}
          className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer group"
        >
          <span className="text-[15px] font-black tracking-normal leading-none">
            <span className="text-emerald-900">bhoj</span><span className="text-amber-500">patra</span><span className="ml-1 text-slate-400">desk</span>
          </span>
        </button>

        {/* Outlet badge */}
        {outlet && (
          <div className="hidden sm:flex items-center gap-1.5 ml-0.5">
            <div className="w-px h-4 bg-slate-200" />
            <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[120px]">
              {outlet.name}
            </span>
            {accessLabel && (
              <span className="text-[10px] font-black text-slate-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                {accessLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Search — hidden on small mobile */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 w-40 hover:bg-white hover:border-slate-300 hover:shadow-sm transition-all focus-within:bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search size={13} className="flex-shrink-0 text-slate-400" />
          <input
            type="text"
            placeholder="Quick search…"
            className="bg-transparent border-none outline-none w-full text-slate-700 placeholder:text-slate-400 text-xs"
          />
        </div>

        {/* KOT Badge */}
        {activeKOTs.length > 0 && (
          <button
            onClick={() => navigate('/app/kitchen')}
            className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors shadow-sm"
          >
            <Bell size={13} className="animate-pulse" />
            <span className="hidden xs:inline">{activeKOTs.length} KOT</span>
            <span className="xs:hidden">{activeKOTs.length}</span>
          </button>
        )}

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center justify-center w-8 h-8 bg-primary text-white hover:bg-primary-dark rounded-lg transition-all shadow-sm shadow-orange-200/60 font-bold text-sm"
            title={user?.name}
          >
            {user?.name.charAt(0).toUpperCase() ?? 'U'}
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-100 shadow-2xl z-50 overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-orange-50 to-amber-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                      {user?.name.charAt(0).toUpperCase() ?? 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{user?.name}</p>
                      <p className="text-xs font-medium text-slate-500 capitalize mt-0.5">
                        {user?.role} • {outlet.code}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
