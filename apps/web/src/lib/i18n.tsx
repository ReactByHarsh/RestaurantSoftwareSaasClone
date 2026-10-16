import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { getDictionary, LANGUAGE_OPTIONS, translateAttribute, translateText, type AppLanguage } from '../i18n'

export { getDictionary }
export { LANGUAGE_OPTIONS }
export type { AppLanguage }

export function useI18n() {
  const language = useUIStore((state) => state.language)
  const setLanguage = useUIStore((state) => state.setLanguage)
  const dictionary = getDictionary(language)

  return {
    language,
    setLanguage,
    t: (key: string, fallback?: string) => dictionary[key] ?? fallback ?? key,
  }
}

type TextState = { original: string; translated: string }
const textStates = new WeakMap<Text, TextState>()
const attributeStates = new WeakMap<Element, Map<string, TextState>>()

function translateDom(root: HTMLElement, language: AppLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    const textNode = node as Text
    const parent = textNode.parentElement
    if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
      const current = textNode.nodeValue ?? ''
      const previous = textStates.get(textNode)
      const original = previous && (current === previous.translated || current === previous.original)
        ? previous.original
        : current
      const translated = translateText(original, language)
      textStates.set(textNode, { original, translated })
      if (current !== translated) textNode.nodeValue = translated
    }
    node = walker.nextNode()
  }

  root.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label], [alt]').forEach((element) => {
    const states = attributeStates.get(element) ?? new Map<string, TextState>()
    for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
      const current = element.getAttribute(attribute)
      if (current === null) continue
      const previous = states.get(attribute)
      const original = previous && (current === previous.translated || current === previous.original)
        ? previous.original
        : current
      const translated = translateAttribute(original, language) ?? original
      states.set(attribute, { original, translated })
      if (current !== translated) element.setAttribute(attribute, translated)
    }
    attributeStates.set(element, states)
  })
}

/**
 * Translates existing and newly rendered text nodes so legacy pages also
 * participate while they are being migrated to explicit t() calls.
 */
export function I18nRuntime() {
  const language = useUIStore((state) => state.language)

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    let applying = false
    const apply = () => {
      applying = true
      translateDom(root, language)
      queueMicrotask(() => { applying = false })
    }
    apply()
    const observer = new MutationObserver(() => {
      if (!applying) apply()
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'] })
    return () => observer.disconnect()
  }, [language])

  return null
}
