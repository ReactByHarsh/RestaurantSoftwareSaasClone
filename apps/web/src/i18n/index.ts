import { en } from './en'
import { hi } from './hi'
import { mr } from './mr'
import { pageEn } from './page-en'
import { pageHi } from './page-hi'
import { pageMr } from './page-mr'
import { pageEnExtra } from './page-en-extra'
import { pageHiExtra } from './page-hi-extra'
import { pageMrExtra } from './page-mr-extra'
import type { AppLanguage, TranslationMessages } from './types'

export type { AppLanguage }

export const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; labelKey: string }> = [
  { value: 'en', labelKey: 'english' },
  { value: 'hi', labelKey: 'hindi' },
  { value: 'mr', labelKey: 'marathi' },
]

export const dictionaries: Record<AppLanguage, TranslationMessages> = {
  en: { ...en, ...pageEn, ...pageEnExtra },
  hi: { ...en, ...pageEn, ...pageEnExtra, ...hi, ...pageHi, ...pageHiExtra },
  mr: { ...en, ...pageEn, ...pageEnExtra, ...mr, ...pageMr, ...pageMrExtra },
}

export function getDictionary(language: AppLanguage) {
  return dictionaries[language] ?? en
}

const sourceKeyByText = new Map<string, string>()
const sourceKeyByNormalizedText = new Map<string, string>()
Object.entries(dictionaries.en).forEach(([key, value]) => {
  if (!sourceKeyByText.has(value)) sourceKeyByText.set(value, key)
  const normalized = value.toLocaleLowerCase()
  if (!sourceKeyByNormalizedText.has(normalized)) sourceKeyByNormalizedText.set(normalized, key)
})

function preserveWhitespace(value: string, translated: string) {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return translated
  return `${match[1]}${translated}${match[3]}`
}

export function translateText(value: string, language: AppLanguage) {
  const trimmed = value.trim()
  if (!trimmed) return value
  const key = sourceKeyByText.get(trimmed) ?? sourceKeyByNormalizedText.get(trimmed.toLocaleLowerCase())
  if (!key) return value
  const translated = getDictionary(language)[key] ?? trimmed
  return preserveWhitespace(value, translated)
}

export function translateAttribute(value: string | null, language: AppLanguage) {
  return value === null ? null : translateText(value, language)
}
