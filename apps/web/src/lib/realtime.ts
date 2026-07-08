import type { RealtimeEvent, RealtimeEventType } from './types'

type RealtimeConnectOptions = {
  serverUrl?: string
  outletId?: string
  accountLogin?: string
  accountSecret?: string
  clientId?: string
}

const CHANNEL_NAME = 'bhojpatra-outlet-out_local'

type RealtimeHandler = (event: RealtimeEvent) => void

function cleanBaseUrl(serverUrl: string) {
  return String(serverUrl || '').trim().replace(/\/+$/, '')
}

function websocketUrl(options: RealtimeConnectOptions) {
  if (!options.serverUrl || !options.outletId) return null
  const base = cleanBaseUrl(options.serverUrl)
  if (!base) return null
  const url = new URL(`${base}/api/v1/outlets/${encodeURIComponent(options.outletId)}/realtime`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('clientId', options.clientId || `client_${crypto.randomUUID()}`)
  if (options.accountLogin) url.searchParams.set('login', options.accountLogin)
  if (options.accountSecret) url.searchParams.set('secret', options.accountSecret)
  return url.toString()
}

class RealtimeClient {
  private channel: BroadcastChannel | null = null
  private socket: WebSocket | null = null
  private handlers: Set<RealtimeHandler> = new Set()
  private connected = false
  private reconnectTimer: number | undefined
  private options: RealtimeConnectOptions = {}

  connect(options: RealtimeConnectOptions = {}) {
    this.options = { ...this.options, ...options }
    this.connectLocalChannel()
    this.connectWebSocket()
  }

  private connectLocalChannel() {
    if (this.channel || typeof window === 'undefined' || !('BroadcastChannel' in window)) return
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (e) => {
        const event = e.data as RealtimeEvent
        this.handlers.forEach(h => h(event))
      }
      this.connected = true
    } catch {
      // BroadcastChannel not available.
    }
  }

  private connectWebSocket() {
    if (typeof window === 'undefined' || !('WebSocket' in window)) return
    const url = websocketUrl(this.options)
    if (!url) return
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return

    try {
      this.socket = new WebSocket(url)
      this.socket.onopen = () => {
        this.connected = true
        window.clearTimeout(this.reconnectTimer)
      }
      this.socket.onmessage = (message) => {
        if (typeof message.data !== 'string' || message.data === 'pong') return
        try {
          const raw = JSON.parse(message.data) as Partial<RealtimeEvent> & { payload?: unknown }
          const event: RealtimeEvent = {
            type: (raw.type || 'STATE_UPDATED') as RealtimeEventType,
            outletId: raw.outletId || this.options.outletId || 'out_local',
            payload: (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>,
            timestamp: raw.timestamp || new Date().toISOString(),
          }
          this.handlers.forEach(h => h(event))
        } catch {
          // Ignore malformed websocket frames.
        }
      }
      this.socket.onclose = () => {
        this.socket = null
        if (this.options.serverUrl && this.options.outletId) {
          window.clearTimeout(this.reconnectTimer)
          this.reconnectTimer = window.setTimeout(() => this.connectWebSocket(), 2500)
        }
      }
      this.socket.onerror = () => {
        try { this.socket?.close() } catch { /* ignore */ }
      }
    } catch {
      // Keep local channel fallback alive.
    }
  }

  disconnect() {
    window.clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.socket = null
    this.channel?.close()
    this.channel = null
    this.connected = false
  }

  subscribe(handler: RealtimeHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  broadcast(type: RealtimeEventType, payload: Record<string, unknown>) {
    const event: RealtimeEvent = {
      type,
      outletId: this.options.outletId || 'out_local',
      payload,
      timestamp: new Date().toISOString(),
    }
    this.channel?.postMessage(event)
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(event))
    }
    this.handlers.forEach(h => h(event))
  }

  isConnected() {
    return this.connected
  }
}

export const realtimeClient = new RealtimeClient()
