import { useState, useMemo } from 'react'
import { X, Search, UserRound, Phone, MapPin, Mail, Calendar, Hash } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSetCustomer: (name: string, phone: string, extraDetails: any) => void
  currentCustomerName?: string
  currentCustomerPhone?: string
}

import { useBillingStore } from '../../store/billingStore'

export default function CustomerModal({ isOpen, onClose, onSetCustomer, currentCustomerName, currentCustomerPhone }: Props) {
  const { orders } = useBillingStore()
  const [search, setSearch] = useState('')
  const [mobile, setMobile] = useState(currentCustomerPhone || '')
  const [name, setName] = useState(currentCustomerName || '')
  const [category, setCategory] = useState('')
  const [loyalty, setLoyalty] = useState('')
  const [address, setAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [rfid, setRfid] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('Male')
  const [dob, setDob] = useState('')
  const [anniversary, setAnniversary] = useState('')

  const masterCustomers = useMemo(() => {
    const map = new Map<string, any>()
    
    // First, pass to gather all customers
    orders.forEach(o => {
      if (o.customerPhone && !map.has(o.customerPhone)) {
        map.set(o.customerPhone, {
          id: o.customerId || o.customerPhone,
          name: o.customerName || 'Unknown',
          phone: o.customerPhone,
          category: 'Regular',
          loyalty: 'None',
          balancePaise: 0
        })
      }
    })

    // Second, calculate balance from account payments
    useBillingStore.getState().payments.forEach(p => {
      if (p.status === 'success' && p.method === 'account') {
        const o = orders.find(ord => ord.id === p.orderId)
        if (o && o.customerPhone && map.has(o.customerPhone)) {
          const cust = map.get(o.customerPhone)
          cust.balancePaise += p.amountPaise
        }
      }
    })

    return Array.from(map.values())
  }, [orders])

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase()
    return masterCustomers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
  }, [search, masterCustomers])

  const handleSelectCustomer = (customer: any) => {
    setMobile(customer.phone)
    setName(customer.name)
    setCategory(customer.category || '')
    setLoyalty(customer.loyalty || '')
  }

  const handleSet = () => {
    onSetCustomer(name, mobile, { category, loyalty, address, gstin, rfid, email, gender, dob, anniversary })
    onClose()
  }

  const handleClear = () => {
    setMobile('')
    setName('')
    setCategory('')
    setLoyalty('')
    setAddress('')
    setGstin('')
    setRfid('')
    setEmail('')
    setGender('Male')
    setDob('')
    setAnniversary('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] animate-slide-in-up">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <UserRound size={20} className="text-primary" />
            Customer Details
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT SIDE: Search & List */}
          <div className="w-1/3 border-r border-slate-100 flex flex-col bg-slate-50/50">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer (Name or Mobile)..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all bg-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-bold">No customers found</div>
              ) : (
                filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all group"
                  >
                    <div className="font-black text-sm text-slate-700 group-hover:text-primary transition-colors">{c.name}</div>
                    <div className="text-xs font-bold text-slate-500 mt-0.5">{c.phone}</div>
                    <div className="flex gap-2 mt-1.5 items-center">
                      {c.category && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{c.category}</span>}
                      {c.loyalty && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">{c.loyalty}</span>}
                      {c.balancePaise > 0 && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded">Bal: -₹{(c.balancePaise / 100).toFixed(2)}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* RIGHT SIDE: Form */}
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Mobile Number *</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Enter mobile" value={mobile} onChange={e => setMobile(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Customer Name</label>
                <div className="relative">
                  <UserRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Customer Name" value={name} onChange={e => setName(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Cust. Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all appearance-none bg-white">
                  <option value="">Select category</option>
                  <option value="VIP">VIP</option>
                  <option value="Regular">Regular</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Loyalty Prog</label>
                <select value={loyalty} onChange={e => setLoyalty(e.target.value)} className="w-full px-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all appearance-none bg-white">
                  <option value="">Select program</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Platinum">Platinum</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Address</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                  <textarea rows={2} placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all resize-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">GSTIN No</label>
                <input type="text" placeholder="GSTIN No" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">RFID Tag</label>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="RFID Tag" value={rfid} onChange={e => setRfid(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Email ID</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" placeholder="Email Id" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Gender</label>
                <div className="flex gap-4 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="gender" value="Male" checked={gender === 'Male'} onChange={e => setGender(e.target.value)} className="w-4 h-4 text-primary focus:ring-primary/50" />
                    <span className="text-sm font-bold text-slate-700">Male</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="gender" value="Female" checked={gender === 'Female'} onChange={e => setGender(e.target.value)} className="w-4 h-4 text-primary focus:ring-primary/50" />
                    <span className="text-sm font-bold text-slate-700">Female</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">DOB (dd/MM/yy)</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="dd/MM/yy" value={dob} onChange={e => setDob(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Anniversary (dd/MM/yy)</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="dd/MM/yy" value={anniversary} onChange={e => setAnniversary(e.target.value)} className="w-full pl-9 pr-3 py-2.5 text-sm font-bold border-2 border-slate-100 rounded-xl outline-none focus:border-primary/50 transition-all" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
          <button onClick={handleClear} className="px-6 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-sm transition-colors border border-rose-200">
            Clear
          </button>
          <button onClick={handleSet} className="px-8 py-2.5 rounded-xl bg-[#FFD966] hover:bg-[#FFC000] text-yellow-900 font-black text-sm shadow-sm transition-colors">
            Set
          </button>
        </div>
      </div>
    </div>
  )
}
