import type { MenuItem, ProductUsageType } from './types'

export function normalizeProductType(value?: string): ProductUsageType | undefined {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
  if (normalized === 'sale_only' || normalized === 'sales_only') return 'sale_only'
  if (
    normalized === 'sale_purchase' ||
    normalized === 'sales_purchase' ||
    normalized === 'sale_purchase_both' ||
    normalized === 'sales_purchase_both'
  ) return 'sale_purchase'
  if (normalized === 'purchase_only' || normalized === 'purchases_only') return 'purchase_only'
  if (normalized === 'kitchen_processed') return 'kitchen_processed'
  return undefined
}

export function isSaleableMenuItem(item: Pick<MenuItem, 'isAvailable' | 'productType'>) {
  const type = normalizeProductType(item.productType)
  return item.isAvailable && (type === 'sale_only' || type === 'sale_purchase')
}
