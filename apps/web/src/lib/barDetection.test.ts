import { describe, expect, it } from 'vitest'
import { getBarCategoryIds, hasBarItems, isBarCategory } from './barDetection'
import type { MenuCategory, MenuItem } from './types'

function makeCategory(id: string, name: string, options: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id,
    outletId: 'out_test',
    name,
    sortOrder: 0,
    isActive: true,
    ...options,
  }
}

function makeItem(id: string, name: string, categoryId: string, options: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    outletId: 'out_test',
    categoryId,
    name,
    itemType: 'veg',
    pricePaise: 10000,
    taxPercent: 5,
    isAvailable: true,
    sortOrder: 0,
    ...options,
  }
}

describe('barDetection', () => {
  it('correctly identifies bar categories in a restaurant with liquor/bar (e.g. Aura Elixir)', () => {
    const parentBar = makeCategory('cat_bar', 'BAR')
    const whisky = makeCategory('cat_whisky', 'Regular Whisky', { parentId: 'cat_bar' })
    const beer = makeCategory('cat_beer', 'Mild Beer', { parentId: 'cat_bar' })
    const rum = makeCategory('cat_rum', 'Rum', { parentId: 'cat_bar' })
    const foodCat = makeCategory('cat_food', 'Main Course')

    expect(isBarCategory(parentBar)).toBe(true)
    expect(isBarCategory(whisky, parentBar)).toBe(true)
    expect(isBarCategory(beer, parentBar)).toBe(true)
    expect(isBarCategory(rum, parentBar)).toBe(true)
    expect(isBarCategory(foodCat)).toBe(false)

    const categories = [parentBar, whisky, beer, rum, foodCat]
    const barIds = getBarCategoryIds(categories)
    expect(barIds.has('cat_bar')).toBe(true)
    expect(barIds.has('cat_whisky')).toBe(true)
    expect(barIds.has('cat_beer')).toBe(true)
    expect(barIds.has('cat_rum')).toBe(true)
    expect(barIds.has('cat_food')).toBe(false)

    const items = [
      makeItem('item_1', 'Royal Challenge 180ml', 'cat_whisky'),
      makeItem('item_2', 'Paneer Butter Masala', 'cat_food'),
    ]

    expect(hasBarItems(categories, items)).toBe(true)
  })

  it('does NOT trigger bar detection for pure food/veg restaurants with Sambar, Barbeque, Barfi, or Ginger', () => {
    const southIndian = makeCategory('cat_si', 'South Indian')
    const desserts = makeCategory('cat_des', 'Desserts & Sweets')
    const tandoor = makeCategory('cat_tan', 'Tandoor & Barbeque')
    const beverages = makeCategory('cat_bev', 'Hot & Cold Beverages')

    const categories = [southIndian, desserts, tandoor, beverages]
    const barIds = getBarCategoryIds(categories)
    expect(barIds.size).toBe(0)

    const items = [
      makeItem('item_sambar', 'Idli Sambar Vada', 'cat_si'),
      makeItem('item_ginger', 'Hot Ginger Tea', 'cat_bev'),
      makeItem('item_barfi', 'Kaju Barfi', 'cat_des'),
      makeItem('item_bbq', 'Paneer Barbeque Skewer', 'cat_tan'),
      makeItem('item_crumb', 'Crumb Fried Veg Patty', 'cat_si'),
      makeItem('item_drumstick', 'Drumstick Masala Curry', 'cat_si'),
    ]

    expect(hasBarItems(categories, items)).toBe(false)
  })

  it('does NOT trigger bar detection for items marked with isSeparateBill (e.g. bakery/sweets/ice cream)', () => {
    const bakery = makeCategory('cat_bakery', 'Bakery & Pastries')
    const iceCream = makeCategory('cat_ice', 'Ice Cream Parlour', { separateBill: true })
    const categories = [bakery, iceCream]

    const items = [
      makeItem('item_cake', 'Black Forest Cake', 'cat_bakery', { isSeparateBill: true }),
      makeItem('item_vanilla', 'Vanilla Scoop', 'cat_ice', { isSeparateBill: true }),
    ]

    expect(hasBarItems(categories, items)).toBe(false)
  })

  it('excludes non-bar exclusions like Salad Bar, Chocolate Bar, or Mocktails', () => {
    const saladBar = makeCategory('cat_salad', 'Salad Bar')
    const chocolateBar = makeCategory('cat_choc', 'Chocolate Bar & Confectionery')
    const mocktails = makeCategory('cat_mock', 'Virgin Mojito & Mocktails')
    const categories = [saladBar, chocolateBar, mocktails]

    expect(isBarCategory(saladBar)).toBe(false)
    expect(isBarCategory(chocolateBar)).toBe(false)
    expect(isBarCategory(mocktails)).toBe(false)
    expect(getBarCategoryIds(categories).size).toBe(0)

    const items = [
      makeItem('item_salad', 'Greek Salad Bowl', 'cat_salad'),
      makeItem('item_mock', 'Virgin Mint Mojito', 'cat_mock'),
    ]

    expect(hasBarItems(categories, items)).toBe(false)
  })

  it('respects explicit billGroup configuration', () => {
    const catExplicitLiquor = makeCategory('cat_1', 'Custom Drinks', { billGroup: 'liquor' })
    const catExplicitBar = makeCategory('cat_2', 'Lounge Specials', { billGroup: 'bar' })
    const catExplicitFood = makeCategory('cat_3', 'Barbeque Grill', { billGroup: 'food' })

    expect(isBarCategory(catExplicitLiquor)).toBe(true)
    expect(isBarCategory(catExplicitBar)).toBe(true)
    expect(isBarCategory(catExplicitFood)).toBe(false)
  })

  it('supports Devanagari bar terms', () => {
    const catHindiBar = makeCategory('cat_hn_1', 'बार मेनू')
    const catHindiDaru = makeCategory('cat_hn_2', 'मदिरा विभाग')

    expect(isBarCategory(catHindiBar)).toBe(true)
    expect(isBarCategory(catHindiDaru)).toBe(true)
  })
})
