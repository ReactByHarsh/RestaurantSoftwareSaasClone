import { invoke } from '@tauri-apps/api/core'

export interface MenuLanguageOption {
  code: string
  label: string
  nativeLabel: string
  /** False for languages the free translation endpoint does not support (manual entry still works). */
  autoTranslate: boolean
}

export const MENU_LANGUAGES: MenuLanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', autoTranslate: false },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া', autoTranslate: true },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', autoTranslate: true },
  { code: 'bho', label: 'Bhojpuri', nativeLabel: 'भोजपुरी', autoTranslate: true },
  { code: 'brx', label: 'Bodo', nativeLabel: 'बड़ो', autoTranslate: false },
  { code: 'doi', label: 'Dogri', nativeLabel: 'डोगरी', autoTranslate: true },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', autoTranslate: true },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', autoTranslate: true },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', autoTranslate: true },
  { code: 'ks', label: 'Kashmiri', nativeLabel: 'कॉशुर', autoTranslate: false },
  { code: 'gom', label: 'Konkani', nativeLabel: 'कोंकणी', autoTranslate: true },
  { code: 'mai', label: 'Maithili', nativeLabel: 'मैथिली', autoTranslate: true },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', autoTranslate: true },
  { code: 'mni-Mtei', label: 'Manipuri', nativeLabel: 'মৈতৈলোন্', autoTranslate: true },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', autoTranslate: true },
  { code: 'lus', label: 'Mizo', nativeLabel: 'Mizo', autoTranslate: true },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली', autoTranslate: true },
  { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ', autoTranslate: true },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', autoTranslate: true },
  { code: 'sa', label: 'Sanskrit', nativeLabel: 'संस्कृतम्', autoTranslate: true },
  { code: 'sat', label: 'Santali', nativeLabel: 'ᱥᱟᱱᱛᱟᱲᱤ', autoTranslate: true },
  { code: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي', autoTranslate: true },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', autoTranslate: true },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', autoTranslate: true },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', autoTranslate: true },
]

export const TRANSLATE_BATCH_SIZE = 10

const translationCache = new Map<string, string>()

export function menuLanguageOption(code?: string) {
  return MENU_LANGUAGES.find((language) => language.code === code) ?? MENU_LANGUAGES[0]
}

export function menuLanguageLabel(code?: string) {
  return menuLanguageOption(code).label
}

export function menuLanguageDisplay(code?: string) {
  const option = menuLanguageOption(code)
  return option.code === 'en' ? option.label : `${option.label} (${option.nativeLabel})`
}

export function isAutoTranslatableLanguage(code?: string) {
  return menuLanguageOption(code).autoTranslate
}

function tauriAvailable() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function translateMenuChunk(texts: string[], target: string) {
  const option = menuLanguageOption(target)
  if (option.code === 'en' || texts.length === 0) return texts
  if (!option.autoTranslate) {
    throw new Error(`Automatic translation is not available for ${option.label}. Add those names manually.`)
  }
  if (!tauriAvailable()) {
    throw new Error('Automatic translation is available in the Bhojpatra desktop app.')
  }

  const cached = texts.map((text) => translationCache.get(`${target}:${text}`))
  const missing = texts
    .map((text, index) => ({ text, index }))
    .filter((entry) => cached[entry.index] === undefined)

  if (missing.length > 0) {
    const translated = await invoke<string[]>('translate_texts', {
      texts: missing.map((entry) => entry.text),
      target,
    })
    if (!Array.isArray(translated) || translated.length !== missing.length) {
      throw new Error('The translation service returned an unexpected response.')
    }
    missing.forEach((entry, index) => {
      const value = String(translated[index] ?? '').trim() || entry.text
      translationCache.set(`${target}:${entry.text}`, value)
      cached[entry.index] = value
    })
  }

  return cached.map((value) => value ?? '')
}

export async function translateMenuTexts(texts: string[], target: string) {
  const results: string[] = []
  for (let index = 0; index < texts.length; index += TRANSLATE_BATCH_SIZE) {
    results.push(...await translateMenuChunk(texts.slice(index, index + TRANSLATE_BATCH_SIZE), target))
  }
  return results
}
