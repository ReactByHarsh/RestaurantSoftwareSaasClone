import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, KeyRound, Loader2, LogOut, ShieldCheck, Wifi } from 'lucide-react'
import { useAuthStore, LOCAL_TENANT_ID } from '../../store/authStore'
import { useBillingStore } from '../../store/billingStore'
import { activateDesktopLicense, DEFAULT_LICENSE_SERVER, LicenseActivationError, readSavedLicenseKey } from '../../lib/license'
import { isTauriDesktop } from '../../lib/localDb'

type GateStatus = 'checking' | 'ready' | 'activation-needed' | 'cloud-login-needed'

export default function DesktopLicenseGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuthStore()
  const cloud = useBillingStore((state) => state.cloudSync)
  const [status, setStatus] = useState<GateStatus>('checking')
  const [licenseKey, setLicenseKey] = useState(readSavedLicenseKey)
  const [moveLicense, setMoveLicense] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showMoveOption, setShowMoveOption] = useState(false)

  const cloudAccountReady = Boolean(
    user && user.tenantId !== LOCAL_TENANT_ID && user.tenantId !== 'platform' &&
    cloud.accountLogin && cloud.accountSecret,
  )

  useEffect(() => {
    if (!isTauriDesktop() || !isAuthenticated || !user) {
      setStatus('ready')
      return
    }
    if (!cloudAccountReady) {
      setStatus('cloud-login-needed')
      return
    }

    const key = readSavedLicenseKey()
    setLicenseKey(key)
    if (!key) {
      setError('Enter the desktop license key issued for this BhojPatra account.')
      setStatus('activation-needed')
      return
    }

    let cancelled = false
    setStatus('checking')
    setError('')
    void activateDesktopLicense({
      serverUrl: DEFAULT_LICENSE_SERVER,
      licenseKey: key,
    }).then(() => {
      if (!cancelled) setStatus('ready')
    }).catch((activationError: unknown) => {
      if (cancelled) return
      const typedError = activationError instanceof Error ? activationError : new Error('License check failed.')
      setError(typedError.message)
      setShowMoveOption(typedError instanceof LicenseActivationError && typedError.code === 'LICENSE_IN_USE')
      setStatus('activation-needed')
    })

    return () => { cancelled = true }
  }, [cloudAccountReady, cloud.accountLogin, cloud.accountSecret, isAuthenticated, user?.id])

  if (!isTauriDesktop() || !isAuthenticated || !user || status === 'ready') return <>{children}</>

  const signInToCloudAccount = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleActivation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!licenseKey.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await activateDesktopLicense({
        serverUrl: DEFAULT_LICENSE_SERVER,
        licenseKey,
        moveLicense,
      })
      setStatus('ready')
    } catch (activationError) {
      const typedError = activationError instanceof Error ? activationError : new Error('License activation failed.')
      setError(typedError.message)
      setShowMoveOption(typedError instanceof LicenseActivationError && typedError.code === 'LICENSE_IN_USE')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white p-7 shadow-2xl sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          {status === 'checking' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">BhojPatra desktop license</h1>

        {status === 'checking' ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            <Wifi size={18} className="shrink-0 text-emerald-600" /> Checking this computer’s license with the server. Internet is required when BhojPatra starts.
          </div>
        ) : status === 'cloud-login-needed' ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">This desktop session is not signed in with a Cloud Admin restaurant account. Sign in with the account created in the BhojPatra Cloud Admin portal, then enter its license key.</p>
            <button onClick={signInToCloudAccount} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-white">
              <LogOut size={17} /> Go to Cloud Admin sign in
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">Sign-in stays saved on this computer until you log out. BhojPatra checks the license server at every app startup; restaurant data sync remains controlled separately in Settings.</p>
            <form onSubmit={handleActivation} className="mt-6 space-y-4">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                Desktop license key
                <div className="mt-2 flex items-center gap-2 rounded-xl border-2 border-slate-200 px-3 focus-within:border-primary">
                  <KeyRound size={17} className="shrink-0 text-slate-400" />
                  <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Enter the key from License Desk" className="w-full border-0 py-3 text-sm font-bold uppercase outline-none" />
                </div>
              </label>

              {showMoveOption && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <input type="checkbox" checked={moveLicense} onChange={(event) => setMoveLicense(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
                  <span><strong className="block">Move license to this computer</strong>Use only after replacing or formatting the old installation. The previous computer will fail its next online license check.</span>
                </label>
              )}

              {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</p>}

              <button type="submit" disabled={busy || !licenseKey.trim() || (showMoveOption && !moveLicense)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-white disabled:opacity-50">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                {busy ? 'Checking license…' : 'Activate and open BhojPatra'}
              </button>
            </form>
            <button onClick={signInToCloudAccount} className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Log out and use another Cloud Admin account</button>
          </>
        )}
      </section>
    </main>
  )
}
