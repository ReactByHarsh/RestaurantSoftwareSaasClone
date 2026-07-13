import type { BillingSnapshot } from './cloudSync'
import type { StaffAccount } from '../store/staffStore'

export const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8181'

export type LanBridgeStatus = {
  running: boolean
  bindHost: string
  port: number
  discoveryPort: number
  ipAddress?: string | null
  primaryUrl?: string | null
  urls: string[]
  lastError?: string | null
  updatedAt?: string
  hasState: boolean
  staffCount: number
}

export type LanBridgeState = {
  exists: boolean
  updatedAt: string
  payload?: BillingSnapshot | null
  outletId: string
  tenantId: string
}

type LanSyncResult = {
  ok: boolean
  updatedAt: string
  primaryUrl?: string | null
  staffCount: number
}

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(`${LOCAL_BRIDGE_URL}${path}`, {
      cache: 'no-store',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({})) as T & { error?: string }
    if (!response.ok) throw new Error(payload.error || `Local bridge returned HTTP ${response.status}`)
    return payload
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getLanBridgeStatus() {
  return bridgeFetch<LanBridgeStatus>('/lan/status')
}

export function getLanBridgeState() {
  return bridgeFetch<LanBridgeState>('/lan/state')
}

export function syncLanBridge(snapshot: BillingSnapshot, staff: StaffAccount[]) {
  return bridgeFetch<LanSyncResult>('/lan/sync', {
    method: 'POST',
    body: JSON.stringify({ snapshot, staff }),
  })
}
