import { useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, WifiOff } from 'lucide-react'
import { activateDesktopLicense, type LicenseStatus } from '../../lib/localDb'

export default function ActivationScreen({
  status,
  checking,
  error,
  onActivated,
}: {
  status: LicenseStatus | null
  checking: boolean
  error: string
  onActivated: () => Promise<void>
}) {
  const [key, setKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      const result = await activateDesktopLicense(key)
      if (!result.success) {
        setMessage(result.message || 'Activation failed')
        return
      }
      await onActivated()
    } catch (activationError) {
      setMessage(activationError instanceof Error ? activationError.message : 'Activation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const expiry = status?.expiry ? new Date(status.expiry).toLocaleDateString('en-IN') : null
  const inactiveStatus = status?.status && status.status !== 'invalid' ? status.status.replace(/_/g, ' ') : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#082f49_0%,#14532d_48%,#451a03_100%)] px-5 py-8 text-white">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/12 bg-white/95 shadow-2xl shadow-slate-950/45 lg:grid-cols-[1fr_420px]">
        <div className="relative hidden min-h-[560px] overflow-hidden bg-slate-950 lg:block">
          <img
            src="/login-restaurant-unified-hero.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/92 via-slate-950/45 to-emerald-950/35" />
          <div className="relative z-10 flex h-full flex-col justify-between p-10">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/12 px-4 py-2 text-xs font-black uppercase tracking-[0.32em] text-amber-200 backdrop-blur">
              <ShieldCheck size={16} />
              BhojPatra Desk
            </div>
            <div>
              <h1 className="max-w-xl text-5xl font-black leading-tight text-white">
                Activate this BhojPatra device.
              </h1>
              <p className="mt-5 max-w-lg text-sm font-semibold leading-7 text-white/78">
                The license locks to this device after first activation. Restaurant work, tables, carts, KOTs, and payments remain available after activation.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 text-slate-950 sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <img src="/brand-icon-clean.webp" alt="BhojPatra" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-primary">License required</p>
              <h2 className="text-2xl font-black">BhojPatra activation</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Activation key</span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="BPT-XXXX-XXXX-XXXX"
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-black uppercase tracking-wider text-slate-900 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
                  autoFocus
                />
              </div>
            </label>

            {(message || error || inactiveStatus) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                {message || error || `Current license status: ${inactiveStatus}`}
              </div>
            )}

            {expiry && (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                <CheckCircle2 size={17} className="text-emerald-600" />
                Saved license expires on {expiry}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || checking || key.trim().length < 8}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3.5 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting || checking ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
              {submitting ? 'Activating...' : checking ? 'Checking license...' : 'Activate BhojPatra'}
            </button>

            <button
              type="button"
              onClick={() => void onActivated()}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {checking ? <Loader2 size={16} className="animate-spin" /> : <WifiOff size={16} />}
              Recheck saved license
            </button>
          </form>

          <p className="mt-6 text-xs font-semibold leading-6 text-slate-500">
            After activation, BhojPatra opens with the saved restaurant database. Online verification is retried on launch when the licensing server is reachable.
          </p>
        </div>
      </div>
    </div>
  )
}
