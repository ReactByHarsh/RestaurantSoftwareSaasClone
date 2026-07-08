import { check, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauriDesktop } from './localDb'

export type UpdateCheckResult =
  | { status: 'not-desktop' | 'up-to-date' }
  | { status: 'available'; version: string; notes?: string; date?: string }

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriDesktop()) return { status: 'not-desktop' }
  try {
    const update = await check()
    if (!update) return { status: 'up-to-date' }
    const result: UpdateCheckResult = {
      status: 'available',
      version: update.version,
      notes: update.body,
      date: update.date,
    }
    await update.close()
    return result
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not check for updates: ${detail}`)
  }
}

export async function downloadAndInstallUpdate(onEvent?: (event: DownloadEvent) => void) {
  if (!isTauriDesktop()) return false
  try {
    const update = await check()
    if (!update) return false
    await update.downloadAndInstall(onEvent)
    await update.close()
    await relaunch()
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not install update: ${detail}`)
  }
}
