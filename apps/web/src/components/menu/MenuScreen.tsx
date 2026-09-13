import { useMemo, useRef, useState } from 'react'
import { ChefHat, ChevronLeft, ChevronRight, Download, Edit2, FileDown, FileText, Percent, Plus, Search, Trash2, Upload } from 'lucide-react'
import type { MenuCategory, MenuItem, ProductUsageType, RecipeItem, StockUnit } from '../../lib/types'
import { formatPaise } from '../../lib/money'
import { useUIStore } from '../../store/uiStore'
import { useBillingStore } from '../../store/billingStore'
import { clsx } from 'clsx'
import { convertRecipeQuantity, exportProducts, generateTemplate, parseCsvRows, parseRecipeField } from '../../lib/csv'

const PAGE_SIZE = 25
const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'nos', 'plate', 'portion']
const PRODUCT_TYPES: { value: ProductUsageType; label: string }[] = [
  { value: 'sale_purchase', label: 'Sale / Purchase both' },
  { value: 'sale_only', label: 'Sale only' },
  { value: 'purchase_only', label: 'Purchase only' },
  { value: 'kitchen_processed', label: 'Kitchen processed' },
]
const FIELD_CLASS = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all shadow-sm bg-white'

function paiseToInput(value?: number) {
  return value === undefined ? '' : (value / 100).toString()
}

function parsePaise(fd: FormData, name: string, fallback = 0) {
  const raw = String(fd.get(name) ?? '').trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : fallback
}

function parseNumber(fd: FormData, name: string, fallback = 0) {
  const raw = String(fd.get(name) ?? '').trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function productTypeLabel(type?: ProductUsageType) {
  return PRODUCT_TYPES.find(option => option.value === (type ?? 'sale_only'))?.label ?? 'Sale only'
}

function categoryOptionLabel(category: MenuCategory, categoriesById: Map<string, MenuCategory>) {
  const parent = category.parentId ? categoriesById.get(category.parentId) : undefined
  return parent ? `${parent.name} / ${category.name}` : category.name
}

function categoryBranchIds(categories: MenuCategory[], categoryId: string, includeChildren: boolean) {
  const ids = new Set([categoryId])
  if (includeChildren) {
    categories
      .filter(category => category.parentId === categoryId)
      .forEach(category => ids.add(category.id))
  }
  return ids
}

export default function MenuScreen() {
  const { addToast } = useUIStore()
  const {
    menuCategories: categories,
    menuItems: items,
    inventoryItems,
    stations,
    addCategory,
    addStation,
    addInventoryItem,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    updateCategory,
  } = useBillingStore()

  const [page, setPage] = useState(1)
  const [searchCode, setSearchCode] = useState('')
  const [searchName, setSearchName] = useState('')
  const [searchCategory, setSearchCategory] = useState('')
  const [showItemModal, setShowItemModal] = useState(false)
  const [showTaxModal, setShowTaxModal] = useState(false)
  const [showBillingRuleModal, setShowBillingRuleModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [draftRecipe, setDraftRecipe] = useState<RecipeItem[]>([])
  const [recipeIngredientName, setRecipeIngredientName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categoriesById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const parentCategories = useMemo(() => categories.filter(category => !category.parentId && category.isActive), [categories])
  const subcategories = useMemo(() => categories.filter(category => category.parentId && category.isActive), [categories])
  const stationsById = useMemo(() => new Map(stations.map(station => [station.id, station])), [stations])
  const editingCategory = editingItem ? categoriesById.get(editingItem.categoryId) : undefined
  const editingParentCategory = editingCategory?.parentId ? categoriesById.get(editingCategory.parentId) : editingCategory
  const editingCategoryName = editingParentCategory?.name ?? ''
  const editingSubcategoryName = editingCategory?.parentId ? editingCategory.name : ''
  const editingStationName = editingItem?.stationId ? stationsById.get(editingItem.stationId)?.name ?? '' : ''
  const nextProductCode = useMemo(() => {
    const numericCodes = items
      .map(item => Number(item.shortCode))
      .filter(code => Number.isFinite(code))
    const next = (numericCodes.length ? Math.max(...numericCodes) : 0) + 1
    return String(next).padStart(3, '0')
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items
    if (searchCode) {
      const q = searchCode.toLowerCase()
      result = result.filter(i => i.barcode?.toLowerCase().includes(q) || i.shortCode?.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
    }
    if (searchName) {
      const q = searchName.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q))
    }
    if (searchCategory) {
      const q = searchCategory.toLowerCase()
      result = result.filter(i => categoriesById.get(i.categoryId)?.name.toLowerCase().includes(q))
    }
    return result
  }, [items, searchCode, searchName, searchCategory, categoriesById])

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, safePage])

  const recipeCostPaise = useMemo(() => {
    return draftRecipe.reduce((sum, line) => {
      const stock = inventoryItems.find(item => item.id === line.inventoryItemId)
      return sum + Math.round((stock?.costPerUnit ?? 0) * line.quantity)
    }, 0)
  }, [draftRecipe, inventoryItems])

  const selectedRecipeUnit = useMemo(() => {
    const name = recipeIngredientName.trim().toLowerCase()
    if (!name) return 'Auto'
    const stock = inventoryItems.find(item => item.name.trim().toLowerCase() === name)
    if (stock) return stock.unit
    const product = items.find(item =>
      item.name.trim().toLowerCase() === name ||
      item.shortCode?.trim().toLowerCase() === name ||
      item.barcode?.trim().toLowerCase() === name
    )
    return product?.primaryUnit ?? 'pcs'
  }, [inventoryItems, items, recipeIngredientName])

  const handleToggleItem = (id: string, isAvailable: boolean) => {
    updateMenuItem(id, { isAvailable: !isAvailable })
    addToast('success', `Product marked as ${!isAvailable ? 'available' : 'unavailable'}`)
  }

  const getRuleTargetIds = (fd: FormData) => {
    const scope = String(fd.get('scope') ?? 'category')
    if (scope === 'all') return new Set(categories.map(category => category.id))
    if (scope === 'subcategory') {
      const subcategoryId = String(fd.get('subcategoryId') ?? '')
      return subcategoryId ? new Set([subcategoryId]) : new Set<string>()
    }
    const categoryId = String(fd.get('categoryId') ?? '')
    return categoryId ? categoryBranchIds(categories, categoryId, true) : new Set<string>()
  }

  const handleSeparateBillingUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const targetIds = getRuleTargetIds(fd)
    const separateBill = fd.get('separateBill') === 'on'
    const billGroupInput = String(fd.get('billGroup') ?? '').trim()
    let updatedProducts = 0

    targetIds.forEach(categoryId => {
      const category = categoriesById.get(categoryId)
      updateCategory(categoryId, {
        separateBill,
        billGroup: billGroupInput || category?.name || 'Separate',
      })
    })

    items.forEach(item => {
      if (!targetIds.has(item.categoryId)) return
      updateMenuItem(item.id, { isSeparateBill: separateBill })
      updatedProducts++
    })

    setShowBillingRuleModal(false)
    addToast('success', `Billing rule updated for ${updatedProducts} product${updatedProducts === 1 ? '' : 's'}`)
  }

  const handleBulkTaxUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const taxType = String(fd.get('taxType') ?? 'GST') as 'GST' | 'VAT' | 'None'
    const selectedTaxPercent = Math.max(0, Number(fd.get('taxPercent') ?? 0))
    const taxPercent = taxType === 'None' ? 0 : selectedTaxPercent
    const targetIds = getRuleTargetIds(fd)
    const taxUpdate = {
      taxType,
      taxPercent,
      cgstPercent: taxType === 'GST' ? taxPercent / 2 : 0,
      sgstPercent: taxType === 'GST' ? taxPercent / 2 : 0,
      vatPercent: taxType === 'VAT' ? taxPercent : 0,
    }
    let updatedProducts = 0

    targetIds.forEach(categoryId => updateCategory(categoryId, taxUpdate))
    items.forEach(item => {
      if (!targetIds.has(item.categoryId)) return
      updateMenuItem(item.id, taxUpdate)
      updatedProducts++
    })

    setShowTaxModal(false)
    addToast('success', `Tax set to ${taxPercent}% for ${updatedProducts} product${updatedProducts === 1 ? '' : 's'}`)
  }

  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const toppingLines = String(fd.get('toppings') ?? '').split('\n').map(line => line.trim()).filter(Boolean)
    const modifiers = toppingLines.map((line, index) => {
      const [name, price = '0'] = line.split('|').map(value => value.trim())
      return { id: `${editingItem?.id || 'new'}_mod_${index}`, name, pricePaise: Math.max(0, Math.round((parseFloat(price) || 0) * 100)) }
    }).filter(modifier => modifier.name)

    const barcode = String(fd.get('barcode') ?? '').trim()
    if (barcode && items.some(item => item.id !== editingItem?.id && item.barcode === barcode)) {
      addToast('error', 'This barcode is already assigned to another product')
      return
    }
    const shortCode = String(fd.get('shortCode') ?? '').trim()
    if (shortCode && items.some(item => item.id !== editingItem?.id && item.shortCode?.trim().toLowerCase() === shortCode.toLowerCase())) {
      addToast('error', 'This product code is already assigned to another product')
      return
    }

    const categoryName = String(fd.get('categoryName') ?? '').trim()
    const subcategoryName = String(fd.get('subcategoryName') ?? '').trim()
    if (!categoryName) {
      addToast('error', 'Category is required')
      return
    }

    const latestStore = useBillingStore.getState()
    let category = latestStore.menuCategories.find(c => !c.parentId && c.name.trim().toLowerCase() === categoryName.toLowerCase())
    if (!category) {
      latestStore.addCategory(categoryName, '#2563EB')
      category = useBillingStore.getState().menuCategories.find(c => !c.parentId && c.name.trim().toLowerCase() === categoryName.toLowerCase())
    }
    if (!category) {
      addToast('error', 'Could not create category. Please try again.')
      return
    }
    let productCategory = category
    if (subcategoryName) {
      const store = useBillingStore.getState()
      let subcategory = store.menuCategories.find(c => c.parentId === category!.id && c.name.trim().toLowerCase() === subcategoryName.toLowerCase())
      if (!subcategory) {
        store.addCategory(subcategoryName, '#64748B', { parentId: category.id })
        subcategory = useBillingStore.getState().menuCategories.find(c => c.parentId === category!.id && c.name.trim().toLowerCase() === subcategoryName.toLowerCase())
      }
      if (subcategory) productCategory = subcategory
    }
    const categoryTaxType = String(fd.get('categoryTaxType') ?? 'GST') as 'GST' | 'VAT' | 'None'
    const categoryTaxPercent = parseNumber(fd, 'categoryTaxPercent', productCategory.taxPercent ?? category.taxPercent ?? 0)
    const categoryDiscountPercent = Math.max(0, parseNumber(fd, 'categoryDiscountPercent', productCategory.discountPercent ?? category.discountPercent ?? 0))
    const categoryBillGroup = String(fd.get('categoryBillGroup') ?? '').trim() || category.name
    useBillingStore.getState().updateCategory(productCategory.id, {
      billGroup: categoryBillGroup,
      separateBill: fd.get('categorySeparateBill') === 'on',
      taxType: categoryTaxType,
      taxPercent: categoryTaxType === 'None' ? 0 : categoryTaxPercent,
      cgstPercent: categoryTaxType === 'GST' ? categoryTaxPercent / 2 : 0,
      sgstPercent: categoryTaxType === 'GST' ? categoryTaxPercent / 2 : 0,
      vatPercent: categoryTaxType === 'VAT' ? categoryTaxPercent : 0,
      discountPercent: categoryDiscountPercent,
    })

    const stationId = String(fd.get('stationId') ?? '').trim()
    let station = useBillingStore.getState().stations.find(s => s.id === stationId)
    if (!station) {
      const stationName = String(fd.get('stationName') ?? '').trim()
      if (!stationName) {
        addToast('error', 'Kitchen is required')
        return
      }
      station = useBillingStore.getState().stations.find(s => s.name.trim().toLowerCase() === stationName.toLowerCase())
      if (!station) station = addStation(stationName)
    }

    const pricePaise = parsePaise(fd, 'price')
    const productType = String(fd.get('productType') ?? 'sale_only') as ProductUsageType
    const primaryUnit = String(fd.get('primaryUnit') ?? 'pcs') as StockUnit
    const taxType = String(fd.get('taxType') ?? 'GST') as 'GST' | 'VAT' | 'None'

    const newItem: MenuItem = {
      id: editingItem?.id || '',
      outletId: latestStore.outlet.id,
      categoryId: productCategory.id,
      name: String(fd.get('name') ?? '').trim(),
      shortCode: shortCode || undefined,
      barcode: barcode || undefined,
      description: String(fd.get('description') ?? '').trim() || undefined,
      productType,
      itemType: fd.get('itemType') as 'veg' | 'nonveg' | 'egg' | 'other',
      pricePaise,
      costPricePaise: parsePaise(fd, 'costPrice', editingItem?.costPricePaise ?? 0),
      mrpPaise: parsePaise(fd, 'mrp', editingItem?.mrpPaise ?? pricePaise),
      specialPricePaise: parsePaise(fd, 'specialPrice', editingItem?.specialPricePaise ?? pricePaise),
      onlinePricePaise: parsePaise(fd, 'onlinePrice', editingItem?.onlinePricePaise ?? pricePaise),
      deliveryPricePaise: parsePaise(fd, 'deliveryPrice', editingItem?.deliveryPricePaise ?? pricePaise),
      takeawayPricePaise: parsePaise(fd, 'takeawayPrice', editingItem?.takeawayPricePaise ?? pricePaise),
      preparationMinutes: parseNumber(fd, 'preparationMinutes', editingItem?.preparationMinutes ?? 0),
      primaryUnit: UNITS.includes(primaryUnit) ? primaryUnit : 'pcs',
      minimumStock: Math.max(0, parseNumber(fd, 'minimumStock', editingItem?.minimumStock ?? 0)),
      taxPercent: categoryTaxType === 'None' ? 0 : categoryTaxPercent,
      taxType: categoryTaxType,
      taxInReverse: fd.get('taxInReverse') === 'on',
      hsnCode: String(fd.get('hsnCode') ?? '').trim() || undefined,
      cgstPercent: categoryTaxType === 'GST' ? categoryTaxPercent / 2 : 0,
      sgstPercent: categoryTaxType === 'GST' ? categoryTaxPercent / 2 : 0,
      vatPercent: categoryTaxType === 'VAT' ? categoryTaxPercent : 0,
      stationId: station.id,
      isAvailable: editingItem?.isAvailable ?? true,
      isSeparateBill: fd.get('categorySeparateBill') === 'on',
      isFavorite: fd.get('isFavorite') === 'on',
      activeOnApp: fd.get('activeOnApp') === 'on',
      recommended: fd.get('recommended') === 'on',
      recipeItems: editingItem?.recipeItems ?? [],
      modifierGroups: modifiers.length ? [{ id: `${editingItem?.id || 'new'}_toppings`, name: 'Toppings & Extras', minSelect: 0, maxSelect: modifiers.length, modifiers }] : [],
      sortOrder: editingItem?.sortOrder ?? items.length,
    }

    if (!newItem.name) {
      addToast('error', 'Product name is required')
      return
    }

    if (editingItem) {
      updateMenuItem(editingItem.id, newItem)
      addToast('success', 'Product updated successfully')
    } else {
      addMenuItem(newItem)
      addToast('success', 'New product added successfully')
    }
    setShowItemModal(false)
    setEditingItem(null)
  }

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const rows = parseCsvRows(text)
      if (rows.length < 2) {
        addToast('error', 'CSV must have a header and at least one row')
        return
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''))
      const shortCodeIdx = headers.findIndex(h => h.includes('shortcode') || h === 'code')
      const barcodeIdx = headers.findIndex(h => h.includes('barcode'))
      const nameIdx = headers.findIndex(h => h.includes('name'))
      const catIdx = headers.findIndex(h => h.includes('category'))
      const subcatIdx = headers.findIndex(h => h.includes('subcategory'))
      const billGroupIdx = headers.findIndex(h => h === 'billgroup' || h === 'bill')
      const separateBillCategoryIdx = headers.findIndex(h => h === 'separatebillcategory' || h === 'categoryseparatebill')
      const stationIdx = headers.findIndex(h => h.includes('kitchenstation') || h.includes('station'))
      const productTypeIdx = headers.findIndex(h => h === 'producttype')
      const typeIdx = headers.findIndex(h => h === 'type' || h === 'foodtype' || h === 'itemtype')
      const costPriceIdx = headers.findIndex(h => h === 'costprice' || h === 'cost')
      const priceIdx = headers.findIndex(h => h === 'price' || h === 'regularsp' || h === 'sellingprice' || h === 'sp')
      const mrpIdx = headers.findIndex(h => h === 'mrp')
      const specialPriceIdx = headers.findIndex(h => h === 'specialprice' || h === 'splprc')
      const onlinePriceIdx = headers.findIndex(h => h === 'onlineprice')
      const deliveryPriceIdx = headers.findIndex(h => h === 'deliveryprice' || h === 'dlvryprc')
      const takeawayPriceIdx = headers.findIndex(h => h === 'takeawayprice' || h === 'tkwyprc')
      const primaryUnitIdx = headers.findIndex(h => h === 'primaryunit' || h === 'unit')
      const minStockIdx = headers.findIndex(h => h === 'minstock' || h === 'minimumstock')
      const preparationIdx = headers.findIndex(h => h === 'preparationmins' || h === 'preparationtime')
      const taxTypeIdx = headers.findIndex(h => h === 'taxtype')
      const taxIdx = headers.findIndex(h => h === 'taxpercent' || h === 'tax')
      const hsnIdx = headers.findIndex(h => h === 'hsn' || h === 'hsnno')
      const cgstIdx = headers.findIndex(h => h === 'cgst')
      const sgstIdx = headers.findIndex(h => h === 'sgst')
      const vatIdx = headers.findIndex(h => h === 'vat')
      const categoryDiscountIdx = headers.findIndex(h => h === 'categorydiscountpercent' || h === 'discountpercent' || h === 'categorydiscount')
      const activeIdx = headers.findIndex(h => h.includes('active'))
      const separateBillIdx = headers.findIndex(h => h === 'separatebill' || h === 'liquor' || h === 'liquorbill' || h === 'barbill')
      const activeOnAppIdx = headers.findIndex(h => h === 'activeonapp' || h === 'onapp')
      const recommendedIdx = headers.findIndex(h => h === 'recommended')
      const favoriteIdx = headers.findIndex(h => h.includes('favorite'))
      const descriptionIdx = headers.findIndex(h => h === 'description')
      const toppingsIdx = headers.findIndex(h => h.includes('toppings') || h.includes('extras') || h.includes('modifiers'))
      const recipeIdx = headers.findIndex(h => h === 'recipe' || h === 'recipeitems' || h === 'ingredients')

      let addedCount = 0
      let updatedCount = 0
      let createdIngredientCount = 0
      let importedRecipeCount = 0
      let skippedExampleCount = 0
      let invalidRowCount = 0
      let recipeErrorCount = 0

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i]
        if (nameIdx < 0 || priceIdx < 0 || cols.length < Math.max(nameIdx, priceIdx) + 1) { invalidRowCount++; continue }

        const shortCode = shortCodeIdx >= 0 ? cols[shortCodeIdx] : ''
        if (shortCode.trim().startsWith('#')) {
          skippedExampleCount++
          continue
        }
        const barcode = barcodeIdx >= 0 ? cols[barcodeIdx] : ''
        const name = nameIdx >= 0 ? cols[nameIdx] : ''
        const catName = catIdx >= 0 ? cols[catIdx] : 'Uncategorized'
        const subcatName = subcatIdx >= 0 ? cols[subcatIdx] : ''
        const billGroupRaw = billGroupIdx >= 0 ? cols[billGroupIdx] : ''
        const separateBillCategoryRaw = separateBillCategoryIdx >= 0 ? cols[separateBillCategoryIdx].toLowerCase() : ''
        const stationName = stationIdx >= 0 ? cols[stationIdx] : 'Main Kitchen'
        const productTypeRaw = productTypeIdx >= 0 ? cols[productTypeIdx].toLowerCase() : ''
        const typeRaw = typeIdx >= 0 ? cols[typeIdx].toLowerCase() : 'veg'
        const costPriceRaw = costPriceIdx >= 0 ? cols[costPriceIdx] : ''
        const priceRaw = priceIdx >= 0 ? cols[priceIdx] : '0'
        const mrpRaw = mrpIdx >= 0 ? cols[mrpIdx] : ''
        const specialPriceRaw = specialPriceIdx >= 0 ? cols[specialPriceIdx] : ''
        const onlinePriceRaw = onlinePriceIdx >= 0 ? cols[onlinePriceIdx] : ''
        const deliveryPriceRaw = deliveryPriceIdx >= 0 ? cols[deliveryPriceIdx] : ''
        const takeawayPriceRaw = takeawayPriceIdx >= 0 ? cols[takeawayPriceIdx] : ''
        const primaryUnitRaw = primaryUnitIdx >= 0 ? cols[primaryUnitIdx].toLowerCase() : 'pcs'
        const minStockRaw = minStockIdx >= 0 ? cols[minStockIdx] : ''
        const preparationRaw = preparationIdx >= 0 ? cols[preparationIdx] : ''
        const taxTypeRaw = taxTypeIdx >= 0 ? cols[taxTypeIdx] : 'GST'
        const taxRaw = taxIdx >= 0 ? cols[taxIdx] : '0'
        const hsnRaw = hsnIdx >= 0 ? cols[hsnIdx] : ''
        const cgstRaw = cgstIdx >= 0 ? cols[cgstIdx] : ''
        const sgstRaw = sgstIdx >= 0 ? cols[sgstIdx] : ''
        const vatRaw = vatIdx >= 0 ? cols[vatIdx] : ''
        const categoryDiscountRaw = categoryDiscountIdx >= 0 ? cols[categoryDiscountIdx] : ''
        const activeRaw = activeIdx >= 0 ? cols[activeIdx].toLowerCase() : 'yes'
        const separateBillRaw = separateBillIdx >= 0 ? cols[separateBillIdx].toLowerCase() : ''
        const activeOnAppRaw = activeOnAppIdx >= 0 ? cols[activeOnAppIdx].toLowerCase() : 'yes'
        const recommendedRaw = recommendedIdx >= 0 ? cols[recommendedIdx].toLowerCase() : 'no'
        const favoriteRaw = favoriteIdx >= 0 ? cols[favoriteIdx].toLowerCase() : 'no'
        const descriptionRaw = descriptionIdx >= 0 ? cols[descriptionIdx] : ''
        const toppingsRaw = toppingsIdx >= 0 ? cols[toppingsIdx] : ''
        const recipeRaw = recipeIdx >= 0 ? cols[recipeIdx] : ''
        if (!name) { invalidRowCount++; continue }

        let state = useBillingStore.getState()
        let category = state.menuCategories.find(c => !c.parentId && c.name.trim().toLowerCase() === catName.trim().toLowerCase())
        if (!category) {
          state.addCategory(catName.trim() || 'Uncategorized', '#2563EB')
          state = useBillingStore.getState()
          category = state.menuCategories.find(c => !c.parentId && c.name.trim().toLowerCase() === (catName.trim() || 'Uncategorized').toLowerCase())
        }
        if (!category) continue
        let productCategory = category
        if (subcatName.trim()) {
          let subcategory = state.menuCategories.find(c => c.parentId === category!.id && c.name.trim().toLowerCase() === subcatName.trim().toLowerCase())
          if (!subcategory) {
            state.addCategory(subcatName.trim(), '#64748B', { parentId: category.id })
            state = useBillingStore.getState()
            subcategory = state.menuCategories.find(c => c.parentId === category!.id && c.name.trim().toLowerCase() === subcatName.trim().toLowerCase())
          }
          if (subcategory) productCategory = subcategory
        }
        let station = state.stations.find(s => s.name.trim().toLowerCase() === stationName.trim().toLowerCase())
        if (!station) {
          station = state.addStation(stationName.trim() || 'Main Kitchen')
          state = useBillingStore.getState()
        }

        const existingItem = state.menuItems.find(item =>
          (barcode && item.barcode === barcode) ||
          (shortCode && item.shortCode === shortCode) ||
          (!barcode && !shortCode && item.name.toLowerCase() === name.toLowerCase())
        )

        let itemType: 'veg' | 'nonveg' | 'egg' | 'other' = 'veg'
        if (typeRaw.includes('non')) itemType = 'nonveg'
        else if (typeRaw.includes('egg')) itemType = 'egg'
        else if (typeRaw.includes('other')) itemType = 'other'

        let productType: ProductUsageType = 'sale_only'
        if (productTypeRaw.includes('both') || productTypeRaw.includes('sale_purchase')) productType = 'sale_purchase'
        else if (productTypeRaw.includes('purchase') && !productTypeRaw.includes('sale')) productType = 'purchase_only'
        else if (productTypeRaw.includes('kitchen')) productType = 'kitchen_processed'

        const importedPricePaise = Math.round((parseFloat(priceRaw) || 0) * 100)
        const isAvailable = !activeRaw.includes('no') && !activeRaw.includes('false') && activeRaw !== '0'
        const isSeparateBill = separateBillIdx >= 0
          ? separateBillRaw.includes('yes') || separateBillRaw.includes('true') || separateBillRaw === '1' || separateBillRaw.includes('liquor')
          : existingItem?.isSeparateBill
        const isSeparateBillCategory = separateBillCategoryIdx >= 0
          ? separateBillCategoryRaw.includes('yes') || separateBillCategoryRaw.includes('true') || separateBillCategoryRaw === '1'
          : Boolean(isSeparateBill)
        const parsedTaxPercent = Number.isFinite(parseFloat(taxRaw)) ? Math.max(0, parseFloat(taxRaw)) : 0
        const parsedTaxType = taxTypeRaw.toLowerCase().includes('vat') ? 'VAT' : taxTypeRaw.toLowerCase().includes('none') ? 'None' : 'GST'
        state.updateCategory(productCategory.id, {
          billGroup: billGroupRaw.trim() || category.name,
          separateBill: isSeparateBillCategory,
          taxType: parsedTaxType,
          taxPercent: parsedTaxType === 'None' ? 0 : parsedTaxPercent,
          cgstPercent: parsedTaxType === 'GST' ? parsedTaxPercent / 2 : 0,
          sgstPercent: parsedTaxType === 'GST' ? parsedTaxPercent / 2 : 0,
          vatPercent: parsedTaxType === 'VAT' ? parsedTaxPercent : 0,
          discountPercent: Math.max(0, parseFloat(categoryDiscountRaw) || 0),
        })
        const activeOnApp = !activeOnAppRaw.includes('no') && !activeOnAppRaw.includes('false') && activeOnAppRaw !== '0'
        const recommended = recommendedRaw.includes('yes') || recommendedRaw.includes('true') || recommendedRaw === '1'
        const isFavorite = favoriteRaw.includes('yes') || favoriteRaw.includes('true') || favoriteRaw === '1'
        const modifiers = toppingsRaw
          .split(/[;\n]/)
          .map(line => line.trim())
          .filter(Boolean)
          .map((line, index) => {
            const [modifierName, modifierPrice = '0'] = line.split('|').map(value => value.trim())
            return {
              id: `${existingItem?.id || 'import'}_mod_${index}`,
              name: modifierName,
              pricePaise: Math.max(0, Math.round((parseFloat(modifierPrice) || 0) * 100)),
            }
          })
          .filter(modifier => modifier.name)

        let importedRecipe = existingItem?.recipeItems ?? []
        if (recipeIdx >= 0) {
          importedRecipe = []
          const parsedRecipe = parseRecipeField(recipeRaw)
          recipeErrorCount += parsedRecipe.errors.length
          let recipeState = useBillingStore.getState()
          for (const line of parsedRecipe.items) {
            let ingredient = recipeState.inventoryItems.find(item => item.name.trim().toLowerCase() === line.name.trim().toLowerCase())
            if (!ingredient) {
              addInventoryItem({
                name: line.name.trim(),
                unit: line.unit,
                currentStock: 0,
                minimumStock: 0,
                costPerUnit: 0,
                supplier: 'Created from menu import',
              })
              createdIngredientCount++
              recipeState = useBillingStore.getState()
              ingredient = recipeState.inventoryItems.find(item => item.name.trim().toLowerCase() === line.name.trim().toLowerCase())
            }
            if (!ingredient) {
              recipeErrorCount++
              continue
            }
            const quantity = convertRecipeQuantity(line.quantity, line.unit, ingredient.unit)
            if (quantity === null) {
              recipeErrorCount++
              continue
            }
            const existingRecipeLine = importedRecipe.find(recipeLine => recipeLine.inventoryItemId === ingredient.id)
            if (existingRecipeLine) existingRecipeLine.quantity += quantity
            else importedRecipe.push({ inventoryItemId: ingredient.id, name: ingredient.name, quantity, unit: ingredient.unit })
          }
          if (importedRecipe.length > 0) importedRecipeCount++
        }

        const newItem: MenuItem = {
          id: existingItem?.id || '',
          outletId: state.outlet.id,
          categoryId: productCategory.id,
          name,
          shortCode: shortCode || undefined,
          barcode: barcode || undefined,
          description: descriptionRaw || existingItem?.description,
          productType,
          itemType,
          pricePaise: importedPricePaise,
          costPricePaise: Math.round((parseFloat(costPriceRaw) || 0) * 100),
          mrpPaise: Math.round((parseFloat(mrpRaw) || parseFloat(priceRaw) || 0) * 100),
          specialPricePaise: Math.round((parseFloat(specialPriceRaw) || parseFloat(priceRaw) || 0) * 100),
          onlinePricePaise: Math.round((parseFloat(onlinePriceRaw) || parseFloat(priceRaw) || 0) * 100),
          deliveryPricePaise: Math.round((parseFloat(deliveryPriceRaw) || parseFloat(priceRaw) || 0) * 100),
          takeawayPricePaise: Math.round((parseFloat(takeawayPriceRaw) || parseFloat(priceRaw) || 0) * 100),
          primaryUnit: UNITS.includes(primaryUnitRaw as StockUnit) ? primaryUnitRaw as StockUnit : 'pcs',
          minimumStock: Math.max(0, parseFloat(minStockRaw) || 0),
          preparationMinutes: Math.max(0, parseFloat(preparationRaw) || 0),
          taxPercent: parsedTaxType === 'None' ? 0 : parsedTaxPercent,
          taxType: parsedTaxType,
          hsnCode: hsnRaw || undefined,
          cgstPercent: parseFloat(cgstRaw) || 0,
          sgstPercent: parseFloat(sgstRaw) || 0,
          vatPercent: parseFloat(vatRaw) || 0,
          stationId: station?.id,
          isAvailable,
          isSeparateBill: isSeparateBillCategory,
          isFavorite,
          activeOnApp,
          recommended,
          recipeItems: importedRecipe,
          modifierGroups: modifiers.length
            ? [{ id: `${existingItem?.id || 'import'}_toppings`, name: 'Toppings & Extras', minSelect: 0, maxSelect: modifiers.length, modifiers }]
            : existingItem?.modifierGroups ?? [],
          sortOrder: existingItem?.sortOrder ?? state.menuItems.length,
        }

        if (existingItem) {
          state.updateMenuItem(existingItem.id, newItem)
          updatedCount++
        } else {
          state.addMenuItem(newItem)
          addedCount++
        }
      }

      addToast('success', `Import complete! Added ${addedCount}, Updated ${updatedCount}, Recipes ${importedRecipeCount}, Ingredients ${createdIngredientCount}, Skipped examples ${skippedExampleCount}${recipeErrorCount ? `, Recipe errors ${recipeErrorCount}` : ''}${invalidRowCount ? `, Invalid rows ${invalidRowCount}` : ''}`)
    } catch {
      addToast('error', 'Failed to parse CSV file')
    }
  }

  const handleTemplateDownload = () => {
    generateTemplate()
    addToast('success', 'Product import template downloaded', 'Template Download')
  }

  const handleProductExport = () => {
    exportProducts(items, categories, stations)
    addToast('success', 'Products exported successfully', 'Export Complete')
  }

  const openRecipe = (item: MenuItem) => {
    setRecipeItem(item)
    setDraftRecipe(item.recipeItems ?? [])
    setRecipeIngredientName('')
  }

  const handleAddRecipeLine = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fd = new FormData(event.currentTarget)
    const name = recipeIngredientName.trim() || String(fd.get('ingredientName') ?? '').trim()
    const quantity = Number(fd.get('quantity') ?? 0)
    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      addToast('error', 'Choose product and quantity for recipe')
      return
    }

    let stock = useBillingStore.getState().inventoryItems.find(item => item.name.trim().toLowerCase() === name.toLowerCase())
    const product = useBillingStore.getState().menuItems.find(item =>
      item.name.trim().toLowerCase() === name.toLowerCase() ||
      item.shortCode?.trim().toLowerCase() === name.toLowerCase() ||
      item.barcode?.trim().toLowerCase() === name.toLowerCase()
    )

    if (!stock && product) {
      addInventoryItem({
        name: product.name,
        unit: product.primaryUnit ?? 'pcs',
        currentStock: 0,
        minimumStock: product.minimumStock ?? 0,
        costPerUnit: product.costPricePaise ?? 0,
        supplier: 'Created from recipe setup',
      })
      stock = useBillingStore.getState().inventoryItems.find(item => item.name.trim().toLowerCase() === product.name.trim().toLowerCase())
    }

    if (!stock) {
      addToast('error', 'Select an existing inventory item or product')
      return
    }

    setDraftRecipe(lines => {
      const existing = lines.find(line => line.inventoryItemId === stock.id)
      if (existing) {
        return lines.map(line => line.inventoryItemId === stock.id ? { ...line, quantity: line.quantity + quantity } : line)
      }
      return [...lines, { inventoryItemId: stock.id, name: stock.name, quantity, unit: stock.unit }]
    })
    setRecipeIngredientName('')
    event.currentTarget.reset()
  }

  const handleSaveRecipe = () => {
    if (!recipeItem) return
    updateMenuItem(recipeItem.id, { recipeItems: draftRecipe })
    addToast('success', `Recipe saved for ${recipeItem.name}`)
    setRecipeItem(null)
    setDraftRecipe([])
  }

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC]">
      <div className="px-4 py-3 bg-white border-b-2 border-slate-100 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-slate-800 tracking-tight">Products Menu</h1>
          <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded text-xs border border-slate-200">{items.length} Items</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleTemplateDownload} className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors">
            <Download size={14} /> Template
          </button>
          <button onClick={handleProductExport} className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-bold transition-colors">
            <FileDown size={14} /> Export
          </button>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCsv} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors">
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setShowBillingRuleModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 rounded-lg text-xs font-bold transition-colors">
            <FileText size={14} /> Bill Rules
          </button>
          <button onClick={() => setShowTaxModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-xs font-bold transition-colors">
            <Percent size={14} /> Set Tax
          </button>
          <button onClick={() => { setEditingItem(null); setShowItemModal(true) }} className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-black hover:bg-primary-dark transition-colors shadow-sm ml-2">
            <Plus size={16} strokeWidth={2.5} /> ADD ITEM
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-[1120px] flex flex-col">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-12 border-r border-slate-200">#</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-32 border-r border-slate-200">Code</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider border-r border-slate-200">Name</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-40 border-r border-slate-200">Category</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-44 border-r border-slate-200">Product</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-24 border-r border-slate-200">Type</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-28 border-r border-slate-200 text-center">Bill</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-24 border-r border-slate-200 text-right">Price</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-20 border-r border-slate-200 text-right">Tax %</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-24 border-r border-slate-200 text-center">Active</th>
                <th className="px-3 py-2 text-[11px] font-black text-slate-500 uppercase tracking-wider w-32 text-center">Actions</th>
              </tr>
              <tr className="bg-white border-t border-slate-100">
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200">
                  <SearchInput value={searchCode} onChange={value => { setSearchCode(value); setPage(1) }} />
                </th>
                <th className="px-2 py-1 border-r border-slate-200">
                  <SearchInput value={searchName} onChange={value => { setSearchName(value); setPage(1) }} />
                </th>
                <th className="px-2 py-1 border-r border-slate-200">
                  <SearchInput value={searchCategory} onChange={value => { setSearchCategory(value); setPage(1) }} />
                </th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 border-r border-slate-200 bg-slate-50"></th>
                <th className="px-2 py-1 bg-slate-50"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <p className="text-sm font-bold text-slate-500">No products match your search.</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, index) => {
                  const cat = categoriesById.get(item.categoryId)
                  const parentCat = cat?.parentId ? categoriesById.get(cat.parentId) : undefined
                  const categoryLabel = parentCat ? `${parentCat.name} / ${cat?.name}` : cat?.name || 'Unknown'
                  const billGroup = cat?.billGroup || parentCat?.billGroup || (item.isSeparateBill ? 'Liquor' : 'Food')
                  const separateBill = cat?.separateBill ?? parentCat?.separateBill ?? item.isSeparateBill
                  const globalIndex = (safePage - 1) * PAGE_SIZE + index + 1
                  return (
                    <tr key={item.id} className={clsx('hover:bg-blue-50/30 transition-colors', !item.isAvailable && 'opacity-60 bg-slate-50/50')}>
                      <td className="px-3 py-2 text-[11px] font-bold text-slate-400 border-r border-slate-100 text-center">{globalIndex}</td>
                      <td className="px-3 py-2 text-xs font-bold text-slate-600 border-r border-slate-100">{item.barcode || item.shortCode || '-'}</td>
                      <td className="px-3 py-2 text-sm font-black text-slate-800 border-r border-slate-100">{item.name}</td>
                      <td className="px-3 py-2 text-xs font-bold text-slate-600 border-r border-slate-100">{categoryLabel}</td>
                      <td className="px-3 py-2 text-xs font-bold text-slate-600 border-r border-slate-100">{productTypeLabel(item.productType)}</td>
                      <td className="px-3 py-2 border-r border-slate-100">
                        <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider', item.itemType === 'veg' ? 'bg-green-100 text-green-700' : item.itemType === 'nonveg' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                          {item.itemType}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r border-slate-100 text-center">
                        <span className={clsx('px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider', separateBill ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600')}>
                          {billGroup}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm font-black text-slate-800 border-r border-slate-100 text-right">{formatPaise(item.pricePaise)}</td>
                      <td className="px-3 py-2 text-xs font-bold text-slate-500 border-r border-slate-100 text-right">{item.taxPercent}%</td>
                      <td className="px-3 py-2 border-r border-slate-100 text-center">
                        <button
                          onClick={() => handleToggleItem(item.id, item.isAvailable)}
                          style={{ width: '44px', minWidth: '44px', height: '24px', padding: '2px', boxSizing: 'border-box' }}
                          className={clsx('relative inline-flex flex-shrink-0 items-center cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', item.isAvailable ? 'bg-emerald-500' : 'bg-slate-300')}
                        >
                          <span style={{ width: '20px', height: '20px', transform: item.isAvailable ? 'translateX(20px)' : 'translateX(0px)' }} className="pointer-events-none inline-block rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out" />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => { setEditingItem(item); setShowItemModal(true) }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit product">
                            <Edit2 size={14} strokeWidth={2.5} />
                          </button>
                          <button onClick={() => openRecipe(item)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Recipe setup">
                            <ChefHat size={14} strokeWidth={2.5} />
                          </button>
                          <button onClick={() => { deleteMenuItem(item.id); addToast('success', 'Product deleted') }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                            <Trash2 size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {filteredItems.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-2 flex items-center justify-between bg-slate-50 mt-auto flex-shrink-0">
              <p className="text-xs font-bold text-slate-500">Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="w-7 h-7 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-100">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-black text-slate-700 px-2">{safePage} / {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount} className="w-7 h-7 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-100">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92dvh] overflow-hidden animate-slide-in-up border border-slate-100 flex flex-col">
            <ModalHeader title={editingItem ? 'Edit Product Details' : 'Create Product Details'} onClose={() => { setShowItemModal(false); setEditingItem(null) }} />
            <form onSubmit={handleSaveItem} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Name" className="md:col-span-2">
                  <input required name="name" defaultValue={editingItem?.name} className={FIELD_CLASS} placeholder="Product name" />
                </Field>
                <Field label="Product Type">
                  <select name="productType" defaultValue={editingItem?.productType ?? 'sale_only'} className={FIELD_CLASS}>
                    {PRODUCT_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Product Code">
                  <input name="shortCode" defaultValue={editingItem?.shortCode ?? nextProductCode} className={FIELD_CLASS} placeholder="Auto or manual code" />
                </Field>
                <Field label="Barcode">
                  <input name="barcode" defaultValue={editingItem?.barcode} className={FIELD_CLASS} placeholder="Scan or enter barcode" />
                </Field>
                <Field label="Category">
                  <input required name="categoryName" list="menu-category-options" defaultValue={editingCategoryName} className={FIELD_CLASS} placeholder="Type or select category" />
                  <datalist id="menu-category-options">{categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.name} />)}</datalist>
                </Field>
                <Field label="Subcategory">
                  <input name="subcategoryName" list="menu-subcategory-options" defaultValue={editingSubcategoryName} className={FIELD_CLASS} placeholder="Optional subcategory" />
                  <datalist id="menu-subcategory-options">{categories.filter(c => c.parentId).map(c => <option key={c.id} value={c.name} />)}</datalist>
                </Field>
                <Field label="Kitchen ID / Printer">
                  <select name="stationId" defaultValue={editingItem?.stationId ?? stations[0]?.id ?? ''} className={FIELD_CLASS} required>
                    <option value="" disabled>Create a kitchen in Admin first</option>
                    {stations.map((station, index) => (
                      <option key={station.id} value={station.id}>
                        {index + 1} - {station.name}{station.printerTarget ? ` (${station.printerTarget})` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="hidden" name="stationName" value={editingStationName || stations[0]?.name || 'Main Kitchen'} />
                </Field>
                <Field label="Cost Price">
                  <input name="costPrice" defaultValue={paiseToInput(editingItem?.costPricePaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="Preparation Time">
                  <input name="preparationMinutes" defaultValue={editingItem?.preparationMinutes || ''} type="number" step="1" min="0" className={FIELD_CLASS} placeholder="Mins" />
                </Field>
                <Field label="Primary Unit">
                  <select name="primaryUnit" defaultValue={editingItem?.primaryUnit ?? 'pcs'} className={FIELD_CLASS}>
                    {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </Field>
                <Field label="Stock Alert Level">
                  <input name="minimumStock" defaultValue={editingItem?.minimumStock || ''} type="number" step="0.01" min="0" className={FIELD_CLASS} placeholder="Minimum stock" />
                </Field>
              </div>

              <SectionTitle title="Product pricing" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Regular SP">
                  <input required name="price" defaultValue={editingItem ? paiseToInput(editingItem.pricePaise) : ''} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="MRP">
                  <input name="mrp" defaultValue={paiseToInput(editingItem?.mrpPaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="Special SP">
                  <input name="specialPrice" defaultValue={paiseToInput(editingItem?.specialPricePaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="Online SP">
                  <input name="onlinePrice" defaultValue={paiseToInput(editingItem?.onlinePricePaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="Delivery SP">
                  <input name="deliveryPrice" defaultValue={paiseToInput(editingItem?.deliveryPricePaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="Takeaway SP">
                  <input name="takeawayPrice" defaultValue={paiseToInput(editingItem?.takeawayPricePaise)} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
              </div>

              <SectionTitle title="Category billing, tax, and discount" />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Bill Title">
                  <input name="categoryBillGroup" defaultValue={editingCategory?.billGroup ?? editingParentCategory?.billGroup ?? editingCategoryName ?? 'Food'} className={FIELD_CLASS} placeholder="Food, Liquor, Stock..." />
                </Field>
                <label className="flex items-center gap-2 mt-6 text-xs font-black text-slate-600 uppercase tracking-wider">
                  <input type="checkbox" name="categorySeparateBill" defaultChecked={Boolean(editingCategory?.separateBill ?? editingParentCategory?.separateBill)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  Separate bill category
                </label>
                <Field label="Applicable Tax">
                  <select name="categoryTaxType" defaultValue={editingCategory?.taxType ?? editingItem?.taxType ?? 'GST'} className={FIELD_CLASS}>
                    <option value="GST">GST</option>
                    <option value="VAT">VAT</option>
                    <option value="None">None</option>
                  </select>
                </Field>
                <Field label="Tax %">
                  <select name="categoryTaxPercent" defaultValue={editingCategory?.taxPercent ?? editingItem?.taxPercent ?? 0} className={FIELD_CLASS}>
                    <option value="0">0%</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST</option>
                  </select>
                </Field>
                <Field label="Discount %">
                  <input name="categoryDiscountPercent" defaultValue={editingCategory?.discountPercent ?? 0} type="number" step="0.01" min="0" className={FIELD_CLASS} />
                </Field>
                <Field label="HSN No">
                  <input name="hsnCode" defaultValue={editingItem?.hsnCode} className={FIELD_CLASS} />
                </Field>
                <Field label="Food Type">
                  <select name="itemType" defaultValue={editingItem?.itemType ?? 'veg'} className={FIELD_CLASS}>
                    <option value="veg">Veg</option>
                    <option value="nonveg">Non-Veg</option>
                    <option value="egg">Egg</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <label className="flex items-center gap-2 mt-6 text-xs font-black text-slate-600 uppercase tracking-wider">
                  <input type="checkbox" name="taxInReverse" defaultChecked={editingItem?.taxInReverse} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                  Reverse Tax
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Description">
                  <input name="description" defaultValue={editingItem?.description} className={FIELD_CLASS} placeholder="Long description" />
                </Field>
                <Field label="Toppings / Extras">
                  <textarea
                    name="toppings"
                    rows={2}
                    defaultValue={editingItem?.modifierGroups?.flatMap(group => group.modifiers).map(modifier => `${modifier.name}|${(modifier.pricePaise / 100).toFixed(2)}`).join('\n')}
                    className={FIELD_CLASS}
                    placeholder={'Extra cheese|50\nOlives|30'}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {[
                  ['isFavorite', 'Favorite', editingItem?.isFavorite],
                  ['activeOnApp', 'Active on App', editingItem?.activeOnApp ?? true],
                  ['recommended', 'Recommended', editingItem?.recommended],
                ].map(([name, label, checked]) => (
                  <label key={String(name)} className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-wider">
                    <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                    {label}
                  </label>
                ))}
              </div>

              <div className="pt-3 flex gap-3">
                <button type="button" onClick={() => { setShowItemModal(false); setEditingItem(null) }} className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm font-black rounded-xl hover:bg-slate-200 transition-colors">
                  CANCEL
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-primary text-white text-sm font-black rounded-xl hover:bg-primary-dark transition-all shadow-md shadow-primary/30">
                  SAVE PRODUCT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recipeItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] overflow-hidden border border-slate-100 flex flex-col">
            <ModalHeader title={`Recipe Setup - ${recipeItem.name}`} onClose={() => { setRecipeItem(null); setDraftRecipe([]); setRecipeIngredientName('') }} />
            <div className="p-5 space-y-4 overflow-y-auto">
              <form onSubmit={handleAddRecipeLine} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-slate-50 border border-slate-200 rounded-xl p-3">
                <Field label="Product" className="md:col-span-2">
                  <input
                    name="ingredientName"
                    value={recipeIngredientName}
                    onChange={event => setRecipeIngredientName(event.target.value)}
                    list="recipe-stock-options"
                    className={FIELD_CLASS}
                    placeholder="Type or select product"
                  />
                  <datalist id="recipe-stock-options">
                    {inventoryItems.map(item => <option key={`stock-${item.id}`} value={item.name} label={`${item.name} (${item.unit})`} />)}
                    {items.map(item => <option key={`product-${item.id}`} value={item.name} label={`${item.name} (${item.primaryUnit ?? 'pcs'})`} />)}
                  </datalist>
                </Field>
                <Field label="Quantity">
                  <input name="quantity" type="number" step="0.01" min="0.01" className={FIELD_CLASS} />
                </Field>
                <Field label="Unit">
                  <input value={selectedRecipeUnit} readOnly className={`${FIELD_CLASS} bg-slate-100 text-slate-500`} />
                </Field>
                <button type="submit" className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 text-white text-xs font-black rounded-lg hover:bg-emerald-600">
                  <Plus size={15} /> Add
                </button>
              </form>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-blue-100/70 border-b border-blue-200">
                    <tr>
                      <th className="px-3 py-2 font-black text-slate-700">Product Name</th>
                      <th className="px-3 py-2 font-black text-slate-700 text-right">Quantity</th>
                      <th className="px-3 py-2 font-black text-slate-700">Unit</th>
                      <th className="px-3 py-2 font-black text-slate-700 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draftRecipe.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-8 text-center font-bold text-slate-500">No recipe products added.</td></tr>
                    ) : draftRecipe.map(line => (
                      <tr key={line.inventoryItemId}>
                        <td className="px-3 py-2 font-bold text-slate-800">{line.name}</td>
                        <td className="px-3 py-2 font-black text-slate-700 text-right">{line.quantity}</td>
                        <td className="px-3 py-2 font-bold text-slate-500">{line.unit}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setDraftRecipe(lines => lines.filter(candidate => candidate.inventoryItemId !== line.inventoryItemId))} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Remove">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-600">Estimated recipe cost: <span className="text-primary">{formatPaise(recipeCostPaise)}</span></p>
                <div className="flex gap-2">
                  <button onClick={() => { setDraftRecipe([]); updateMenuItem(recipeItem.id, { recipeItems: [] }); addToast('success', 'Recipe cleared') }} className="px-4 py-2 bg-red-50 text-red-600 text-xs font-black rounded-lg hover:bg-red-100">
                    Delete
                  </button>
                  <button onClick={handleSaveRecipe} className="px-4 py-2 bg-primary text-white text-xs font-black rounded-lg hover:bg-primary-dark shadow-md shadow-primary/20">
                    Save Recipe
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBillingRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            <ModalHeader title="Category Billing Rules" onClose={() => setShowBillingRuleModal(false)} />
            <form onSubmit={handleSeparateBillingUpdate} className="p-5 space-y-4">
              <Field label="Apply To">
                <select name="scope" defaultValue="category" className={FIELD_CLASS}>
                  <option value="category">Category and its subcategories</option>
                  <option value="subcategory">One subcategory only</option>
                  <option value="all">All categories</option>
                </select>
              </Field>
              <Field label="Category">
                <select name="categoryId" defaultValue={parentCategories[0]?.id ?? ''} className={FIELD_CLASS}>
                  {parentCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <select name="subcategoryId" defaultValue={subcategories[0]?.id ?? ''} className={FIELD_CLASS}>
                  {subcategories.length === 0 ? (
                    <option value="">No subcategories created</option>
                  ) : subcategories.map(category => (
                    <option key={category.id} value={category.id}>{categoryOptionLabel(category, categoriesById)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bill Title">
                <input name="billGroup" className={FIELD_CLASS} placeholder="Food, Liquor, Bar, Ice Cream..." />
              </Field>
              <label className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-wider">
                <input type="checkbox" name="separateBill" defaultChecked className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                Print as separate bill
              </label>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowBillingRuleModal(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm font-black rounded-xl hover:bg-slate-200">CANCEL</button>
                <button type="submit" className="flex-1 py-2.5 bg-primary text-white text-sm font-black rounded-xl hover:bg-primary-dark shadow-md shadow-primary/30">SAVE RULE</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
            <ModalHeader title="Category Tax Rules" onClose={() => setShowTaxModal(false)} />
            <form onSubmit={handleBulkTaxUpdate} className="p-5 space-y-4">
              <Field label="Apply To">
                <select name="scope" defaultValue="category" className={FIELD_CLASS}>
                  <option value="category">Category and its subcategories</option>
                  <option value="subcategory">One subcategory only</option>
                  <option value="all">All categories</option>
                </select>
              </Field>
              <Field label="Category">
                <select name="categoryId" defaultValue={parentCategories[0]?.id ?? ''} className={FIELD_CLASS}>
                  {parentCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <select name="subcategoryId" defaultValue={subcategories[0]?.id ?? ''} className={FIELD_CLASS}>
                  {subcategories.length === 0 ? (
                    <option value="">No subcategories created</option>
                  ) : subcategories.map(category => (
                    <option key={category.id} value={category.id}>{categoryOptionLabel(category, categoriesById)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tax Type">
                <select name="taxType" defaultValue="GST" className={FIELD_CLASS}>
                  <option value="GST">GST</option>
                  <option value="VAT">VAT</option>
                  <option value="None">None</option>
                </select>
              </Field>
              <Field label="Tax (%)">
                <select name="taxPercent" defaultValue="0" className={FIELD_CLASS}>
                  <option value="0">0%</option>
                  <option value="5">5% GST</option>
                  <option value="12">12% GST</option>
                  <option value="18">18% GST</option>
                </select>
              </Field>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowTaxModal(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 text-sm font-black rounded-xl hover:bg-slate-200">CANCEL</button>
                <button type="submit" className="flex-1 py-2.5 bg-primary text-white text-sm font-black rounded-xl hover:bg-primary-dark shadow-md shadow-primary/30">APPLY TAX</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="text" placeholder="Search..." value={value} onChange={e => onChange(e.target.value)} className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700 focus:outline-none focus:border-primary focus:bg-white" />
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="block text-[10px] font-black text-slate-700 mb-1 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <p className="text-xs font-black text-slate-800 uppercase tracking-wider border-t border-slate-100 pt-3">{title}</p>
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
      <h3 className="text-xl font-black text-slate-800 tracking-tight">{title}</h3>
      <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
        <Plus size={20} className="rotate-45" strokeWidth={2.5} />
      </button>
    </div>
  )
}
