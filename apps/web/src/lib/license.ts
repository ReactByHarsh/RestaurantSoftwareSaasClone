import { invoke } from '@tauri-apps/api/core'

export const DEFAULT_LICENSE_SERVER = 'https://electron-server.yash-v-shinde.workers.dev'
const LICENSE_KEY_STORAGE = 'bhojpatra-desktop-license-key-v1'
const DEVICE_ID_STORAGE = 'bhojpatra-desktop-device-id-v1'
const LICENSE_VERIFIED_KEY_STORAGE = 'bhojpatra-desktop-license-verified-key-v1'
const LICENSE_VERIFIED_AT_STORAGE = 'bhojpatra-desktop-license-verified-at-v1'

export class LicenseActivationError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'LicenseActivationError'
  }
}

let inMemoryDeviceId: string | null = null

export function readSavedLicenseKey() {
  try {
    return localStorage.getItem(LICENSE_KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function isLicenseLocallyVerified(licenseKey?: string): boolean {
  try {
    const key = (licenseKey ?? readSavedLicenseKey()).trim()
    if (!key) return false
    const verifiedKey = localStorage.getItem(LICENSE_VERIFIED_KEY_STORAGE)?.trim()
    return Boolean(verifiedKey && verifiedKey === key)
  } catch {
    return false
  }
}

export function markLicenseLocallyVerified(licenseKey: string) {
  try {
    localStorage.setItem(LICENSE_VERIFIED_KEY_STORAGE, licenseKey.trim())
    localStorage.setItem(LICENSE_VERIFIED_AT_STORAGE, Date.now().toString())
  } catch {
    // Ignore local storage quota errors
  }
}

export function clearLicenseLocalVerification() {
  try {
    localStorage.removeItem(LICENSE_VERIFIED_KEY_STORAGE)
    localStorage.removeItem(LICENSE_VERIFIED_AT_STORAGE)
  } catch {
    // Ignore
  }
}

function saveLicenseKey(value: string) {
  try {
    localStorage.setItem(LICENSE_KEY_STORAGE, value.trim())
  } catch {
    throw new LicenseActivationError('This computer could not securely save the license key. Check local app storage and try again.')
  }
}

export async function getOrCreateDeviceId() {
  if (inMemoryDeviceId) return inMemoryDeviceId

  try {
    const saved = localStorage.getItem(DEVICE_ID_STORAGE)?.trim()
    if (saved) {
      inMemoryDeviceId = saved
      return saved
    }
  } catch {
    // Continue
  }

  try {
    const hardwareIdentity = await invoke<string>('get_desktop_machine_id')
    if (hardwareIdentity.trim()) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bhojpatra-license:${hardwareIdentity.trim()}`))
      const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      const deviceId = `bp-${fingerprint}`
      inMemoryDeviceId = deviceId
      try {
        localStorage.setItem(DEVICE_ID_STORAGE, deviceId)
      } catch {
        // Ignore
      }
      return deviceId
    }
  } catch {
    // Browser preview or older desktop backend: use a persistent random install ID.
  }

  try {
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    inMemoryDeviceId = id
    try {
      localStorage.setItem(DEVICE_ID_STORAGE, id)
    } catch {
      // Ignore
    }
    return id
  } catch {
    throw new LicenseActivationError('This app could not create a device identity. Check local app storage and restart BhojPatra.')
  }
}

export async function activateDesktopLicense(input: {
  serverUrl: string
  licenseKey: string
  moveLicense?: boolean
}) {
  const licenseKey = input.licenseKey.trim()
  if (!licenseKey) throw new LicenseActivationError('Enter the desktop license key issued by Cloud Admin.')

  const serverUrl = (input.serverUrl || DEFAULT_LICENSE_SERVER).trim().replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${serverUrl}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        licenseKey,
        machineId: await getOrCreateDeviceId(),
        softwareType: 'BhojPatra',
        moveActivation: input.moveLicense === true,
      }),
    })
  } catch (error) {
    if (error instanceof LicenseActivationError) throw error
    throw new LicenseActivationError('Could not reach the BhojPatra license server. Connect to the internet and retry.')
  }

  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string; valid?: boolean }
  if (!response.ok || !payload.valid) {
    clearLicenseLocalVerification()
    const code = payload.code || (payload.error?.includes('already in use') ? 'LICENSE_IN_USE' : undefined)
    throw new LicenseActivationError(payload.error || `License check failed (HTTP ${response.status}).`, code)
  }

  saveLicenseKey(licenseKey)
  markLicenseLocallyVerified(licenseKey)
  return payload
}
