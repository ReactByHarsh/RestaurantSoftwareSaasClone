import { MenuItem, MenuCategory, Station } from './types'

export const PRODUCT_CSV_HEADERS = [
  'ShortCode',
  'Barcode',
  'Name',
  'Category',
  'Subcategory',
  'BillGroup',
  'SeparateBillCategory',
  'KitchenStation',
  'ProductType',
  'Type',
  'CostPrice',
  'Price',
  'MRP',
  'SpecialPrice',
  'OnlinePrice',
  'DeliveryPrice',
  'TakeawayPrice',
  'PrimaryUnit',
  'MinStock',
  'PreparationMins',
  'TaxType',
  'TaxPercent',
  'HSN',
  'CGST',
  'SGST',
  'VAT',
  'CategoryDiscountPercent',
  'IsActive',
  'SeparateBill',
  'ActiveOnApp',
  'Recommended',
  'IsFavorite',
  'Description',
  'Toppings',
]

export function exportCsv(filename: string, rows: string[][]) {
  const csvContent = rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function parseCsvLine(text: string): string[] {
  const re_valid = /^\s*(?:'[^'\\]*(?:\\[\s\S][^'\\]*)*'|"[^"\\]*(?:\\[\s\S][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\s\S][^'\\]*)*'|"[^"\\]*(?:\\[\s\S][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/
  const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\s\S][^'\\]*)*)'|"([^"\\]*(?:\\[\s\S][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g
  
  if (!re_valid.test(text)) return []

  const a: string[] = []
  text.replace(re_value, function(m0, m1, m2, m3) {
    if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"))
    else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'))
    else if (m3 !== undefined) a.push(m3)
    return ''
  })
  
  if (/,\s*$/.test(text)) a.push('')
  return a
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim())
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++
      row.push(current.trim())
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  row.push(current.trim())
  if (row.some(value => value.length > 0)) rows.push(row)
  return rows
}

export function generateTemplate() {
  exportCsv('products_template.csv', [
    PRODUCT_CSV_HEADERS,
  ])
}

export function exportProducts(items: MenuItem[], categories: MenuCategory[], stations: Station[]) {
  const catMap = new Map(categories.map(c => [c.id, c]))
  const stationMap = new Map(stations.map(s => [s.id, s.name]))
  
  const rows = items.map(item => {
    const category = catMap.get(item.categoryId)
    const parent = category?.parentId ? catMap.get(category.parentId) : undefined
    return [
    item.shortCode || '',
    item.barcode || '',
    item.name,
    parent?.name || category?.name || 'Uncategorized',
    parent ? category?.name || '' : '',
    category?.billGroup || parent?.billGroup || (item.isSeparateBill ? 'Liquor' : 'Food'),
    (category?.separateBill ?? parent?.separateBill ?? item.isSeparateBill) ? 'Yes' : 'No',
    item.stationId ? stationMap.get(item.stationId) || '' : '',
    item.productType || 'sale_only',
    item.itemType,
    ((item.costPricePaise || 0) / 100).toFixed(2),
    (item.pricePaise / 100).toFixed(2),
    ((item.mrpPaise ?? item.pricePaise) / 100).toFixed(2),
    ((item.specialPricePaise ?? item.pricePaise) / 100).toFixed(2),
    ((item.onlinePricePaise ?? item.pricePaise) / 100).toFixed(2),
    ((item.deliveryPricePaise ?? item.pricePaise) / 100).toFixed(2),
    ((item.takeawayPricePaise ?? item.pricePaise) / 100).toFixed(2),
    item.primaryUnit || 'pcs',
    String(item.minimumStock ?? 0),
    String(item.preparationMinutes ?? 0),
    item.taxType || 'GST',
    item.taxPercent.toString(),
    item.hsnCode || '',
    String(item.cgstPercent ?? ''),
    String(item.sgstPercent ?? ''),
    String(item.vatPercent ?? ''),
    String(category?.discountPercent ?? parent?.discountPercent ?? ''),
    item.isAvailable ? 'Yes' : 'No',
    item.isSeparateBill ? 'Yes' : 'No',
    item.activeOnApp ? 'Yes' : 'No',
    item.recommended ? 'Yes' : 'No',
    item.isFavorite ? 'Yes' : 'No',
    item.description || '',
    item.modifierGroups?.flatMap(group => group.modifiers).map(modifier => `${modifier.name}|${(modifier.pricePaise / 100).toFixed(2)}`).join(';') || '',
  ]})
  
  exportCsv('products_export.csv', [PRODUCT_CSV_HEADERS, ...rows])
}
