import { useState } from 'react'
import type { FormEvent } from 'react'
import { ChefHat, ShieldCheck } from 'lucide-react'
import { LOCAL_TENANT_ID, useStaffStore } from '../../store/staffStore'
import { useBillingStore } from '../../store/billingStore'
import { useAuthStore } from '../../store/authStore'

export default function FirstRunSetup() {
  const [error, setError] = useState('')
  const addStaff = useStaffStore((state) => state.addStaff)
  const updateOutlet = useBillingStore((state) => state.updateOutlet)
  const completeFirstRun = useAuthStore((state) => state.completeFirstRun)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const restaurantName = String(form.get('restaurantName') ?? '').trim()
    const adminName = String(form.get('adminName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const password = String(form.get('password') ?? '').trim()
    const pin = String(form.get('pin') ?? '').trim()

    if (!restaurantName || !adminName || (!email && !phone) || !password) {
      setError('Restaurant name, admin name, one login ID, and password are required.')
      return
    }

    updateOutlet({
      id: `out_${LOCAL_TENANT_ID}`,
      tenantId: LOCAL_TENANT_ID,
      name: restaurantName,
      code: restaurantName.slice(0, 4).replace(/[^a-z0-9]/gi, '').toUpperCase() || 'BHOJ',
      status: 'active',
    })

    const account = addStaff({
      tenantId: LOCAL_TENANT_ID,
      restaurantName,
      name: adminName,
      email,
      phone,
      role: 'admin',
      status: 'active',
      password,
      pin,
    })
    completeFirstRun(account)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-slate-950 p-8 text-white md:p-10">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
              <ChefHat size={24} strokeWidth={2.5} />
            </div>
            <h1 className="mt-8 text-3xl font-black tracking-tight md:text-5xl">Set up this restaurant desktop</h1>
            <p className="mt-4 text-sm font-bold leading-7 text-slate-300">
              Create the first local admin account. After this, BhojPatra opens directly on this desktop unless staff sign-in is enabled in Settings.
            </p>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-emerald-300" />
                <p className="text-sm font-black text-white">Desktop remains the source of truth</p>
              </div>
              <p className="mt-2 text-xs font-bold leading-6 text-slate-300">
                Captain and owner mobile logins are created later from Admin Panel and work over the local Wi-Fi LAN server.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">First admin account</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">No default passwords are shipped with this install.</p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Restaurant name</span>
                <input name="restaurantName" required placeholder="Hotel Nisarga" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Admin name</span>
                <input name="adminName" required placeholder="Restaurant Admin" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Phone login</span>
                <input name="phone" placeholder="9876543210" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Email login</span>
                <input name="email" type="email" placeholder="admin@restaurant.com" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Manager PIN</span>
                <input name="pin" maxLength={6} placeholder="Optional" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-600">Password</span>
                <input name="password" required type="password" placeholder="Create a strong password" className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10" />
              </label>
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}

            <button type="submit" className="mt-6 w-full rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/25 transition active:scale-[0.99]">
              CREATE ADMIN AND OPEN DESKTOP
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
