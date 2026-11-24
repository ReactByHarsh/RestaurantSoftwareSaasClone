import type { MenuCategory, MenuItem } from './types'

export const LIQUOR_WORD_PATTERN =
  /\b(bar|liquor|liquors|alcohol|alcoholic|beer|beers|wine|wines|champagne|whisky|whiskey|whiskeys|rum|vodka|gin|brandy|scotch|tequila|cognac|liqueur|liqueurs|breezer|breezers|cocktail|cocktails|spirits?|hard\s*drinks?)\b/i

export const DEVANAGARI_LIQUOR_PATTERN = /(बार|दारू|मदिरा|मद्य)/

/**
 * Common culinary and non-alcoholic terms that may contain substrings or words like "bar", "gin", "rum",
 * but must NEVER trigger bar/liquor classification (e.g. Sambar, Barbeque, Barfi, Salad Bar, Ginger, Mocktails).
 */
export const NON_BAR_EXCLUSION_PATTERN =
  /\b(mocktail|mocktails|virgin|non[-\s]?alcoholic|soft\s*drinks?|shakes?|milkshakes?|smoothies?|juices?|tea|chai|coffee|lassi|sharbat|soda|sambar|barbeque|barbecue|bbq|barfi|burfi|salad\s*bar|chocolate\s*bar|snack\s*bar|energy\s*bar|ice\s*cream\s*bar|sweets?|mithai|desserts?|bakery|cakes?|pastry|pastries|bread|roti|rice|dal|curry|sabzi|thali|dosa|chinese|tandoor|starters?|soups?|munchies|chaat|snacks?)\b/i

/**
 * Returns true if the category (or its parent) explicitly represents a bar / liquor category.
 */
export function isBarCategory(category: MenuCategory, parentCategory?: MenuCategory): boolean {
  const directBillGroup = category.billGroup?.trim().toLowerCase()
  const parentBillGroup = parentCategory?.billGroup?.trim().toLowerCase()
  const effectiveBillGroup = directBillGroup || parentBillGroup

  if (effectiveBillGroup === 'bar' || effectiveBillGroup === 'liquor' || effectiveBillGroup === 'alcohol') {
    return true
  }
  if (
    effectiveBillGroup === 'food' ||
    effectiveBillGroup === 'kitchen' ||
    effectiveBillGroup === 'bakery' ||
    effectiveBillGroup === 'dessert'
  ) {
    return false
  }

  const categoryName = category.name.trim()
  const parentName = parentCategory?.name.trim() || ''

  // Direct category matching non-bar exclusions (e.g. "Salad Bar", "Mocktails", "Barbeque", "Barfi")
  if (NON_BAR_EXCLUSION_PATTERN.test(categoryName)) {
    return false
  }

  // Check category name
  if (LIQUOR_WORD_PATTERN.test(categoryName) || DEVANAGARI_LIQUOR_PATTERN.test(categoryName)) {
    return true
  }

  // Check parent category name
  if (parentName && !NON_BAR_EXCLUSION_PATTERN.test(parentName)) {
    if (LIQUOR_WORD_PATTERN.test(parentName) || DEVANAGARI_LIQUOR_PATTERN.test(parentName)) {
      return true
    }
  }

  return false
}

/**
 * Builds the set of all active category IDs that represent bar categories (including their valid child subcategories).
 */
export function getBarCategoryIds(categories: MenuCategory[]): Set<string> {
  const activeCategories = categories.filter((c) => c.isActive)
  const categoryById = new Map(activeCategories.map((c) => [c.id, c]))
  const ids = new Set<string>()

  // 1. Direct bar categories
  activeCategories.forEach((category) => {
    const parent = category.parentId ? categoryById.get(category.parentId) : undefined
    if (isBarCategory(category, parent)) {
      ids.add(category.id)
    }
  })

  // 2. Subcategories whose parent is a bar category (unless subcategory is an exclusion like mocktails)
  activeCategories.forEach((category) => {
    if (category.parentId && ids.has(category.parentId)) {
      if (!NON_BAR_EXCLUSION_PATTERN.test(category.name.trim())) {
        ids.add(category.id)
      }
    }
  })

  return ids
}

/**
 * Returns true only if the restaurant has active bar categories AND saleable items within those bar categories.
 * Pure food restaurants, bakeries, cafes, and vegetarian outlets will always return false.
 */
export function hasBarItems(categories: MenuCategory[], saleableMenuItems: MenuItem[]): boolean {
  const barCategoryIds = getBarCategoryIds(categories)
  if (barCategoryIds.size === 0) return false
  return saleableMenuItems.some((item) => barCategoryIds.has(item.categoryId))
}
