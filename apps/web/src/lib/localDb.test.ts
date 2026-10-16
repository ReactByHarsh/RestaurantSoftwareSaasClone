import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BillingSnapshot } from './cloudSync'
import { saveDesktopState } from './localDb'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('desktop local-save ordering', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('serializes table-close and background saves through the same queue', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    let finishFirst!: () => void
    vi.mocked(invoke).mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce(undefined)
    const older = { savedCarts: { table1: [] } } as unknown as BillingSnapshot
    const latest = { savedCarts: { table1: [{ menuItemId: 'product-1' }] } } as unknown as BillingSnapshot
    const first = saveDesktopState(older, [])
    const second = saveDesktopState(latest, [])
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    finishFirst()
    await Promise.all([first, second])
    expect(vi.mocked(invoke).mock.calls.map(call => call[1])).toEqual([
      { snapshot: older, staff: [] }, { snapshot: latest, staff: [] },
    ])
  })

  it('continues saving the latest cart after an earlier disk write fails', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    vi.mocked(invoke).mockRejectedValueOnce(new Error('temporary disk failure')).mockResolvedValueOnce(undefined)
    const snapshot = {} as BillingSnapshot
    await expect(saveDesktopState(snapshot, [])).rejects.toThrow('temporary disk failure')
    await expect(saveDesktopState(snapshot, [])).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
