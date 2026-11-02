const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php'
const WIKIPEDIA_ENDPOINT = 'https://en.wikipedia.org/w/api.php'
const REQUEST_TIMEOUT_MS = 9000
const MIN_REQUEST_GAP_MS = 220
const RETRY_DELAY_MS = 2500
const CACHE_LIMIT = 4000

export const MENU_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const MENU_IMAGE_FORMATS_LABEL = 'PNG, JPG/JPEG, WEBP or GIF'
export const MENU_IMAGE_MAX_INPUT_BYTES = 2_000_000
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_REMOTE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'into', 'style', 'fresh', 'special',
  'hot', 'cold', 'large', 'small', 'medium', 'plate', 'served', 'food', 'dish',
  'cuisine', 'image', 'photo', 'ml', 'cl', 'litre', 'liter', 'kg', 'pcs',
  'pc', 'nip', 'pint', 'quts', 'bottle', 'can', 'pack', 'size', 'nos',
])

const BLOCKED_TITLE_WORDS = /\b(logo|icon|map|diagram|chart|poster|cover|label|screenshot|document|stamp|sign|banner|template)\b/i
const VOLUME_WORDS = /\b(nip|pint|quts|quarter|bottle|can|pcs|pc|ml|cl|litre|liter)\b/gi
const LIQUOR_HINTS = /\b(whisky|whiskey|scotch|rum|vodka|gin|brandy|beer|wine|liquor|malt)\b/i

type CommonsPage = {
  title?: string
  imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }>
}

type WikipediaPage = {
  title?: string
  thumbnail?: { source?: string }
}

type CommonsResponse = { query?: { pages?: Record<string, CommonsPage> } }
type WikipediaResponse = { query?: { pages?: Record<string, WikipediaPage> } }

type FetchOutcome<T> = { ok: true; data: T } | { ok: false; retry: boolean }

let requestChain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
const imageCache = new Map<string, string | null>()

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return task()
  })
  requestChain = run.then(() => undefined, () => undefined)
  return run
}

async function fetchJson<T>(url: string): Promise<FetchOutcome<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (response.status === 429) return { ok: false, retry: true }
    if (!response.ok) return { ok: false, retry: false }
    return { ok: true, data: await response.json() as T }
  } catch {
    return { ok: false, retry: false }
  } finally {
    clearTimeout(timeout)
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/^file:/, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

export function imageSearchRelevance(title: string, itemName: string) {
  const nameTokens = tokenize(itemName)
  const meaningfulTokens = nameTokens.filter((token) => /[a-z]/.test(token))
  if (meaningfulTokens.length === 0) return 0
  const titleTokens = new Set(tokenize(title))
  let exactMatches = 0
  let fuzzyMatches = 0
  meaningfulTokens.forEach((token) => {
    if (titleTokens.has(token)) {
      exactMatches += 1
      return
    }
    if (token.length >= 4 && Array.from(titleTokens).some((candidate) => candidate.includes(token) || token.includes(candidate))) {
      fuzzyMatches += 1
    }
  })
  // A fuzzy word match alone (for example "Piper" for "100 Pipers") is not
  // enough to trust an image. At least one exact product word must match.
  if (exactMatches === 0) return 0
  const numericTokens = nameTokens.filter((token) => /^\d+$/.test(token))
  const numericBonus = numericTokens.length > 0
    ? 0.25 * (numericTokens.filter((token) => titleTokens.has(token)).length / numericTokens.length)
    : 0
  return (exactMatches + fuzzyMatches * 0.5) / meaningfulTokens.length + numericBonus
}

export function buildImageSearchQueries(name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return []
  const queries = [cleaned]
  const withoutVolume = cleaned
    .replace(/\b\d+(?:\.\d+)?\s*(?:ml|cl|l|litre|liter)\b/gi, ' ')
    .replace(VOLUME_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (withoutVolume && !queries.includes(withoutVolume)) queries.push(withoutVolume)
  if (LIQUOR_HINTS.test(cleaned)) {
    const withoutSize = cleaned.replace(/\s+\d{2,4}$/, '').trim()
    if (withoutSize && !queries.includes(withoutSize)) queries.push(withoutSize)
  }
  const withoutTrailingNumber = cleaned.replace(/\s+\d{2,4}$/, '').trim()
  if (withoutTrailingNumber && withoutTrailingNumber.length >= 3 && !queries.includes(withoutTrailingNumber)) {
    queries.push(withoutTrailingNumber)
  }
  return queries.slice(0, 4)
}

export function pickCommonsImage(pages: CommonsPage[], itemName: string) {
  const candidates = pages
    .map((page) => {
      const info = page.imageinfo?.[0]
      const url = info?.thumburl || info?.url
      if (!page.title || !url) return null
      if (info?.mime && !ALLOWED_REMOTE_MIME.has(info.mime)) return null
      if (BLOCKED_TITLE_WORDS.test(page.title)) return null
      const score = imageSearchRelevance(page.title, itemName)
      return { url, score }
    })
    .filter((candidate): candidate is { url: string; score: number } => Boolean(candidate))
    .filter((candidate) => candidate.url.startsWith('http') && candidate.score >= 0.5)
    .sort((a, b) => b.score - a.score)
  return candidates[0]?.url ?? null
}

async function fetchCommonsPages(query: string) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '640',
    format: 'json',
    origin: '*',
  })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcome = await enqueue(() => fetchJson<CommonsResponse>(`${COMMONS_ENDPOINT}?${params.toString()}`))
    if (outcome.ok) return Object.values(outcome.data.query?.pages ?? {})
    if (!outcome.retry) return []
    await sleep(RETRY_DELAY_MS * (attempt + 1))
  }
  return []
}

async function fetchWikipediaImage(itemName: string) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: itemName,
    gsrlimit: '3',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '640',
    format: 'json',
    origin: '*',
  })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcome = await enqueue(() => fetchJson<WikipediaResponse>(`${WIKIPEDIA_ENDPOINT}?${params.toString()}`))
    if (outcome.ok) {
      const pages = Object.values(outcome.data.query?.pages ?? {})
        .filter((page) => page.thumbnail?.source && imageSearchRelevance(page.title ?? '', itemName) >= 0.5)
        .sort((a, b) => imageSearchRelevance(b.title ?? '', itemName) - imageSearchRelevance(a.title ?? '', itemName))
      return pages[0]?.thumbnail?.source ?? null
    }
    if (!outcome.retry) return null
    await sleep(RETRY_DELAY_MS * (attempt + 1))
  }
  return null
}

export async function fetchMenuItemImageUrl(name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null
  const cacheKey = cleaned.toLowerCase()
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey) ?? null

  let found: string | null = null
  for (const query of buildImageSearchQueries(cleaned)) {
    const image = pickCommonsImage(await fetchCommonsPages(query), cleaned)
    if (image) {
      found = image
      break
    }
  }
  if (!found) found = await fetchWikipediaImage(cleaned)

  if (imageCache.size >= CACHE_LIMIT) imageCache.clear()
  imageCache.set(cacheKey, found)
  return found
}

export function isSupportedMenuImageFile(file: File) {
  return ALLOWED_IMAGE_TYPES.has(file.type)
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the selected image'))
    reader.readAsDataURL(file)
  })
}

async function downscaleImage(dataUrl: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Could not decode the selected image'))
    element.src = dataUrl
  })
  const maxDimension = 640
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  if (scale >= 1 && dataUrl.length < 220_000) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const compressed = canvas.toDataURL('image/jpeg', 0.85)
  return compressed.length < dataUrl.length ? compressed : dataUrl
}

export async function readMenuImageFile(file: File) {
  if (!isSupportedMenuImageFile(file)) {
    throw new Error(`Unsupported image format. Use ${MENU_IMAGE_FORMATS_LABEL}.`)
  }
  if (file.size > MENU_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Image should be 2 MB or smaller.')
  }
  const dataUrl = await fileToDataUrl(file)
  if (file.type === 'image/gif') return dataUrl
  try {
    return await downscaleImage(dataUrl)
  } catch {
    return dataUrl
  }
}
