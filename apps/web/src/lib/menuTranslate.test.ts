import { describe, expect, it } from 'vitest'
import {
  MENU_LANGUAGES,
  isAutoTranslatableLanguage,
  menuLanguageDisplay,
  menuLanguageLabel,
  menuLanguageOption,
} from './menuTranslate'

describe('menu languages', () => {
  it('offers English plus Indian languages', () => {
    expect(menuLanguageOption('en').label).toBe('English')
    expect(menuLanguageLabel('mr')).toBe('Marathi')
    expect(menuLanguageDisplay('mr')).toBe('Marathi (मराठी)')
    expect(MENU_LANGUAGES.filter((language) => language.code !== 'en').length).toBeGreaterThanOrEqual(20)
  })

  it('marks languages without free automatic translation as manual', () => {
    expect(isAutoTranslatableLanguage('mr')).toBe(true)
    expect(isAutoTranslatableLanguage('hi')).toBe(true)
    expect(isAutoTranslatableLanguage('ks')).toBe(false)
    expect(isAutoTranslatableLanguage('brx')).toBe(false)
  })
})
