// One gate for all restaurant cloud traffic. Local SQLite/LAN operations do
// not use this transport and continue normally when cloud sync is off.
type CloudPreference = {
  enabled?: boolean
  serverUrl?: string
  accountLogin?: string
  accountSecret?: string
  autoSyncEnabled?: boolean
  autoSyncDaily?: boolean
  nextSyncAt?: string
}
let generation = 0
const requests = new Set<AbortController>()

export function readCloudPreference(): CloudPreference {
  const normalize = (preference?: CloudPreference | null): CloudPreference => preference?.enabled === true
    ? preference
    : { ...preference, enabled: false, autoSyncEnabled: false, autoSyncDaily: false, nextSyncAt: undefined }
  try {
    if (typeof localStorage === 'undefined') return normalize()
    const raw = localStorage.getItem('bhojpatra-cloud-settings-v2')
    if (raw) {
      const parsed = JSON.parse(raw) as CloudPreference | null
      if (parsed && typeof parsed === 'object') return normalize(parsed)
    }
    const legacy = localStorage.getItem('bhojpatra-restaurant-data-v2')
    const parsedLegacy = legacy ? JSON.parse(legacy)?.state?.cloudSync : null
    return normalize(parsedLegacy && typeof parsedLegacy === 'object' ? parsedLegacy as CloudPreference : null)
  } catch { return normalize() }
}

export function cancelCloudRequests() {
  generation += 1
  requests.forEach(controller => controller.abort())
  requests.clear()
}

export function assertCloudSyncEnabled() {
  if (readCloudPreference().enabled !== true) throw new Error('Cloud sync is disabled. Local data is kept on this device.')
}

export function cloudSessionIsCurrent(settings: CloudPreference) {
  const current = readCloudPreference()
  return settings.enabled === true && current.enabled === true && (
    current.serverUrl === settings.serverUrl && current.accountLogin === settings.accountLogin &&
    current.accountSecret === settings.accountSecret
  )
}

export function guardCloudSession(settings: CloudPreference) {
  const startedGeneration = generation
  return () => startedGeneration === generation && cloudSessionIsCurrent(settings)
}

export async function cloudFetch(url: string, options?: RequestInit): Promise<Response> {
  assertCloudSyncEnabled()
  const startedGeneration = generation
  const controller = new AbortController()
  requests.add(controller)
  const check = () => {
    if (startedGeneration !== generation || controller.signal.aborted) throw new DOMException('Cloud sync stopped', 'AbortError')
    assertCloudSyncEnabled()
  }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    check()
    // Also guard delayed response bodies: turning the switch off must prevent
    // an already downloaded snapshot from being applied to local state.
    const json = response.json.bind(response)
    response.json = async () => {
      try {
        check()
        const payload = await json()
        check()
        return payload
      } finally { requests.delete(controller) }
    }
    if (!response.ok) {
      // Error bodies (notably login errors) still need to be readable.
      requests.delete(controller)
    }
    return response
  } catch (error) {
    requests.delete(controller)
    throw error
  }
}
