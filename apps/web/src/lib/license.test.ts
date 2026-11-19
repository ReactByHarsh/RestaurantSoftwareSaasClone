import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLicenseLocalVerification,
  isLicenseLocallyVerified,
  markLicenseLocallyVerified,
  readSavedLicenseKey,
} from './license'

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})

describe('license storage and local verification', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads empty key when none saved', () => {
    expect(readSavedLicenseKey()).toBe('')
    expect(isLicenseLocallyVerified()).toBe(false)
  })

  it('persists and verifies license locally', () => {
    const key = 'BP-TEST-LICENSE-1234'
    markLicenseLocallyVerified(key)
    expect(isLicenseLocallyVerified(key)).toBe(true)
    expect(isLicenseLocallyVerified('BP-OTHER-KEY')).toBe(false)

    clearLicenseLocalVerification()
    expect(isLicenseLocallyVerified(key)).toBe(false)
  })
})
