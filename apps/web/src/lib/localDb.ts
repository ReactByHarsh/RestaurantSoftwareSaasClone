import { invoke } from '@tauri-apps/api/core'
import type { BillingSnapshot } from './cloudSync'
import type { StaffAccount } from '../store/staffStore'

export type DesktopStatePayload = {
  snapshot: BillingSnapshot | null
  staff: StaffAccount[] | null
}

export type LicenseStatus = {
  key?: string | null
  status: string
  lastCheck: number
  expiry?: number | null
  lastKnownDate: number
  clientName?: string | null
  softwareType?: string | null
  planType?: string | null
  offlineGrace?: boolean
}

export type ActivationResult = {
  success: boolean
  message: string
}

export type LanServerStatus = {
  running: boolean
  bindHost: string
  port: number
  ipAddress: string | null
  primaryUrl: string | null
  urls: string[]
  lastError: string | null
}

export function isTauriDesktop() {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_METADATA__' in window
}

export async function loadDesktopState() {
  if (!isTauriDesktop()) return null
  return invoke<DesktopStatePayload>('load_local_state')
}

export async function saveDesktopState(snapshot: BillingSnapshot, staff: StaffAccount[]) {
  if (!isTauriDesktop()) return
  await invoke('save_local_state', { snapshot, staff })
}

export async function checkDesktopLicense() {
  if (!isTauriDesktop()) return true
  return invoke<boolean>('check_license')
}

export async function getDesktopLicenseStatus() {
  if (!isTauriDesktop()) return null
  return invoke<LicenseStatus>('get_license_status')
}

export async function activateDesktopLicense(key: string) {
  if (!isTauriDesktop()) return { success: true, message: 'Web preview does not require activation' }
  return invoke<ActivationResult>('activate_license', { key })
}

export async function getLanServerStatus() {
  if (!isTauriDesktop()) return null
  return invoke<LanServerStatus>('get_lan_server_status')
}
