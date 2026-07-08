import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ChefHat, Eye, EyeOff, BarChart3, CreditCard, LayoutGrid, ReceiptText } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getDefaultRoute } from '../../lib/permissions'

export default function LoginScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, user, login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated && user) navigate(getDefaultRoute(user.role), { replace: true })
  }, [isAuthenticated, navigate, user])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(email, password)
    setLoading(false)
    if (result.success) {
      const { user } = useAuthStore.getState()
      navigate(user ? getDefaultRoute(user.role) : '/app/billing')
    } else {
      setError(result.error || 'Login failed')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <img
        src="/login-restaurant-unified-hero.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        decoding="async"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_38%,rgba(15,23,42,0.08),rgba(2,6,23,0.38)_44%,rgba(2,6,23,0.88)_100%)]" />
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-slate-950/95 via-slate-950/62 to-slate-950/10 lg:w-[58%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/95 to-transparent" />

      <div className="relative z-10 flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/92 px-4 py-3 shadow-2xl shadow-slate-950/25 backdrop-blur-xl">
            <img src="/brand-icon-clean.webp" alt="BhojPatra" className="h-11 w-11 object-contain" />
            <div>
              <img src="/brand-text-clean.webp" alt="BhojPatra Desk" className="h-8 w-40 object-contain object-left" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Desktop Restaurant Operating System</p>
            </div>
          </div>

          <div className="hidden grid-cols-2 gap-2 xl:grid">
            {[
              [LayoutGrid, 'Tables live'],
              [ReceiptText, 'Orders synced'],
              [CreditCard, 'Fast payments'],
              [BarChart3, 'Reports ready'],
            ].map(([Icon, label]) => (
              <div key={String(label)} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/12 px-3 py-2 text-xs font-black text-white shadow-lg backdrop-blur-md">
                <Icon size={15} />
                {label as string}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center py-8">
          <div className="grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[430px_1fr]">
            <div className="animate-fade-in rounded-3xl border border-white/14 bg-white/94 p-6 shadow-2xl shadow-slate-950/45 backdrop-blur-xl sm:p-8">
              <div className="mb-7">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-primary">Captain and owner sign-in</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Welcome back</h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">Use any captain, owner, admin, or cloud staff login. Each user gets their own role-based Android flow after sign-in.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Email or Phone</label>
                  <input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@restaurant.com"
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="password"
                      className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 pr-10 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-semibold text-white shadow-sm transition-all hover:bg-primary-dark disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="mb-1 text-xs font-medium text-slate-500">Staff access</p>
                <p className="text-xs text-slate-600">Use a staff login created from Admin Panel. This desktop login screen can be turned off again from Settings.</p>
              </div>
            </div>

            <div className="hidden max-w-xl self-end pb-8 text-white lg:block">
              <p className="text-sm font-black uppercase tracking-[0.45em] text-amber-300">BhojPatra Mobile</p>
              <h1 className="mt-4 text-5xl font-black leading-tight tracking-tight xl:text-6xl">
                Captain phones and owner phones, both on one live restaurant system.
              </h1>
              <p className="mt-5 text-base font-semibold leading-7 text-white/82">
                Captains can take orders and send KOTs over local Wi-Fi, while owners can view the latest daily cloud snapshot when they are away.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs font-semibold text-white/50">
          BhojPatra mobile sign-in with captain, counter, kitchen, and owner access
        </div>
      </div>
    </div>
  )
}
