import { invoke } from '@tauri-apps/api/core'
import type { BillingSnapshot } from './cloudSync'
import type { StaffAccount } from '../store/staffStore'

export type DesktopStatePayload = {
  snapshot: BillingSnapshot | null
  staff: StaffAccount[] | null
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

export type DesktopSyncMetadata = {
  records: unknown[]
  outbox: unknown[]
  state: unknown[]
  conflicts: unknown[]
}

export type LocalBackupResult = {
  date: string
  fileName: string
  created: boolean
  sizeBytes: number
  paths: string[]
  errors: string[]
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

export async function createDailyLocalBackup(force = false) {
  if (!isTauriDesktop()) return null
  return invoke<LocalBackupResult>('create_daily_local_backup', { force })
}

export async function loadDesktopSyncMetadata() {
  if (!isTauriDesktop()) return null
  return invoke<DesktopSyncMetadata>('load_sync_metadata')
}

export async function saveDesktopSyncMetadata(metadata: DesktopSyncMetadata) {
  if (!isTauriDesktop()) return
  await invoke('save_sync_metadata', {
    records: metadata.records,
    outbox: metadata.outbox,
    syncState: metadata.state,
    conflicts: metadata.conflicts,
  })
}

export async function getLanServerStatus() {
  if (!isTauriDesktop()) return null
  return invoke<LanServerStatus>('get_lan_server_status')
}
