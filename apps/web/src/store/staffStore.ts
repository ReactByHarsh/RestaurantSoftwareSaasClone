import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role, User } from '../lib/types'

export type StaffAccount = User & {
  password: string
  accessStartsAt?: string
  accessEndsAt?: string
  restaurantName?: string
  paymentReceived?: boolean
  renewalPaymentReceived?: boolean
  paymentNote?: string
}

type StaffInput = {
  name: string
  email?: string
  phone?: string
  role: Role
  status: User['status']
  password: string
  pin?: string
  accessStartsAt?: string
  accessEndsAt?: string
  tenantId?: string
  restaurantName?: string
  paymentReceived?: boolean
  renewalPaymentReceived?: boolean
  paymentNote?: string
}

interface StaffStore {
  staff: StaffAccount[]
  findByLogin: (emailOrPhone: string) => StaffAccount | undefined
  addStaff: (input: StaffInput) => StaffAccount
  updateStaff: (id: string, input: Partial<StaffInput>) => void
  setStaffStatus: (id: string, status: User['status']) => void
  resetStaffPassword: (id: string, password: string) => void
  replaceStaff: (staff: StaffAccount[]) => void
}

export const LOCAL_TENANT_ID = 'local_restaurant'

function normalizeLogin(value?: string) {
  return value?.trim().toLowerCase()
}

function mergeSystemAccounts(staff: StaffAccount[]) {
  const localStaff = staff.filter((account) =>
    account.tenantId !== 'platform' &&
    account.id !== 'usr_super_admin' &&
    normalizeLogin(account.email) !== 'admin@gmail.com' &&
    !['usr_owner', 'usr_admin', 'usr_cashier', 'usr_captain_1', 'usr_captain_2'].includes(account.id)
  )
  return localStaff.map((account) => ({
    ...account,
    tenantId: account.tenantId || LOCAL_TENANT_ID,
    createdAt: account.createdAt || new Date().toISOString(),
  }))
}

export function toPublicUser(account: StaffAccount): User {
  const { password: _password, ...user } = account
  return user
}

export const useStaffStore = create<StaffStore>()(
  persist(
    (set, get) => ({
      staff: [],

      findByLogin: (emailOrPhone) => {
        const login = normalizeLogin(emailOrPhone)
        if (!login) return undefined
        return get().staff.find((account) =>
          normalizeLogin(account.email) === login || normalizeLogin(account.phone) === login
        )
      },

      addStaff: (input) => {
        const now = new Date().toISOString()
        const account: StaffAccount = {
          id: `usr_${crypto.randomUUID()}`,
          tenantId: input.tenantId || LOCAL_TENANT_ID,
          name: input.name.trim(),
          email: input.email?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          role: input.role,
          status: input.status,
          pin: input.pin?.trim() || undefined,
          password: input.password,
          accessStartsAt: input.accessStartsAt || undefined,
          accessEndsAt: input.accessEndsAt || undefined,
          restaurantName: input.restaurantName?.trim() || undefined,
          paymentReceived: input.paymentReceived ?? true,
          renewalPaymentReceived: input.renewalPaymentReceived ?? true,
          paymentNote: input.paymentNote?.trim() || undefined,
          createdAt: now,
        }
        set((state) => ({ staff: [account, ...state.staff] }))
        return account
      },

      updateStaff: (id, input) => {
        set((state) => ({
          staff: state.staff.map((account) => {
            if (account.id !== id) return account
            return {
              ...account,
              ...input,
              name: input.name?.trim() ?? account.name,
              email: input.email?.trim() || undefined,
              phone: input.phone?.trim() || undefined,
              pin: input.pin?.trim() || undefined,
              password: input.password || account.password,
              accessStartsAt: input.accessStartsAt ?? account.accessStartsAt,
              accessEndsAt: input.accessEndsAt ?? account.accessEndsAt,
              tenantId: input.tenantId ?? account.tenantId,
              restaurantName: input.restaurantName?.trim() || account.restaurantName,
              paymentReceived: input.paymentReceived ?? account.paymentReceived ?? true,
              renewalPaymentReceived: input.renewalPaymentReceived ?? account.renewalPaymentReceived ?? true,
              paymentNote: input.paymentNote?.trim() || undefined,
            }
          }),
        }))
      },

      setStaffStatus: (id, status) => {
        set((state) => ({
          staff: state.staff.map((account) => (account.id === id ? { ...account, status } : account)),
        }))
      },

      resetStaffPassword: (id, password) => {
        set((state) => ({
          staff: state.staff.map((account) => (account.id === id ? { ...account, password } : account)),
        }))
      },

      replaceStaff: (staff) => set({ staff: mergeSystemAccounts(staff) }),
    }),
    {
      name: 'bhojpatra-staff-v2',
      version: 7,
      migrate: (persisted) => {
        const state = persisted as Partial<StaffStore>
        return { ...state, staff: mergeSystemAccounts(state.staff ?? []) }
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.staff = mergeSystemAccounts(state.staff)
      },
    }
  )
)
