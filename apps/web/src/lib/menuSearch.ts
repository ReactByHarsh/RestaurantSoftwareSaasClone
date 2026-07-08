import type { MenuItem } from './types'

function normalizeSearchValue(value?: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s/-]+/g, '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSearchValue(value?: string) {
  return normalizeSearchValue(value).replace(/\s+/g, '')
}

function searchTokens(value?: string) {
  return normalizeSearchValue(value).split(' ').filter(Boolean)
}

function searchInitials(value?: string) {
  return searchTokens(value).map((token) => token[0]).join('')
}

function isSubsequence(query: string, target: string) {
  if (!query) return true
  let queryIndex = 0
  for (const char of target) {
    if (char === query[queryIndex]) queryIndex += 1
    if (queryIndex >= query.length) return true
  }
  return false
}

function scoreMenuItem(item: MenuItem, rawQuery: string) {
  const normalizedQuery = normalizeSearchValue(rawQuery)
  if (!normalizedQuery) return 0

  const compactQuery = normalizedQuery.replace(/\s+/g, '')
  const normalizedName = normalizeSearchValue(item.name)
  const compactName = compactSearchValue(item.name)
  const initials = searchInitials(item.name)
  const normalizedShortCode = normalizeSearchValue(item.shortCode)
  const compactShortCode = compactSearchValue(item.shortCode)
  const normalizedBarcode = normalizeSearchValue(item.barcode)

  if (normalizedBarcode && normalizedBarcode === normalizedQuery) return 1200
  if (normalizedShortCode && normalizedShortCode === normalizedQuery) return 1180
  if (normalizedName === normalizedQuery) return 1160
  if (compactName === compactQuery) return 1140
  if (initials && initials === compactQuery) return 1120
  if (normalizedShortCode && normalizedShortCode.startsWith(normalizedQuery)) return 1080
  if (compactShortCode && compactShortCode.startsWith(compactQuery)) return 1060
  if (initials && initials.startsWith(compactQuery)) return 1040
  if (compactName.startsWith(compactQuery)) return 1020
  if (normalizedName.startsWith(normalizedQuery)) return 1000
  if (normalizedName.includes(normalizedQuery)) return 960
  if (compactName.includes(compactQuery)) return 920
  if (compactQuery.length >= 2 && isSubsequence(compactQuery, initials)) return 900
  if (compactQuery.length >= 2 && isSubsequence(compactQuery, compactName)) return 860

  return -1
}

export function filterMenuItemsByQuery(items: MenuItem[], query: string) {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  return items
    .map((item) => ({ item, score: scoreMenuItem(item, normalizedQuery) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.item.name.localeCompare(right.item.name, undefined, { sensitivity: 'base' })
    })
    .map((entry) => entry.item)
}

export function findBestMenuItemMatch(items: MenuItem[], query: string) {
  return filterMenuItemsByQuery(items, query)[0]
}
