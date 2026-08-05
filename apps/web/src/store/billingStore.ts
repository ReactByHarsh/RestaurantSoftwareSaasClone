import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AuditLog,
  Floor,
  InventoryItem,
  ItemType,
  KOT,
  KOTStatus,
  MenuCategory,
  MenuItem,
  Modifier,
  Order,
  OrderItem,
  OrderItemEditInput,
  OrderType,
  Payment,
  PaymentMethod,
  PurchaseEntry,
  RestaurantTable,
  Station,
  StockUnit,
  TableStatus,
} from '../lib/types'
import type { BillingSnapshot, CloudSyncSettings } from '../lib/cloudSync'
import { createCloudOrder, updateCloudOrder, addCloudKOT, updateCloudKOT, addCloudPayment, saveCloudSnapshot } from '../lib/cloudSync'
import { calculateTax } from '../lib/money'
import { isTauriDesktop, saveDesktopState } from '../lib/localDb'
import { realtimeClient } from '../lib/realtime'
import { DEFAULT_BRIDGE_URL, describePrinterError, normalizePrinterConnectionMode, sendPrintJob, type PrinterConnectionMode } from '../lib/printer'
import { buildKotPrintText, buildReceiptPrintParts } from '../lib/printTemplates'
import { isInventoryMenuItem, isSaleableMenuItem } from '../lib/productTypes'
import { DEFAULT_STATIONS } from '../lib/seedData'
import { useUIStore } from './uiStore'
import { useStaffStore } from './staffStore'

export interface CartItem {
  menuItemId: string
  name: string
  itemType: ItemType
  isSeparateBill?: boolean
  quantity: number
  unitPricePaise: number
  basePricePaise: number
  taxPercent: number
  taxType?: 'GST' | 'VAT' | 'None'
  stationId?: string
  note?: string
  modifiers?: string[]
  discountPaise?: number
}

export interface OutletSettings {
  id: string
  tenantId: string
  name: string
  code: string
  address?: string
  phone?: string
  logoDataUrl?: string
  timezone: string
  currency: string
  gstin?: string
  status: 'active' | 'inactive'
  enableDirtyTableStatus: boolean
  enableCreditAccounts: boolean
  enableOrderMenuPanelToggle: boolean
  enableOrderTablesDrawer: boolean
}

export interface PrintSettings {
  receiptWidth: '58mm' | '72mm' | '80mm'
  billMode: 'single' | 'separate'
  kotPrintMode: 'single' | 'separate'
  businessName: string
  headingSize: 'compact' | 'standard' | 'large'
  fontSize: 'compact' | 'standard' | 'large'
  headerText: string
  footerText: string
  showGstin: boolean
  showGstinOnFirstBill: boolean
  showGstinOnSecondBill: boolean
  showKotToken: boolean
  showTaxInvoiceLabel: boolean
  showBillPartLabel: boolean
  upiId: string
  showUpiQrOnBill: boolean
  showUpiIdOnBill: boolean
  showPaymentDetailsOnBill: boolean
  autoPrintReceipt: boolean
  autoPrintKot: boolean
  printerName: string
  connectionMode: PrinterConnectionMode
  usbVendorId?: number
  usbProductId?: number
  bridgeUrl: string
  autoCut: boolean
  openCashDrawer: boolean
  directKotPrint: boolean
  directReceiptPrint: boolean
  directProformaPrint: boolean
}

export interface AppUpdateSettings {
  autoCheck: boolean
  autoInstall: boolean
  lastCheckedAt?: string
  lastAvailableVersion?: string
}

const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  enabled: false,
  serverUrl: 'https://bhojpatra-cloud.yash-v-shinde.workers.dev',
  tenantId: '',
  outletId: '',
  accountLogin: '',
  accountSecret: '',
  autoSyncDaily: true,
  syncHour24: 2,
  cloudMode: 'daily_snapshot',
}

const DEFAULT_APP_UPDATE_SETTINGS: AppUpdateSettings = {
  autoCheck: true,
  autoInstall: false,
}

type PaymentInput = { method: string; amountPaise: number; referenceNo?: string }
export type DataDeletionSection =
  | 'orders'
  | 'payments'
  | 'menu'
  | 'floorsTables'
  | 'kitchenStations'
  | 'inventory'
  | 'auditLogs'
  | 'allBusinessData'

interface BillingStore {
  outlet: OutletSettings
  printSettings: PrintSettings
  cloudSync: CloudSyncSettings
  appUpdate: AppUpdateSettings
  menuCategories: MenuCategory[]
  menuItems: MenuItem[]
  floors: Floor[]
  tables: RestaurantTable[]
  stations: Station[]
  inventoryItems: InventoryItem[]
  purchaseEntries: PurchaseEntry[]
  orders: Order[]
  orderItems: OrderItem[]
  kots: KOT[]
  payments: Payment[]
  auditLogs: AuditLog[]

  currentOrder: Order | null
  cart: CartItem[]
  savedCarts: Record<string, CartItem[]> // Maps tableId -> CartItem[] for unsaved KOTs
  activeOrderType: OrderType
  selectedTableId: string | null

  exportSnapshot: () => BillingSnapshot
  importSnapshot: (snapshot: BillingSnapshot, preserveSession?: boolean) => void
  reset: () => void

  updateOutlet: (settings: Partial<OutletSettings>) => void
  updatePrintSettings: (settings: Partial<PrintSettings>) => void
  updateCloudSyncSettings: (settings: Partial<CloudSyncSettings>) => void
  updateAppUpdateSettings: (settings: Partial<AppUpdateSettings>) => void
  deleteDataSection: (section: DataDeletionSection) => void

  addCategory: (name: string, color?: string, settings?: Partial<MenuCategory>) => void
  updateCategory: (id: string, updates: Partial<MenuCategory>) => void
  deleteCategory: (id: string) => boolean
  addMenuItem: (item: Omit<MenuItem, 'id' | 'outletId' | 'sortOrder'>) => void
  updateMenuItem: (id: string, updates: Partial<MenuItem>) => void
  deleteMenuItem: (id: string) => void
  addStation: (name: string, settings?: Partial<Station>) => Station
  updateStation: (id: string, updates: Partial<Station>) => void
  deleteStation: (id: string) => boolean

  addFloor: (name: string) => void
  updateFloor: (id: string, updates: Partial<Floor>) => void
  deleteFloor: (id: string) => boolean
  addTable: (input: { floorId: string; name: string; seats: number }) => void
  updateTable: (id: string, updates: Partial<RestaurantTable>) => void
  deleteTable: (id: string) => boolean
  updateTableStatus: (tableId: string, updates: Partial<RestaurantTable>) => void

  addInventoryItem: (input: Omit<InventoryItem, 'id' | 'outletId' | 'lastUpdatedAt'>) => void
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void
  deleteInventoryItem: (id: string) => void
  adjustInventory: (id: string, delta: number) => void
  addPurchaseEntry: (input: Omit<PurchaseEntry, 'id' | 'outletId' | 'createdAt' | 'updatedAt' | 'inventoryItemId'> & { inventoryItemId?: string; minimumStock?: number }) => PurchaseEntry
  updatePurchaseEntry: (id: string, updates: Partial<Omit<PurchaseEntry, 'id' | 'outletId' | 'createdAt' | 'updatedAt'>>) => void
  deletePurchaseEntry: (id: string) => void

  setOrderType: (type: OrderType) => void
  selectTable: (tableId: string | null) => void
  startNewOrder: (userId: string, userName: string) => void
  loadOrder: (orderId: string) => void
  addToCart: (item: MenuItem, options?: { modifiers?: Modifier[]; note?: string }) => void
  removeFromCart: (menuItemId: string) => void
  updateQty: (menuItemId: string, delta: number) => void
  setItemNote: (menuItemId: string, note: string) => void
  setItemPrice: (menuItemId: string, unitPricePaise: number) => void
  setItemModifiers: (menuItemId: string, modifiers: Modifier[]) => void
  setOrderCustomer: (name: string, phone: string) => void
  applyGlobalDiscount: (type: 'percentage' | 'amount', value: number, categoryIds: string[]) => void
  applyDiscountToOrderItem: (orderItemId: string, type: 'percentage' | 'amount', value: number) => void
  clearCart: () => void
  sendKOT: (userId: string, userName: string) => KOT | null
  addPayment: (orderId: string, payment: PaymentInput, userId: string) => void
  settlePayment: (orderId: string | null, payments: PaymentInput[], discountPaise: number, userId: string, userName: string, printAfter?: boolean) => Promise<boolean>
  cancelPayments: (orderId: string) => void
  cancelOrder: (orderId: string, reason: string) => void
  cancelKOT: (kotId: string, reason: string) => boolean
  cancelOrderItemQty: (orderItemId: string, qtyToCancel: number, reason: string) => boolean
  cancelOrderItems: (orderId: string, reason: string) => boolean
  updateOrderGlobalDiscount: (orderId: string, type: 'percentage' | 'amount', value: number) => void
  updateOrderItems: (orderId: string, items: OrderItemEditInput[]) => boolean
  revisePayment: (orderId: string, method: PaymentMethod, referenceNo: string, reason: string, userId: string) => boolean
  updateKOTItemStatus: (kotId: string, itemId: string, status: KOTStatus) => void
  updateKOTStatus: (kotId: string, status: KOTStatus) => void

  // Table operations
  transferTable: (fromTableId: string, toTableId: string) => boolean
  transferKOTs: (sourceTableId: string, targetTableId: string, kotIds: string[]) => boolean
  mergeTable: (sourceTableId: string, targetTableId: string) => boolean
  updateTableSeats: (tableId: string, seats: number) => void

  printReceipt: (orderId: string, type?: 'invoice' | 'proforma') => void
  printCartProforma: () => void
  printKOT: (kotId: string, kotIds?: string[]) => void
  getCartTotal: () => { subtotal: number; tax: number; discount: number; total: number }
  getActiveKOTs: () => KOT[]
  getCustomerAccountDetails: (phone: string) => { balancePaise: number, unpaidItems: string[] }
  getTodaySummary: () => {
    totalSalesPaise: number
    orderCount: number
    avgOrderValuePaise: number
    openTableCount: number
    cancelledPaise: number
    discountPaise: number
    paymentModes: { method: PaymentMethod; amountPaise: number }[]
    topItems: { name: string; qty: number; revenuePaise: number }[]
    hourlyData: { hour: string; sales: number }[]
  }
}

const today = () => new Date().toISOString().split('T')[0]
const now = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const taxablePercent = (item: { taxPercent?: number; taxType?: 'GST' | 'VAT' | 'None' }) =>
  item.taxType === 'None' ? 0 : item.taxPercent ?? 0
const CREDIT_PAYMENT_METHODS = new Set<PaymentMethod>(['account', 'due'])

function isCollectedPayment(method: string): method is PaymentMethod {
  return !CREDIT_PAYMENT_METHODS.has(method as PaymentMethod)
}

function getCollectedPaidPaise(payments: Payment[], orderId: string) {
  return payments
    .filter((payment) => payment.orderId === orderId && payment.status === 'success' && isCollectedPayment(payment.method))
    .reduce((sum, payment) => sum + payment.amountPaise, 0)
}

function getPaymentStatus(totalPaise: number, paidPaise: number): Order['paymentStatus'] {
  if (totalPaise > 0 && paidPaise >= totalPaise) return 'paid'
  if (paidPaise > 0) return 'partial'
  return 'unpaid'
}

const DEFAULT_OUTLET: OutletSettings = {
  id: 'out_local',
  tenantId: 'local_restaurant',
  name: 'BhojPatra Bistro',
  code: 'BHOJ',
  address: 'Main Market Road',
  phone: '+91 90000 00000',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  gstin: '27ABCDE1234F1Z5',
  logoDataUrl: '',
  status: 'active',
  enableDirtyTableStatus: true,
  enableCreditAccounts: false,
  enableOrderMenuPanelToggle: false,
  enableOrderTablesDrawer: false,
}

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receiptWidth: '80mm',
  billMode: 'separate',
  kotPrintMode: 'separate',
  businessName: 'BhojPatra Bistro',
  headingSize: 'standard',
  fontSize: 'standard',
  headerText: 'Tax Invoice',
  footerText: 'Thank you. Please visit again.',
  showGstin: true,
  showGstinOnFirstBill: true,
  showGstinOnSecondBill: true,
  showKotToken: true,
  showTaxInvoiceLabel: true,
  showBillPartLabel: true,
  upiId: '',
  showUpiQrOnBill: false,
  showUpiIdOnBill: false,
  showPaymentDetailsOnBill: true,
  autoPrintReceipt: false,
  autoPrintKot: false,
  printerName: '',
  connectionMode: 'browser',
  bridgeUrl: 'http://127.0.0.1:8181',
  autoCut: true,
  openCashDrawer: false,
  directKotPrint: false,
  directReceiptPrint: false,
  directProformaPrint: false,
}

function combineKotsForPrint(kots: KOT[]): KOT {
  const first = kots[0]
  if (!first) throw new Error('At least one KOT is required')
  return {
    ...first,
    stationId: undefined,
    kotNo: kots.map((kot) => kot.kotNo).join(' + '),
    items: kots.flatMap((kot) => kot.items),
  }
}

type DevicePrintSettings = Pick<PrintSettings,
  | 'receiptWidth'
  | 'headingSize'
  | 'fontSize'
  | 'printerName'
  | 'connectionMode'
  | 'usbVendorId'
  | 'usbProductId'
  | 'bridgeUrl'
  | 'autoCut'
  | 'openCashDrawer'
  | 'directKotPrint'
  | 'directReceiptPrint'
  | 'directProformaPrint'
>

const DEVICE_PRINT_SETTINGS_KEY = 'bhojpatra-device-printer-settings-v1'

function pickDevicePrintSettings(settings: PrintSettings): DevicePrintSettings {
  return {
    receiptWidth: settings.receiptWidth,
    headingSize: settings.headingSize,
    fontSize: settings.fontSize,
    printerName: settings.printerName,
    connectionMode: settings.connectionMode,
    usbVendorId: settings.usbVendorId,
    usbProductId: settings.usbProductId,
    bridgeUrl: settings.bridgeUrl,
    autoCut: settings.autoCut,
    openCashDrawer: settings.openCashDrawer,
    directKotPrint: settings.directKotPrint,
    directReceiptPrint: settings.directReceiptPrint,
    directProformaPrint: settings.directProformaPrint,
  }
}

function readDevicePrintSettings(): Partial<DevicePrintSettings> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DEVICE_PRINT_SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Partial<DevicePrintSettings> : null
  } catch {
    return null
  }
}

function saveDevicePrintSettings(settings: PrintSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVICE_PRINT_SETTINGS_KEY, JSON.stringify(pickDevicePrintSettings(settings)))
  } catch {
    // The main Zustand persistence still retains these settings if storage is restricted.
  }
}

function mergeDevicePrintSettings(incoming: Partial<PrintSettings> | undefined, localFallback?: PrintSettings): PrintSettings {
  const base = { ...DEFAULT_PRINT_SETTINGS, ...incoming, connectionMode: normalizePrinterConnectionMode(incoming?.connectionMode) }
  const device = readDevicePrintSettings() ?? (localFallback ? pickDevicePrintSettings(localFallback) : null)
  const normalizedDevice = device
    ? { ...device, connectionMode: normalizePrinterConnectionMode(device.connectionMode) }
    : null
  const bridgeWasChosen = base.connectionMode === 'bridge' || normalizedDevice?.connectionMode === 'bridge'
  const merged = normalizedDevice
    ? { ...base, ...normalizedDevice, connectionMode: bridgeWasChosen ? 'bridge' as const : normalizedDevice.connectionMode }
    : base
  saveDevicePrintSettings(merged)
  return merged
}

const DEMO_CATEGORY_IDS = new Set(['cat_starters', 'cat_curries', 'cat_breads', 'cat_rice', 'cat_beverages'])
const DEMO_MENU_ITEM_IDS = new Set([
  'item_paneer_tikka',
  'item_hara_bhara',
  'item_butter_chicken',
  'item_kadai_paneer',
  'item_dal_makhani',
  'item_butter_naan',
  'item_garlic_naan',
  'item_jeera_rice',
  'item_biryani',
  'item_masala_chaas',
  'item_fresh_lime',
])
const DEMO_FLOOR_IDS = new Set(['floor_main', 'floor_family'])
const DEMO_TABLE_IDS = new Set(['tbl_t1', 'tbl_t2', 'tbl_t3', 'tbl_t4', 'tbl_t5', 'tbl_t6', 'tbl_f1', 'tbl_f2', 'tbl_f3', 'tbl_f4', 'tbl_f5', 'tbl_f6'])
const DEMO_INVENTORY_IDS = new Set(['inv_paneer', 'inv_chicken', 'inv_flour', 'inv_basmati', 'inv_butter', 'inv_spice_mix', 'inv_chaas_mix'])

function defaultStations(outletId = DEFAULT_OUTLET.id): Station[] {
  return DEFAULT_STATIONS.map((station) => ({ ...station, outletId }))
}

function containsOnlyDemoRows<T extends { id: string }>(rows: T[], demoIds: Set<string>) {
  return rows.length === 0 || rows.every((row) => demoIds.has(row.id))
}

function stripLegacyDemoData(snapshot: BillingSnapshot): BillingSnapshot {
  const hasBusinessActivity =
    snapshot.orders.length > 0 ||
    snapshot.orderItems.length > 0 ||
    snapshot.kots.length > 0 ||
    snapshot.payments.length > 0 ||
    Object.values(snapshot.savedCarts ?? {}).some((cart) => cart.length > 0)

  if (hasBusinessActivity) return snapshot

  const hasDemoData =
    snapshot.menuItems.some((item) => DEMO_MENU_ITEM_IDS.has(item.id)) ||
    snapshot.tables.some((table) => DEMO_TABLE_IDS.has(table.id)) ||
    snapshot.inventoryItems.some((item) => DEMO_INVENTORY_IDS.has(item.id))

  if (!hasDemoData) return snapshot

  const canSafelyClear =
    containsOnlyDemoRows(snapshot.menuCategories, DEMO_CATEGORY_IDS) &&
    containsOnlyDemoRows(snapshot.menuItems, DEMO_MENU_ITEM_IDS) &&
    containsOnlyDemoRows(snapshot.floors, DEMO_FLOOR_IDS) &&
    containsOnlyDemoRows(snapshot.tables, DEMO_TABLE_IDS) &&
    containsOnlyDemoRows(snapshot.inventoryItems, DEMO_INVENTORY_IDS)

  if (!canSafelyClear) return snapshot

  return {
    ...snapshot,
    menuCategories: [],
    menuItems: [],
    floors: [],
    tables: [],
    stations: defaultStations(snapshot.outlet.id),
    inventoryItems: [],
    savedCarts: {},
  }
}

function orderNo(existing: Order[]) {
  const max = existing.reduce((value, order) => {
    const parsed = Number(order.orderNo.replace('ORD-', ''))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return `ORD-${String(max + 1).padStart(4, '0')}`
}

function kotNo(existing: KOT[]) {
  const max = existing.reduce((value, kot) => {
    const parsed = Number(kot.kotNo.replace('KOT-', ''))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return `KOT-${String(max + 1).padStart(4, '0')}`
}

function addAudit(state: BillingStore, action: string, entityType: string, details: string, entityId?: string): AuditLog[] {
  return [{
    id: newId('audit'),
    userId: 'system',
    userName: 'System',
    action,
    entityType,
    entityId,
    details,
    createdAt: now(),
  }, ...state.auditLogs].slice(0, 200)
}

function applyRecipeStockDelta(state: BillingStore, soldItems: OrderItem[], direction: 'consume' | 'restore'): InventoryItem[] {
  const deductions = new Map<string, number>()
  soldItems.forEach((soldItem) => {
    if (soldItem.status === 'cancelled') return
    const menuItem = state.menuItems.find((item) => item.id === soldItem.menuItemId)
    menuItem?.recipeItems?.forEach((recipeLine) => {
      deductions.set(recipeLine.inventoryItemId, (deductions.get(recipeLine.inventoryItemId) ?? 0) + (recipeLine.quantity * soldItem.quantity))
    })
  })

  if (deductions.size === 0) return state.inventoryItems
  const changedAt = now()
  return state.inventoryItems.map((item) => {
    const used = deductions.get(item.id)
    return used ? {
      ...item,
      currentStock: direction === 'consume' ? Math.max(0, item.currentStock - used) : item.currentStock + used,
      lastUpdatedAt: changedAt,
    } : item
  })
}

function ensureMenuInventoryItems(inventoryItems: InventoryItem[], menuItems: MenuItem[], outletId: string): InventoryItem[] {
  const next = [...inventoryItems]
  const changedAt = now()

  menuItems.filter(isInventoryMenuItem).forEach((menuItem) => {
    const normalizedName = menuItem.name.trim().toLowerCase()
    const existingIndex = next.findIndex((item) =>
      item.menuItemId === menuItem.id || (!item.menuItemId && item.name.trim().toLowerCase() === normalizedName)
    )

    if (existingIndex >= 0) {
      const existing = next[existingIndex]
      next[existingIndex] = {
        ...existing,
        menuItemId: menuItem.id,
        name: menuItem.name,
        unit: existing.currentStock === 0 ? (menuItem.primaryUnit ?? existing.unit) : existing.unit,
        minimumStock: existing.minimumStock || menuItem.minimumStock || 0,
        costPerUnit: existing.costPerUnit || menuItem.costPricePaise || 0,
      }
      return
    }

    next.unshift({
      id: `inv_menu_${menuItem.id}`,
      outletId,
      menuItemId: menuItem.id,
      name: menuItem.name,
      unit: menuItem.primaryUnit ?? 'pcs',
      currentStock: 0,
      minimumStock: menuItem.minimumStock ?? 0,
      costPerUnit: menuItem.costPricePaise ?? 0,
      lastUpdatedAt: changedAt,
    })
  })

  return next
}

function hasRecipeConsumptionAudit(state: BillingStore, orderId: string) {
  return state.auditLogs.some(log => log.entityId === orderId && log.action === 'recipe.stock.consumed')
}

function hasRecipeReversalAudit(state: BillingStore, orderId: string) {
  return state.auditLogs.some(log => log.entityId === orderId && log.action === 'recipe.stock.restored')
}

function categoryChain(categories: MenuCategory[], categoryId?: string) {
  const chain: MenuCategory[] = []
  let cursor = categories.find((category) => category.id === categoryId)
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor.id)) {
    chain.unshift(cursor)
    seen.add(cursor.id)
    cursor = cursor.parentId ? categories.find((category) => category.id === cursor?.parentId) : undefined
  }
  return chain
}

function effectiveCategoryRule(categories: MenuCategory[], categoryId?: string) {
  return categoryChain(categories, categoryId).reduce<Partial<MenuCategory>>((rule, category) => ({
    ...rule,
    billGroup: category.billGroup?.trim() || rule.billGroup,
    separateBill: category.separateBill ?? rule.separateBill,
    taxType: category.taxType ?? rule.taxType,
    taxPercent: category.taxPercent ?? rule.taxPercent,
    cgstPercent: category.cgstPercent ?? rule.cgstPercent,
    sgstPercent: category.sgstPercent ?? rule.sgstPercent,
    vatPercent: category.vatPercent ?? rule.vatPercent,
    discountPercent: category.discountPercent ?? rule.discountPercent,
  }), {})
}

function isSeparateBillCategory(category?: MenuCategory, parent?: MenuCategory) {
  if (category?.separateBill !== undefined) return category.separateBill
  if (parent?.separateBill !== undefined) return parent.separateBill
  const value = `${category?.name ?? ''} ${parent?.name ?? ''}`.toLowerCase()
  return /\b(liquor|alcohol|beer|wine|whisky|whiskey|rum|vodka|gin|brandy|scotch|tequila|bar)\b/.test(value)
}

const INITIAL_STATE = {
  outlet: DEFAULT_OUTLET,
  printSettings: DEFAULT_PRINT_SETTINGS,
  cloudSync: DEFAULT_CLOUD_SYNC_SETTINGS,
  appUpdate: DEFAULT_APP_UPDATE_SETTINGS,
  menuCategories: [] as MenuCategory[],
  menuItems: [] as MenuItem[],
  floors: [] as Floor[],
  tables: [] as RestaurantTable[],
  stations: defaultStations(),
  inventoryItems: [] as InventoryItem[],
  purchaseEntries: [] as PurchaseEntry[],
  orders: [],
  orderItems: [],
  kots: [],
  payments: [],
  auditLogs: [],
  currentOrder: null,
  cart: [],
  savedCarts: {},
  activeOrderType: 'dine_in' as OrderType,
  selectedTableId: null as string | null,
}

const syncCart = (state: BillingStore, newCart: CartItem[]): Partial<BillingStore> => {
  if (state.activeOrderType === 'dine_in' && state.selectedTableId) {
    const savedCarts = { ...state.savedCarts }
    if (newCart.length > 0) savedCarts[state.selectedTableId] = newCart
    else delete savedCarts[state.selectedTableId]

    const order = state.currentOrder
    const hasConfirmedItems = order
      ? state.orderItems.some((item) => item.orderId === order.id && item.status !== 'cancelled')
      : false
    const isEmptyDraftForSelectedTable = order &&
      !hasConfirmedItems &&
      newCart.length === 0 &&
      order.tableId === state.selectedTableId

    if (isEmptyDraftForSelectedTable) {
      return {
        orders: state.orders.filter((candidate) => candidate.id !== order.id),
        orderItems: state.orderItems.filter((candidate) => candidate.orderId !== order.id),
        kots: state.kots.filter((candidate) => candidate.orderId !== order.id),
        tables: state.tables.map((table) => table.activeOrderId === order.id
          ? { ...table, status: 'available' as TableStatus, activeOrderId: undefined }
          : table),
        currentOrder: null,
        cart: [],
        savedCarts,
      }
    }

    return { cart: newCart, savedCarts }
  }
  return { cart: newCart }
}

function parkActiveCart(state: BillingStore) {
  if (state.activeOrderType !== 'dine_in' || !state.selectedTableId) return state.savedCarts
  const savedCarts = { ...state.savedCarts }
  if (state.cart.length > 0) savedCarts[state.selectedTableId] = state.cart
  else delete savedCarts[state.selectedTableId]
  return savedCarts
}

function cleanSavedCarts(savedCarts: Record<string, CartItem[]> = {}) {
  return Object.fromEntries(
    Object.entries(savedCarts).filter(([, cart]) => Array.isArray(cart) && cart.length > 0)
  ) as Record<string, CartItem[]>
}

function mergeSavedCarts(remote: Record<string, CartItem[]> = {}, local: Record<string, CartItem[]> = {}) {
  return cleanSavedCarts({ ...remote, ...local })
}

function getActiveItemCountByOrder(orderItems: OrderItem[]) {
  const itemCountByOrder = new Map<string, number>()
  orderItems.forEach((item) => {
    if (item.status !== 'cancelled') itemCountByOrder.set(item.orderId, (itemCountByOrder.get(item.orderId) ?? 0) + item.quantity)
  })
  return itemCountByOrder
}

function isClosedOrder(order?: Order | null) {
  return !order || ['paid', 'cancelled', 'void'].includes(order.status)
}

function preserveNewerCompletedOrders(incoming: BillingSnapshot, local: BillingStore): BillingSnapshot {
  const incomingOrderById = new Map(incoming.orders.map((order) => [order.id, order]))
  const protectedOrders = local.orders.filter((localOrder) => {
    if (!isClosedOrder(localOrder)) return false
    const incomingOrder = incomingOrderById.get(localOrder.id)
    if (!incomingOrder) return true
    if (isClosedOrder(incomingOrder)) return false
    const localUpdatedAt = Date.parse(localOrder.updatedAt) || 0
    const incomingUpdatedAt = Date.parse(incomingOrder.updatedAt) || 0
    return localUpdatedAt >= incomingUpdatedAt
  })
  if (protectedOrders.length === 0) return incoming

  const protectedOrderIds = new Set(protectedOrders.map((order) => order.id))
  const protectedTableIds = new Set(protectedOrders.flatMap((order) => order.tableId ? [order.tableId] : []))
  const localTableById = new Map(local.tables.map((table) => [table.id, table]))
  const localOrderItems = local.orderItems.filter((item) => protectedOrderIds.has(item.orderId))
  const localKots = local.kots.filter((kot) => protectedOrderIds.has(kot.orderId))
  const localPayments = local.payments.filter((payment) => protectedOrderIds.has(payment.orderId))
  const savedCarts = { ...(incoming.savedCarts ?? {}) }
  protectedTableIds.forEach((tableId) => delete savedCarts[tableId])

  return {
    ...incoming,
    orders: [
      ...incoming.orders.filter((order) => !protectedOrderIds.has(order.id)),
      ...protectedOrders,
    ],
    orderItems: [
      ...incoming.orderItems.filter((item) => !protectedOrderIds.has(item.orderId)),
      ...localOrderItems,
    ],
    kots: [
      ...incoming.kots.filter((kot) => !protectedOrderIds.has(kot.orderId)),
      ...localKots,
    ],
    payments: [
      ...incoming.payments.filter((payment) => !protectedOrderIds.has(payment.orderId)),
      ...localPayments,
    ],
    tables: incoming.tables.map((table) => {
      if (!protectedTableIds.has(table.id)) return table
      const localTable = localTableById.get(table.id)
      return localTable
        ? { ...localTable, activeOrderId: undefined }
        : { ...table, status: 'available' as TableStatus, activeOrderId: undefined }
    }),
    savedCarts,
  }
}

function reconcileSnapshot(snapshot: BillingSnapshot): BillingSnapshot {
  const cleanedSavedCarts = cleanSavedCarts(snapshot.savedCarts)
  const closedOrderIds = new Set(
    snapshot.orders.filter((order) => isClosedOrder(order)).map((order) => order.id)
  )
  const closedLinkedTableIds = new Set(
    snapshot.tables
      .filter((table) => table.activeOrderId && closedOrderIds.has(table.activeOrderId))
      .map((table) => table.id)
  )
  // A completed/cancelled order must not leave a parked cart behind when an
  // imported snapshot still points the table at that closed order.
  const savedCarts = Object.fromEntries(
    Object.entries(cleanedSavedCarts).filter(([tableId]) => !closedLinkedTableIds.has(tableId))
  ) as Record<string, CartItem[]>
  const itemCountByOrder = getActiveItemCountByOrder(snapshot.orderItems)

  const tableByOrderId = new Map<string, RestaurantTable>()
  snapshot.tables.forEach((table) => {
    if (table.activeOrderId) tableByOrderId.set(table.activeOrderId, table)
  })

  const keptOrders = snapshot.orders.filter((order) => {
    if (isClosedOrder(order)) return true
    const hasItems = (itemCountByOrder.get(order.id) ?? 0) > 0
    const hasPendingCart = order.tableId ? (savedCarts[order.tableId]?.length ?? 0) > 0 : false
    const tablePointsHere = tableByOrderId.get(order.id)?.id === order.tableId
    return hasItems || hasPendingCart || !tablePointsHere
  })
  const keptOrderIds = new Set(keptOrders.map((order) => order.id))

  const tables = snapshot.tables.map((table) => {
    if (!table.activeOrderId) return table
    const order = keptOrders.find((candidate) => candidate.id === table.activeOrderId)
    const hasConfirmedItems = order ? (itemCountByOrder.get(order.id) ?? 0) > 0 : false
    const hasPendingCart = (savedCarts[table.id]?.length ?? 0) > 0
    if (isClosedOrder(order) || (!hasConfirmedItems && !hasPendingCart)) {
      return { ...table, status: 'available' as TableStatus, activeOrderId: undefined }
    }
    return table
  })

  return {
    ...snapshot,
    savedCarts,
    orders: keptOrders,
    orderItems: snapshot.orderItems.filter((item) => keptOrderIds.has(item.orderId)),
    kots: snapshot.kots.filter((kot) => keptOrderIds.has(kot.orderId)),
    payments: snapshot.payments.filter((payment) => keptOrderIds.has(payment.orderId)),
    tables,
  }
}

export const useBillingStore = create<BillingStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      exportSnapshot: () => {
        const state = get()
        return stripLegacyDemoData(reconcileSnapshot({
          outlet: state.outlet,
          printSettings: state.printSettings,
          cloudSync: state.cloudSync,
          appUpdate: state.appUpdate,
          menuCategories: state.menuCategories,
          menuItems: state.menuItems,
          floors: state.floors,
          tables: state.tables,
          stations: state.stations,
          inventoryItems: state.inventoryItems,
          purchaseEntries: state.purchaseEntries,
          orders: state.orders,
          orderItems: state.orderItems,
          kots: state.kots,
          payments: state.payments,
          auditLogs: state.auditLogs,
          savedCarts: state.savedCarts,
        }))
      },

      importSnapshot: (snapshot, preserveSession = false) => set((state) => {
        const localSavedCarts = preserveSession ? parkActiveCart(state) : state.savedCarts
        const conflictSafeSnapshot = preserveSession
          ? preserveNewerCompletedOrders(snapshot, state)
          : snapshot
        const incomingSnapshot = preserveSession
          ? { ...conflictSafeSnapshot, savedCarts: mergeSavedCarts(conflictSafeSnapshot.savedCarts, localSavedCarts) }
          : conflictSafeSnapshot
        const normalizedBase = stripLegacyDemoData(reconcileSnapshot(incomingSnapshot))
        const normalized = {
          ...normalizedBase,
          inventoryItems: ensureMenuInventoryItems(normalizedBase.inventoryItems, normalizedBase.menuItems, normalizedBase.outlet.id),
        }
        const remoteCurrentOrder = state.currentOrder
          ? normalized.orders.find((order) => order.id === state.currentOrder?.id) ?? null
          : null

        const selectedTableStillExists = preserveSession &&
          state.selectedTableId &&
          normalized.tables.some((table) => table.id === state.selectedTableId)

        return {
          ...normalized,
          tables: normalized.tables,
          outlet: { ...DEFAULT_OUTLET, ...normalized.outlet },
          printSettings: mergeDevicePrintSettings(normalized.printSettings, state.printSettings),
          cloudSync: { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...normalized.cloudSync },
          appUpdate: { ...DEFAULT_APP_UPDATE_SETTINGS, ...normalized.appUpdate },
          purchaseEntries: normalized.purchaseEntries ?? [],
          savedCarts: normalized.savedCarts ?? {},
          currentOrder: preserveSession ? remoteCurrentOrder : null,
          cart: selectedTableStillExists ? (normalized.savedCarts?.[state.selectedTableId!] ?? state.cart) : [],
          selectedTableId: selectedTableStillExists ? state.selectedTableId : null,
        }
      }),

      reset: () => set(INITIAL_STATE),

      updateOutlet: (settings) => set((state) => ({
        outlet: { ...state.outlet, ...settings },
        printSettings: settings.name ? { ...state.printSettings, businessName: settings.name } : state.printSettings,
        tables: settings.enableDirtyTableStatus === false
          ? state.tables.map((table) => table.status === 'dirty' ? { ...table, status: 'available' as TableStatus } : table)
          : state.tables,
        auditLogs: addAudit(state, 'settings.outlet.updated', 'outlet', 'Outlet settings updated', state.outlet.id),
      })),

      updatePrintSettings: (settings) => set((state) => {
        const printSettings = {
          ...state.printSettings,
          ...settings,
          connectionMode: normalizePrinterConnectionMode(settings.connectionMode ?? state.printSettings.connectionMode),
        }
        saveDevicePrintSettings(printSettings)
        return {
          printSettings,
          auditLogs: addAudit(state, 'settings.print.updated', 'settings', 'Thermal print settings updated'),
        }
      }),

      updateCloudSyncSettings: (settings) => set((state) => ({
        cloudSync: { ...state.cloudSync, ...settings },
        auditLogs: addAudit(state, 'settings.cloudsync.updated', 'settings', 'Cloud sync settings updated'),
      })),

      updateAppUpdateSettings: (settings) => set((state) => ({
        appUpdate: { ...state.appUpdate, ...settings },
        auditLogs: addAudit(state, 'settings.appupdate.updated', 'settings', 'App update settings updated'),
      })),

      deleteDataSection: (section) => set((state) => {
        const resetTables = state.tables.map((table) => ({ ...table, status: 'available' as TableStatus, activeOrderId: undefined }))
        const audit = (details: string) => addAudit(state, 'data.deleted', 'admin_data', details)

        if (section === 'orders') {
          return {
            orders: [],
            orderItems: [],
            kots: [],
            payments: [],
            currentOrder: null,
            cart: [],
            savedCarts: {},
            selectedTableId: null,
            tables: resetTables,
            auditLogs: audit('Deleted orders, KOTs, payments, and active carts'),
          }
        }
        if (section === 'payments') {
          return {
            payments: [],
            orders: state.orders.map((order) => ({
              ...order,
              paidPaise: 0,
              paymentStatus: 'unpaid' as const,
              status: order.status === 'paid' ? 'billed' as const : order.status,
              closedAt: order.status === 'paid' ? undefined : order.closedAt,
              updatedAt: now(),
            })),
            currentOrder: state.currentOrder ? {
              ...state.currentOrder,
              paidPaise: 0,
              paymentStatus: 'unpaid' as const,
              status: state.currentOrder.status === 'paid' ? 'billed' as const : state.currentOrder.status,
              closedAt: state.currentOrder.status === 'paid' ? undefined : state.currentOrder.closedAt,
              updatedAt: now(),
            } : null,
            auditLogs: audit('Deleted payment records and reset order payment status'),
          }
        }
        if (section === 'menu') {
          return {
            menuCategories: [],
            menuItems: [],
            cart: [],
            savedCarts: {},
            auditLogs: audit('Deleted menu categories and items'),
          }
        }
        if (section === 'floorsTables') {
          return {
            floors: [],
            tables: [],
            selectedTableId: null,
            savedCarts: {},
            currentOrder: null,
            cart: [],
            orders: state.orders.map((order) => ({ ...order, tableId: undefined, tableName: undefined })),
            auditLogs: audit('Deleted floors and tables'),
          }
        }
        if (section === 'kitchenStations') {
          return {
            stations: defaultStations(state.outlet.id),
            menuItems: state.menuItems.map((item) => ({ ...item, stationId: undefined })),
            auditLogs: audit('Reset kitchen stations and removed item station assignments'),
          }
        }
        if (section === 'inventory') {
          return {
            inventoryItems: [],
            purchaseEntries: [],
            menuItems: state.menuItems.map((item) => ({ ...item, recipeItems: [] })),
            auditLogs: audit('Deleted inventory, purchase entries, and cleared menu recipes'),
          }
        }
        if (section === 'auditLogs') {
          return { auditLogs: [] }
        }

        return {
          menuCategories: [],
          menuItems: [],
          floors: [],
          tables: [],
          stations: defaultStations(state.outlet.id),
          inventoryItems: [],
          purchaseEntries: [],
          orders: [],
          orderItems: [],
          kots: [],
          payments: [],
          auditLogs: audit('Deleted all business data'),
          currentOrder: null,
          cart: [],
          savedCarts: {},
          selectedTableId: null,
        }
      }),

      addCategory: (name, color = '#2563EB', settings = {}) => set((state) => ({
        menuCategories: [...state.menuCategories, {
          ...settings,
          id: newId('cat'),
          outletId: state.outlet.id,
          name,
          color,
          sortOrder: state.menuCategories.length,
          isActive: true,
        }],
        auditLogs: addAudit(state, 'menu.category.created', 'menu_category', `Created category ${name}`),
      })),

      updateCategory: (id, updates) => set((state) => ({
        menuCategories: state.menuCategories.map((category) => category.id === id ? { ...category, ...updates } : category),
        auditLogs: addAudit(state, 'menu.category.updated', 'menu_category', 'Updated menu category', id),
      })),

      deleteCategory: (id) => {
        const hasItems = get().menuItems.some((item) => item.categoryId === id)
        if (hasItems) return false
        set((state) => ({
          menuCategories: state.menuCategories.filter((category) => category.id !== id),
          auditLogs: addAudit(state, 'menu.category.deleted', 'menu_category', 'Deleted menu category', id),
        }))
        return true
      },

      addMenuItem: (item) => set((state) => {
        const menuItem = {
          ...item,
          id: newId('itm'),
          outletId: state.outlet.id,
          sortOrder: state.menuItems.length,
        }
        const menuItems = [menuItem, ...state.menuItems]
        return {
          menuItems,
          inventoryItems: ensureMenuInventoryItems(state.inventoryItems, menuItems, state.outlet.id),
          auditLogs: addAudit(state, 'menu.item.created', 'menu_item', `Created item ${item.name}`),
        }
      }),

      updateMenuItem: (id, updates) => set((state) => {
        const previous = state.menuItems.find((item) => item.id === id)
        const menuItems = state.menuItems.map((item) => item.id === id ? { ...item, ...updates } : item)
        const inventoryItems = state.inventoryItems.map((item) => {
          const belongsToMenuItem = item.menuItemId === id || (previous && !item.menuItemId && item.name.trim().toLowerCase() === previous.name.trim().toLowerCase())
          if (!belongsToMenuItem) return item
          const nextMenuItem = menuItems.find((menuItem) => menuItem.id === id)
          if (!nextMenuItem) return item
          return {
            ...item,
            menuItemId: id,
            name: nextMenuItem.name,
            unit: item.currentStock === 0 ? (nextMenuItem.primaryUnit ?? item.unit) : item.unit,
            minimumStock: item.minimumStock || nextMenuItem.minimumStock || 0,
            costPerUnit: item.costPerUnit || nextMenuItem.costPricePaise || 0,
          }
        })
        return {
          menuItems,
          inventoryItems: ensureMenuInventoryItems(inventoryItems, menuItems, state.outlet.id),
          auditLogs: addAudit(state, 'menu.item.updated', 'menu_item', 'Updated menu item', id),
        }
      }),

      deleteMenuItem: (id) => set((state) => ({
        menuItems: state.menuItems.filter((item) => item.id !== id),
        auditLogs: addAudit(state, 'menu.item.deleted', 'menu_item', 'Deleted menu item', id),
      })),

      addStation: (name, settings = {}) => {
        const station: Station = {
          id: newId('stn'),
          outletId: get().outlet.id,
          name: name.trim(),
          appIp: settings.appIp?.trim() || undefined,
          printerTarget: settings.printerTarget?.trim() || undefined,
        }
        set((state) => ({
          stations: [...state.stations, station],
          auditLogs: addAudit(state, 'station.created', 'station', `Created kitchen station ${station.name}`, station.id),
        }))
        return station
      },

      updateStation: (id, updates) => set((state) => ({
        stations: state.stations.map((station) => station.id === id ? { ...station, ...updates, name: updates.name?.trim() ?? station.name } : station),
        auditLogs: addAudit(state, 'station.updated', 'station', 'Updated kitchen station', id),
      })),

      deleteStation: (id) => {
        const isUsed = get().menuItems.some((item) => item.stationId === id)
        if (isUsed) return false
        set((state) => ({
          stations: state.stations.filter((station) => station.id !== id),
          auditLogs: addAudit(state, 'station.deleted', 'station', 'Deleted kitchen station', id),
        }))
        return true
      },

      addFloor: (name) => set((state) => ({
        floors: [...state.floors, {
          id: newId('fl'),
          outletId: state.outlet.id,
          name,
          sortOrder: state.floors.length,
          isActive: true,
        }],
        auditLogs: addAudit(state, 'floor.created', 'floor', `Created floor ${name}`),
      })),

      updateFloor: (id, updates) => set((state) => ({
        floors: state.floors.map((floor) => floor.id === id ? { ...floor, ...updates } : floor),
        auditLogs: addAudit(state, 'floor.updated', 'floor', 'Updated floor', id),
      })),

      deleteFloor: (id) => {
        const hasTables = get().tables.some((table) => table.floorId === id)
        if (hasTables) return false
        set((state) => ({
          floors: state.floors.filter((floor) => floor.id !== id),
          auditLogs: addAudit(state, 'floor.deleted', 'floor', 'Deleted floor', id),
        }))
        return true
      },

      addTable: ({ floorId, name, seats }) => set((state) => ({
        tables: [...state.tables, {
          id: newId('tbl'),
          outletId: state.outlet.id,
          floorId,
          name,
          seats,
          status: 'available',
          sortOrder: state.tables.length,
        }],
        auditLogs: addAudit(state, 'table.created', 'restaurant_table', `Created table ${name}`),
      })),

      updateTable: (id, updates) => set((state) => ({
        tables: state.tables.map((table) => table.id === id ? { ...table, ...updates } : table),
        auditLogs: addAudit(state, 'table.updated', 'restaurant_table', 'Updated table', id),
      })),

      deleteTable: (id) => {
        const table = get().tables.find((candidate) => candidate.id === id)
        if (table?.activeOrderId) return false
        set((state) => ({
          tables: state.tables.filter((candidate) => candidate.id !== id),
          auditLogs: addAudit(state, 'table.deleted', 'restaurant_table', 'Deleted table', id),
        }))
        return true
      },

      updateTableStatus: (tableId, updates) => {
        set((state) => ({
          tables: state.tables.map((table) => table.id === tableId ? { ...table, ...updates } : table),
        }))
        realtimeClient.broadcast('TABLE_STATUS_UPDATED', { tableId, updates })
      },

      // Transfer order from one table to another (target must be available)
      transferTable: (fromTableId, toTableId) => {
        const state = get()
        const fromTable = state.tables.find(t => t.id === fromTableId)
        const toTable = state.tables.find(t => t.id === toTableId)
        if (!fromTable?.activeOrderId || !toTable || toTable.status !== 'available') return false
        const orderId = fromTable.activeOrderId
        set(s => ({
          tables: s.tables.map(t => {
            if (t.id === fromTableId) return { ...t, status: 'available' as TableStatus, activeOrderId: undefined }
            if (t.id === toTableId) return { ...t, status: fromTable.status, activeOrderId: orderId }
            return t
          }),
          orders: s.orders.map(o => o.id === orderId ? { ...o, tableId: toTableId, tableName: toTable.name, updatedAt: now() } : o),
          kots: s.kots.map(k => k.orderId === orderId ? { ...k, tableName: toTable.name } : k),
          currentOrder: s.currentOrder?.id === orderId ? { ...s.currentOrder, tableId: toTableId, tableName: toTable.name, updatedAt: now() } : s.currentOrder,
          selectedTableId: s.selectedTableId === fromTableId ? toTableId : s.selectedTableId,
          auditLogs: addAudit(s, 'table.transferred', 'restaurant_table', `Transferred order from ${fromTable.name} to ${toTable.name}`, orderId),
        }))
        realtimeClient.broadcast('TABLE_STATUS_UPDATED', { tableId: fromTableId, updates: { status: 'available' } })
        realtimeClient.broadcast('TABLE_STATUS_UPDATED', { tableId: toTableId, updates: { status: fromTable.status } })
        return true
      },

      transferKOTs: (sourceTableId, targetTableId, kotIds) => {
        const state = get()
        const sourceTable = state.tables.find(t => t.id === sourceTableId)
        const targetTable = state.tables.find(t => t.id === targetTableId)
        
        if (!sourceTable?.activeOrderId || !targetTable || kotIds.length === 0) return false

        const sourceOrderId = sourceTable.activeOrderId
        let targetOrderId = targetTable.activeOrderId
        let isNewOrder = false

        let newOrders = [...state.orders]

        if (!targetOrderId) {
          isNewOrder = true
          targetOrderId = newId('ord')
          const sourceOrder = state.orders.find(o => o.id === sourceOrderId)
          if (!sourceOrder) return false

          newOrders.push({
            ...sourceOrder,
            id: targetOrderId,
            tableId: targetTable.id,
            tableName: targetTable.name,
            orderNo: `ORD-${String(state.orders.length + 1).padStart(4, '0')}`,
            subtotalPaise: 0,
            discountPaise: 0,
            taxPaise: 0,
            totalPaise: 0,
            createdAt: now(),
            updatedAt: now()
          })
        }

        // Identify order items to move by looking at the KOT items
        const transferredKots = state.kots.filter(k => kotIds.includes(k.id))
        const itemIdsToMove = new Set<string>()
        transferredKots.forEach(k => {
          k.items.forEach(ki => itemIdsToMove.add(ki.orderItemId))
        })

        // Update KOTs and OrderItems
        const updatedKots = state.kots.map(k => {
          if (kotIds.includes(k.id)) {
            return { ...k, orderId: targetOrderId, tableName: targetTable.name }
          }
          return k
        })

        const updatedOrderItems = state.orderItems.map(oi => {
          if (itemIdsToMove.has(oi.id)) {
            return { ...oi, orderId: targetOrderId, tableName: targetTable.name }
          }
          return oi
        })

        // Recalculate totals for source and target orders
        const recalcTotals = (items: OrderItem[]) => {
          const subtotalPaise = items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
          const discountPaise = items.reduce((sum, item) => sum + item.discountPaise, 0)
          const taxPaise = items.reduce((sum, item) => sum + item.taxPaise, 0)
          const totalPaise = subtotalPaise - discountPaise + taxPaise
          return { subtotalPaise, discountPaise, taxPaise, totalPaise }
        }

        const sourceRemainingItems = updatedOrderItems.filter(oi => oi.orderId === sourceOrderId && oi.status !== 'cancelled')
        const targetAllItems = updatedOrderItems.filter(oi => oi.orderId === targetOrderId && oi.status !== 'cancelled')

        const sourceTotals = recalcTotals(sourceRemainingItems)
        const targetTotals = recalcTotals(targetAllItems)

        const sourceActiveKOTsCount = updatedKots.filter(k => k.orderId === sourceOrderId && k.status !== 'cancelled').length

        set(s => {
          const finalOrders = newOrders.map(o => {
            if (o.id === sourceOrderId) {
              return { ...o, ...sourceTotals, updatedAt: now() }
            }
            if (o.id === targetOrderId) {
              return { ...o, ...targetTotals, updatedAt: now() }
            }
            return o
          }).filter(o => {
            // Remove source order if it has no items/KOTs left
            if (o.id === sourceOrderId && sourceActiveKOTsCount === 0) return false
            return true
          })

          const finalTables = s.tables.map(t => {
            if (t.id === sourceTableId && sourceActiveKOTsCount === 0) {
              return { ...t, status: 'available' as TableStatus, activeOrderId: undefined }
            }
            if (t.id === targetTableId && isNewOrder) {
              return { ...t, status: 'occupied' as TableStatus, activeOrderId: targetOrderId }
            }
            return t
          })

          return {
            kots: updatedKots,
            orderItems: updatedOrderItems,
            orders: finalOrders,
            tables: finalTables,
            currentOrder: s.currentOrder?.id === sourceOrderId ? 
              (sourceActiveKOTsCount === 0 ? null : finalOrders.find(o => o.id === sourceOrderId)) : 
              s.currentOrder,
            selectedTableId: s.selectedTableId === sourceTableId && sourceActiveKOTsCount === 0 ? null : s.selectedTableId,
            auditLogs: addAudit(s, 'kot.transferred', 'kot', `Transferred ${kotIds.length} KOTs to ${targetTable.name}`, sourceOrderId)
          }
        })
        
        realtimeClient.broadcast('KOTS_TRANSFERRED', { sourceTableId, targetTableId, kotIds })
        return true
      },

      // Merge source table's order items into target table's order
      mergeTable: (sourceTableId, targetTableId) => {
        const state = get()
        const sourceTable = state.tables.find(t => t.id === sourceTableId)
        const targetTable = state.tables.find(t => t.id === targetTableId)
        if (!sourceTable?.activeOrderId || !targetTable?.activeOrderId) return false
        if (sourceTable.activeOrderId === targetTable.activeOrderId) return false
        const sourceOrderId = sourceTable.activeOrderId
        const targetOrderId = targetTable.activeOrderId
        // Move all order items from source to target
        set(s => ({
          orderItems: s.orderItems.map(oi => oi.orderId === sourceOrderId ? { ...oi, orderId: targetOrderId } : oi),
          kots: s.kots.map(k => k.orderId === sourceOrderId ? { ...k, orderId: targetOrderId, tableName: targetTable.name } : k),
          orders: s.orders.filter(o => o.id !== sourceOrderId),
          tables: s.tables.map(t => {
            if (t.id === sourceTableId) return { ...t, status: 'available' as TableStatus, activeOrderId: undefined }
            return t
          }),
          currentOrder: s.currentOrder?.id === sourceOrderId ? null : s.currentOrder,
          selectedTableId: s.selectedTableId === sourceTableId ? null : s.selectedTableId,
          auditLogs: addAudit(s, 'table.merged', 'restaurant_table', `Merged ${sourceTable.name} into ${targetTable.name}`, targetOrderId),
        }))
        return true
      },

      updateTableSeats: (tableId, seats) => set(s => ({
        tables: s.tables.map(t => t.id === tableId ? { ...t, seats } : t),
      })),


      addInventoryItem: (input) => set((state) => ({
        inventoryItems: [{
          ...input,
          id: newId('inv'),
          outletId: state.outlet.id,
          lastUpdatedAt: now(),
        }, ...state.inventoryItems],
        auditLogs: addAudit(state, 'inventory.item.created', 'inventory_item', `Created stock item ${input.name}`),
      })),



      updateInventoryItem: (id, updates) => set((state) => ({
        inventoryItems: state.inventoryItems.map((item) => item.id === id ? { ...item, ...updates, lastUpdatedAt: now() } : item),
        auditLogs: addAudit(state, 'inventory.item.updated', 'inventory_item', 'Updated inventory item', id),
      })),

      deleteInventoryItem: (id) => set((state) => ({
        inventoryItems: state.inventoryItems.filter((item) => item.id !== id),
        auditLogs: addAudit(state, 'inventory.item.deleted', 'inventory_item', 'Deleted inventory item', id),
      })),

      adjustInventory: (id, delta) => set((state) => ({
        inventoryItems: state.inventoryItems.map((item) => item.id === id ? { ...item, currentStock: Math.max(0, item.currentStock + delta), lastUpdatedAt: now() } : item),
        auditLogs: addAudit(state, 'inventory.stock.adjusted', 'inventory_item', `Adjusted stock by ${delta}`, id),
      })),

      addPurchaseEntry: (input) => {
        const createdAt = now()
        const existingInventory = input.inventoryItemId ? get().inventoryItems.find((item) => item.id === input.inventoryItemId) : undefined
        const inventoryItemId = existingInventory?.id ?? newId('inv')
        const entry: PurchaseEntry = {
          ...input,
          id: newId('pur'),
          outletId: get().outlet.id,
          inventoryItemId,
          createdAt,
          updatedAt: createdAt,
        }
        set((state) => ({
          purchaseEntries: [entry, ...state.purchaseEntries],
          inventoryItems: existingInventory
            ? state.inventoryItems.map((item) => item.id === entry.inventoryItemId
              ? {
                  ...item,
                  currentStock: Math.max(0, item.currentStock + entry.stockQuantity),
                  costPerUnit: entry.stockQuantity > 0 ? Math.round(entry.totalPaise / entry.stockQuantity) : item.costPerUnit,
                  supplier: entry.supplier || item.supplier,
                  minimumStock: input.minimumStock ?? item.minimumStock,
                  lastUpdatedAt: createdAt,
                }
              : item)
            : [{
                id: inventoryItemId,
                outletId: state.outlet.id,
                name: entry.itemName,
                unit: entry.unit,
                currentStock: entry.stockQuantity,
                minimumStock: input.minimumStock ?? 0,
                costPerUnit: entry.stockQuantity > 0 ? Math.round(entry.totalPaise / entry.stockQuantity) : entry.ratePaise,
                supplier: entry.supplier,
                lastUpdatedAt: createdAt,
              }, ...state.inventoryItems],
          auditLogs: addAudit(state, 'inventory.purchase.created', 'purchase_entry', `Added purchase ${entry.itemName}`, entry.id),
        }))
        return entry
      },

      updatePurchaseEntry: (id, updates) => set((state) => {
        const previous = state.purchaseEntries.find((entry) => entry.id === id)
        if (!previous) return {}
        const changedAt = now()
        const next: PurchaseEntry = { ...previous, ...updates, updatedAt: changedAt }
        const inventoryItems = state.inventoryItems.map((item) => {
          let delta = 0
          if (item.id === previous.inventoryItemId) delta -= previous.stockQuantity
          if (item.id === next.inventoryItemId) delta += next.stockQuantity
          if (delta === 0) return item
          return {
            ...item,
            currentStock: Math.max(0, item.currentStock + delta),
            costPerUnit: item.id === next.inventoryItemId && next.stockQuantity > 0 ? Math.round(next.totalPaise / next.stockQuantity) : item.costPerUnit,
            supplier: item.id === next.inventoryItemId ? (next.supplier || item.supplier) : item.supplier,
            lastUpdatedAt: changedAt,
          }
        })
        return {
          purchaseEntries: state.purchaseEntries.map((entry) => entry.id === id ? next : entry),
          inventoryItems,
          auditLogs: addAudit(state, 'inventory.purchase.updated', 'purchase_entry', `Updated purchase ${next.itemName}`, id),
        }
      }),

      deletePurchaseEntry: (id) => set((state) => {
        const entry = state.purchaseEntries.find((candidate) => candidate.id === id)
        if (!entry) return {}
        const changedAt = now()
        return {
          purchaseEntries: state.purchaseEntries.filter((candidate) => candidate.id !== id),
          inventoryItems: state.inventoryItems.map((item) => item.id === entry.inventoryItemId
            ? { ...item, currentStock: Math.max(0, item.currentStock - entry.stockQuantity), lastUpdatedAt: changedAt }
            : item),
          auditLogs: addAudit(state, 'inventory.purchase.deleted', 'purchase_entry', `Deleted purchase ${entry.itemName}`, id),
        }
      }),

      setOrderType: (type) => set({ activeOrderType: type }),

      selectTable: (tableId) => {
        const state = get()
        if (state.selectedTableId === tableId && !state.tables.find(t => t.id === tableId)?.activeOrderId) {
          // Already on this table without an active order; preserve the cart
          return
        }
        const parkedSavedCarts = parkActiveCart(state)

        if (tableId) {
          const table = get().tables.find((candidate) => candidate.id === tableId)
          if (table?.activeOrderId) {
            const order = get().orders.find(o => o.id === table.activeOrderId)
            const savedCart = parkedSavedCarts[tableId] || []
            const savedItemCount = order ? get().orderItems.filter(item => item.orderId === order.id && item.status !== 'cancelled').length : 0
            if (!order || isClosedOrder(order) || (savedItemCount === 0 && savedCart.length === 0)) {
              // Orphaned/empty activeOrderId, clear it before opening billing.
              set((s) => ({
                tables: s.tables.map(t => t.id === tableId ? { ...t, status: 'available' as TableStatus, activeOrderId: undefined } : t),
                savedCarts: parkedSavedCarts,
                selectedTableId: tableId,
                currentOrder: null,
                cart: savedCart
              }))
            } else {
              set({ selectedTableId: tableId, savedCarts: parkedSavedCarts })
              get().loadOrder(table.activeOrderId)
            }
          } else {
            // Restore unsaved cart if it exists
            const savedCart = parkedSavedCarts[tableId] || []
            set({ selectedTableId: tableId, currentOrder: null, cart: savedCart, savedCarts: parkedSavedCarts })
          }
        } else {
          set({ selectedTableId: null, currentOrder: null, cart: [], savedCarts: parkedSavedCarts })
        }
      },

      startNewOrder: (userId, userName) => {
        const state = get()
        const table = state.selectedTableId ? state.tables.find((candidate) => candidate.id === state.selectedTableId) : undefined
        const order: Order = {
          id: newId('ord'),
          outletId: state.outlet.id,
          orderNo: orderNo(state.orders),
          businessDate: today(),
          type: state.activeOrderType,
          status: 'running',
          tableId: table?.id,
          tableName: table?.name,
          cashierUserId: userId,
          cashierName: userName,
          subtotalPaise: 0,
          discountPaise: 0,
          taxPaise: 0,
          chargePaise: 0,
          totalPaise: 0,
          paidPaise: 0,
          paymentStatus: 'unpaid',
          createdAt: now(),
          updatedAt: now(),
        }
        set((current) => ({
          orders: [order, ...current.orders],
          currentOrder: order,
          cart: [],
          tables: order.tableId ? current.tables.map((candidate) => candidate.id === order.tableId ? { ...candidate, status: 'occupied', activeOrderId: order.id } : candidate) : current.tables,
          auditLogs: addAudit(current, 'order.created', 'order', `Created ${order.orderNo}`, order.id),
        }))
      },

      loadOrder: (orderId) => {
        const order = get().orders.find((candidate) => candidate.id === orderId)
        if (!order) return
        // Restore unsaved cart items if any exist for this table, otherwise keep draft empty
        const savedCart = order.tableId ? get().savedCarts[order.tableId] || [] : []
        set({ currentOrder: order, cart: savedCart, selectedTableId: order.tableId ?? null })
      },

      addToCart: (item, options) => {
        if (!isSaleableMenuItem(item)) {
          useUIStore.getState().addToast('warning', `${item.name} is not enabled for sales billing`)
          return
        }
        set((state) => {
          let workingState = state
          if (!workingState.currentOrder) {
            const table = workingState.selectedTableId ? workingState.tables.find((candidate) => candidate.id === workingState.selectedTableId) : undefined
            const order: Order = {
              id: newId('ord'),
              outletId: workingState.outlet.id,
              orderNo: orderNo(workingState.orders),
              businessDate: today(),
              type: workingState.activeOrderType,
              status: 'running',
              tableId: table?.id,
              tableName: table?.name,
              cashierUserId: 'system',
              cashierName: 'Operator',
              subtotalPaise: 0,
              discountPaise: 0,
              taxPaise: 0,
              chargePaise: 0,
              totalPaise: 0,
              paidPaise: 0,
              paymentStatus: 'unpaid',
              createdAt: now(),
              updatedAt: now(),
            }
            workingState = {
              ...workingState,
              orders: [order, ...workingState.orders],
              currentOrder: order,
              tables: order.tableId
                ? workingState.tables.map((candidate) => candidate.id === order.tableId ? { ...candidate, status: 'occupied' as TableStatus, activeOrderId: order.id } : candidate)
                : workingState.tables,
              auditLogs: addAudit(workingState, 'order.created', 'order', `Created ${order.orderNo}`, order.id),
            }
          }
          const existing = workingState.cart.find((cartItem) => cartItem.menuItemId === item.id)
          const modifiers = options?.modifiers ?? []
          const modifierTotal = modifiers.reduce((sum, modifier) => sum + modifier.pricePaise, 0)
          const categoryRule = effectiveCategoryRule(workingState.menuCategories, item.categoryId)
          const category = workingState.menuCategories.find((candidate) => candidate.id === item.categoryId)
          const parentCategory = category?.parentId ? workingState.menuCategories.find((candidate) => candidate.id === category.parentId) : undefined
          const categoryDiscountPercent = Math.max(0, categoryRule.discountPercent ?? 0)
          const unitPricePaise = item.pricePaise + modifierTotal
          const discountPaise = categoryDiscountPercent > 0 ? Math.round(unitPricePaise * categoryDiscountPercent / 100) : 0
          const newCart = existing
              ? workingState.cart.map((cartItem) => cartItem.menuItemId === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem)
              : [...workingState.cart, {
                menuItemId: item.id,
                name: item.name,
                itemType: item.itemType,
                isSeparateBill: isSeparateBillCategory(category, parentCategory),
                quantity: 1,
                basePricePaise: item.pricePaise,
                unitPricePaise,
                taxPercent: categoryRule.taxPercent ?? item.taxPercent,
                taxType: categoryRule.taxType ?? item.taxType,
                stationId: item.stationId,
                note: options?.note,
                modifiers: modifiers.map((modifier) => modifier.pricePaise > 0 ? `${modifier.name} (+${modifier.pricePaise / 100})` : modifier.name),
                discountPaise,
              }]
          return { ...workingState, ...syncCart(workingState, newCart) }
        })
      },

      removeFromCart: (menuItemId) => set((state) => {
        const newCart = state.cart.filter((item) => item.menuItemId !== menuItemId)
        return syncCart(state, newCart)
      }),

      updateQty: (menuItemId, delta) => set((state) => {
        const newCart = state.cart
          .map((item) => item.menuItemId === menuItemId ? { ...item, quantity: item.quantity + delta } : item)
          .filter((item) => item.quantity > 0)
        return syncCart(state, newCart)
      }),

      setItemNote: (menuItemId, note) => set((state) => {
        const newCart = state.cart.map((item) => item.menuItemId === menuItemId ? { ...item, note } : item)
        return syncCart(state, newCart)
      }),

      setItemPrice: (menuItemId, unitPricePaise) => set((state) => {
        const newCart = state.cart.map((item) => item.menuItemId === menuItemId
          ? { ...item, unitPricePaise: Math.max(0, Math.round(unitPricePaise)) }
          : item)
        return syncCart(state, newCart)
      }),

      setItemModifiers: (menuItemId, modifiers) => set((state) => {
        const newCart = state.cart.map((item) => item.menuItemId === menuItemId
          ? {
              ...item,
              modifiers: modifiers.map((modifier) => modifier.pricePaise > 0 ? `${modifier.name} (+${modifier.pricePaise / 100})` : modifier.name),
              unitPricePaise: item.basePricePaise + modifiers.reduce((sum, modifier) => sum + modifier.pricePaise, 0),
            }
          : item)
        return syncCart(state, newCart)
      }),

      applyGlobalDiscount: (type, value, categoryIds) => set((state) => {
        let updatedOrders = state.orders
        let updatedOrderItems = state.orderItems

        const newCart = state.cart.map((item) => {
          const menuItem = state.menuItems.find((m) => m.id === item.menuItemId)
          if (!menuItem) return item

          const matchesCategory = categoryIds.length === 0 || categoryIds.includes('all') || categoryIds.includes(menuItem.categoryId)
          if (!matchesCategory) return item

          let discount = 0
          if (type === 'percentage') {
            const totalItemPrice = item.unitPricePaise * item.quantity
            discount = Math.round((totalItemPrice * value) / 100)
          } else if (type === 'amount') {
            discount = value * 100 * item.quantity
          }

          discount = Math.min(discount, item.unitPricePaise * item.quantity)
          return { ...item, discountPaise: discount }
        })

        if (state.currentOrder) {
          const orderId = state.currentOrder.id
          let orderTotalDiscount = 0
          let orderTotalPaise = 0

          updatedOrderItems = state.orderItems.map(item => {
            if (item.orderId !== orderId || item.status === 'cancelled') return item
            
            const menuItem = state.menuItems.find(m => m.id === item.menuItemId)
            const matchesCategory = categoryIds.length === 0 || categoryIds.includes('all') || (menuItem && categoryIds.includes(menuItem.categoryId))
            
            if (!matchesCategory) {
              orderTotalPaise += item.totalPaise
              orderTotalDiscount += item.discountPaise
              return item
            }

            let discount = 0
            if (type === 'percentage') {
              discount = Math.round((item.unitPricePaise * item.quantity * value) / 100)
            } else if (type === 'amount') {
              discount = value * 100 * item.quantity
            }

            discount = Math.min(discount, item.unitPricePaise * item.quantity)
            const newTotalPaise = (item.unitPricePaise * item.quantity) + item.taxPaise - discount
            orderTotalPaise += newTotalPaise
            orderTotalDiscount += discount
            return { ...item, discountPaise: discount, totalPaise: Math.max(0, newTotalPaise) }
          })

          updatedOrders = state.orders.map(o => {
            if (o.id === orderId) {
              const baseTotal = updatedOrderItems
                .filter(i => i.orderId === orderId && i.status !== 'cancelled')
                .reduce((sum, i) => sum + i.totalPaise, 0)
              
              const updatedCurrentOrder = {
                ...o,
                discountPaise: orderTotalDiscount,
                totalPaise: Math.max(0, baseTotal), // Note: settlePayment handles final global discount
                updatedAt: now()
              }
              if (state.currentOrder?.id === orderId) {
                // update currentOrder reference via zustand magic if we want
              }
              return updatedCurrentOrder
            }
            return o
          })
        }

        return {
          ...syncCart(state, newCart),
          orderItems: updatedOrderItems,
          orders: updatedOrders,
          currentOrder: state.currentOrder ? updatedOrders.find(o => o.id === state.currentOrder!.id) || state.currentOrder : state.currentOrder
        }
      }),

      applyDiscountToOrderItem: (orderItemId, type, value) => set((state) => {
        const orderItem = state.orderItems.find((candidate) => candidate.id === orderItemId)
        if (!orderItem || orderItem.status === 'cancelled') return state

        const order = state.orders.find((candidate) => candidate.id === orderItem.orderId)
        if (!order) return state

        let discount = 0
        if (type === 'percentage') {
          discount = Math.round((orderItem.unitPricePaise * orderItem.quantity * value) / 100)
        } else if (type === 'amount') {
          discount = value * 100 * orderItem.quantity
        }
        discount = Math.min(discount, orderItem.unitPricePaise * orderItem.quantity)

        const newTotalPaise = (orderItem.unitPricePaise * orderItem.quantity) + orderItem.taxPaise - discount

        const updatedOrderItems = state.orderItems.map(item =>
          item.id === orderItemId ? { ...item, discountPaise: discount, totalPaise: Math.max(0, newTotalPaise) } : item
        )

        const newOrderTotalDiscount = updatedOrderItems
          .filter(i => i.orderId === order.id && i.status !== 'cancelled')
          .reduce((sum, i) => sum + i.discountPaise, 0)

        const newOrderTotalPaise = updatedOrderItems
          .filter(i => i.orderId === order.id && i.status !== 'cancelled')
          .reduce((sum, i) => sum + i.totalPaise, 0)

        const updatedOrder = { ...order, discountPaise: newOrderTotalDiscount, totalPaise: newOrderTotalPaise, updatedAt: now() }

        return {
          orderItems: updatedOrderItems,
          orders: state.orders.map(o => o.id === order.id ? updatedOrder : o),
          currentOrder: state.currentOrder?.id === order.id ? updatedOrder : state.currentOrder
        }
      }),

      setOrderCustomer: (name, phone) => set((state) => {
        if (!state.currentOrder) return state
        const updatedOrder = { ...state.currentOrder, customerName: name.trim() || undefined, customerPhone: phone.trim() || undefined, updatedAt: now() }
        return {
          currentOrder: updatedOrder,
          orders: state.orders.map((order) => order.id === updatedOrder.id ? updatedOrder : order),
        }
      }),

      clearCart: () => set((state) => {
        const order = state.currentOrder
        const hasSavedItems = order ? state.orderItems.some((item) => item.orderId === order.id && item.status !== 'cancelled') : false
        
        let nextState: Partial<BillingStore> = {}
        if (order && !hasSavedItems) {
          nextState = {
            orders: state.orders.filter((candidate) => candidate.id !== order.id),
            kots: state.kots.filter((candidate) => candidate.orderId !== order.id),
            orderItems: state.orderItems.filter((candidate) => candidate.orderId !== order.id),
            tables: state.tables.map((table) => table.activeOrderId === order.id ? { ...table, status: 'available' as TableStatus, activeOrderId: undefined } : table),
            currentOrder: null,
            cart: [],
            selectedTableId: null,
          }
        } else {
          nextState = { currentOrder: null, cart: [], selectedTableId: null }
        }

        if (state.activeOrderType === 'dine_in' && state.selectedTableId) {
          const newSavedCarts = { ...state.savedCarts }
          delete newSavedCarts[state.selectedTableId]
          nextState.savedCarts = newSavedCarts
        }

        return nextState
      }),

      sendKOT: (userId, userName) => {
        const state = get()
        if (state.cart.length === 0) return null
        const table = state.selectedTableId ? state.tables.find((candidate) => candidate.id === state.selectedTableId) : undefined
        const totals = state.getCartTotal()
        const baseOrder = state.currentOrder ?? {
          id: newId('ord'),
          outletId: state.outlet.id,
          orderNo: orderNo(state.orders),
          businessDate: today(),
          type: state.activeOrderType,
          status: 'running' as const,
          tableId: table?.id,
          tableName: table?.name,
          cashierUserId: userId,
          cashierName: userName,
          subtotalPaise: 0,
          discountPaise: 0,
          taxPaise: 0,
          chargePaise: 0,
          totalPaise: 0,
          paidPaise: 0,
          paymentStatus: 'unpaid' as const,
          createdAt: now(),
          updatedAt: now(),
        }

        const createdItems = state.cart.map<OrderItem>((item) => {
          const subtotal = item.unitPricePaise * item.quantity
          const tax = calculateTax(subtotal - (item.discountPaise || 0), taxablePercent(item))
          return {
            id: newId('oi'),
            orderId: baseOrder.id,
            menuItemId: item.menuItemId,
            nameSnapshot: item.name,
            itemType: item.itemType,
            isSeparateBill: item.isSeparateBill,
            quantity: item.quantity,
            unitPricePaise: item.unitPricePaise,
            taxPercent: item.taxPercent,
            taxType: item.taxType,
            taxPaise: tax,
            discountPaise: item.discountPaise || 0,
            totalPaise: subtotal - (item.discountPaise || 0) + tax,
            stationId: item.stationId,
            status: 'kot_sent',
            note: item.note,
            modifiers: item.modifiers,
            createdAt: now(),
          }
        })

        const groupedItems = createdItems.reduce<Record<string, OrderItem[]>>((acc, item) => {
          const key = item.stationId || 'default'
          acc[key] ??= []
          acc[key].push(item)
          return acc
        }, {})
        const kotBaseNo = state.kots.length
        const kotsToCreate = Object.entries(groupedItems).map(([stationId, items], index) => {
          const kot: KOT = {
            id: newId('kot'),
            orderId: baseOrder.id,
            orderNo: baseOrder.orderNo,
            kotNo: `KOT-${String(kotBaseNo + index + 1).padStart(4, '0')}`,
            tableName: baseOrder.tableName,
            orderType: baseOrder.type,
            stationId: stationId === 'default' ? undefined : stationId,
            status: 'new',
            captainName: userName,
            createdByUserId: userId,
            createdAt: now(),
            items: items.map((item) => ({
              id: newId('ki'),
              kotId: '',
              orderItemId: item.id,
              name: item.nameSnapshot,
              quantity: item.quantity,
              note: item.note,
              modifiers: item.modifiers,
              status: 'new',
              itemType: item.itemType,
            })),
          }
          kot.items = kot.items.map((item) => ({ ...item, kotId: kot.id }))
          return kot
        })

        const previousItems = state.orderItems.filter((item) => item.orderId === baseOrder.id && item.status !== 'cancelled')
        const subtotalPaise = previousItems.reduce((sum, item) => sum + (item.unitPricePaise * item.quantity), 0) + totals.subtotal
        const discountPaise = previousItems.reduce((sum, item) => sum + item.discountPaise, 0) + state.cart.reduce((sum, item) => sum + (item.discountPaise || 0), 0)
        const taxPaise = previousItems.reduce((sum, item) => sum + item.taxPaise, 0) + totals.tax
        const updatedOrder: Order = {
          ...baseOrder,
          status: 'kot_sent',
          subtotalPaise,
          discountPaise,
          taxPaise,
          totalPaise: subtotalPaise + taxPaise + baseOrder.chargePaise - discountPaise,
          updatedAt: now(),
        }

        set((current) => {
          const newSavedCarts = { ...current.savedCarts }
          if (updatedOrder.tableId) {
            delete newSavedCarts[updatedOrder.tableId]
          }
          return {
            orders: current.orders.some((order) => order.id === updatedOrder.id)
              ? current.orders.map((order) => order.id === updatedOrder.id ? updatedOrder : order)
              : [updatedOrder, ...current.orders],
            orderItems: [...createdItems, ...current.orderItems],
            kots: [...kotsToCreate, ...current.kots],
            currentOrder: updatedOrder,
            cart: [],
            savedCarts: newSavedCarts,
            // Recipe stock is consumed once, when the order is fully paid.
            inventoryItems: current.inventoryItems,
            tables: updatedOrder.tableId ? current.tables.map((candidate) => candidate.id === updatedOrder.tableId ? { ...candidate, status: 'kot_sent', activeOrderId: updatedOrder.id } : candidate) : current.tables,
            auditLogs: addAudit(current, 'kot.sent', 'kot', `${kotsToCreate.length} KOT${kotsToCreate.length === 1 ? '' : 's'} sent to kitchen`, kotsToCreate[0]?.id),
          }
        })

        // Background granular sync
        const isNewOrder = !state.orders.some((o) => o.id === updatedOrder.id)
        if (isNewOrder) {
          createCloudOrder(updatedOrder, createdItems).catch(console.error)
        } else {
          // If updating an order, we send ALL items for that order to simplify the backend PUT logic
          const allItems = [...createdItems, ...state.orderItems.filter(i => i.orderId === updatedOrder.id)]
          updateCloudOrder(updatedOrder, allItems).catch(console.error)
        }
        kotsToCreate.forEach(kot => addCloudKOT(state.outlet.id, kot).catch(console.error))

        realtimeClient.broadcast('KOT_CREATED', { kot: kotsToCreate[0], kots: kotsToCreate, order: updatedOrder })
        if (state.printSettings.autoPrintKot || state.printSettings.directKotPrint || ['webusb', 'bridge'].includes(state.printSettings.connectionMode)) {
          if (state.printSettings.kotPrintMode === 'single' && kotsToCreate.length > 1) {
            const kotIds = kotsToCreate.map((kot) => kot.id)
            setTimeout(() => get().printKOT(kotIds[0], kotIds), 0)
          } else {
            kotsToCreate.forEach(kot => setTimeout(() => get().printKOT(kot.id), 0))
          }
        }
        return kotsToCreate[0] ?? null
      },

      addPayment: (orderId, paymentInput, userId) => {
        set((state) => {
          const targetOrder = state.orders.find(o => o.id === orderId)
          if (!targetOrder) return state

          const payment: Payment = {
            id: newId('pay'),
            orderId: orderId,
            method: paymentInput.method as PaymentMethod,
            amountPaise: paymentInput.amountPaise,
            referenceNo: paymentInput.referenceNo,
            status: 'success',
            collectedByUserId: userId,
            createdAt: now(),
          }

          const paymentsAfterAdd = [payment, ...state.payments]
          const newPaidPaise = getCollectedPaidPaise(paymentsAfterAdd, orderId)
          const cappedPaidPaise = Math.min(newPaidPaise, targetOrder.totalPaise)
          const newPaymentStatus = getPaymentStatus(targetOrder.totalPaise, cappedPaidPaise)
          const newOrderStatus: Order['status'] = targetOrder.status === 'cancelled'
            ? targetOrder.status
            : newPaymentStatus === 'paid' ? 'paid' : targetOrder.status === 'paid' ? 'billed' : targetOrder.status

          const updatedOrder = {
            ...targetOrder,
            paidPaise: cappedPaidPaise,
            paymentStatus: newPaymentStatus,
            status: newOrderStatus,
            closedAt: newPaymentStatus === 'paid' ? (targetOrder.closedAt ?? now()) : targetOrder.closedAt,
            updatedAt: now()
          }

          const shouldConsumeRecipes = newPaymentStatus === 'paid' && targetOrder.recipeConsumptionStatus !== 'consumed' && !hasRecipeConsumptionAudit(state, orderId)
          const orderItems = state.orderItems.filter(item => item.orderId === orderId)
          const consumedOrder = shouldConsumeRecipes ? {
            ...updatedOrder,
            recipeConsumptionStatus: 'consumed' as const,
            recipeConsumedAt: now(),
            recipeReversedAt: undefined,
          } : updatedOrder

          return {
            payments: paymentsAfterAdd,
            orders: state.orders.map(o => o.id === orderId ? consumedOrder : o),
            currentOrder: state.currentOrder?.id === orderId ? consumedOrder : state.currentOrder,
            inventoryItems: shouldConsumeRecipes ? applyRecipeStockDelta(state, orderItems, 'consume') : state.inventoryItems,
            auditLogs: addAudit(state, shouldConsumeRecipes ? 'recipe.stock.consumed' : 'payment.added', shouldConsumeRecipes ? 'inventory' : 'payment', shouldConsumeRecipes ? `Consumed recipes for paid order` : `Collected ${paymentInput.amountPaise / 100}`, orderId),
          }
        })

        const afterState = get()
        const targetOrder = afterState.orders.find(o => o.id === orderId)
        const payment = afterState.payments.find(p => p.orderId === orderId && p.amountPaise === paymentInput.amountPaise && p.method === paymentInput.method && p.collectedByUserId === userId)
        
        if (targetOrder && payment) {
          const items = afterState.orderItems.filter(i => i.orderId === orderId)
          updateCloudOrder(targetOrder, items).catch(console.error)
          addCloudPayment(afterState.outlet.id, payment).catch(console.error)
          realtimeClient.broadcast('PAYMENT_ADDED', { payment, order: targetOrder } as unknown as Record<string, unknown>)
        }
      },

      settlePayment: async (orderId, paymentInputs, discountPaise, userId, userName, printAfter) => {
        const state = get()
        let targetOrder = orderId ? state.orders.find((candidate) => candidate.id === orderId) : state.currentOrder
        let isDirectCheckout = false

        // Direct checkout from cart
        if (!targetOrder && state.cart.length > 0) {
          isDirectCheckout = true
          const table = state.selectedTableId ? state.tables.find((candidate) => candidate.id === state.selectedTableId) : undefined
          const totals = state.getCartTotal()
          
          targetOrder = {
            id: newId('ord'),
            outletId: state.outlet.id,
            orderNo: orderNo(state.orders),
            businessDate: today(),
            type: state.activeOrderType,
            status: 'running' as const,
            tableId: table?.id,
            tableName: table?.name,
            cashierUserId: userId,
            cashierName: userName,
            subtotalPaise: totals.subtotal,
            discountPaise: 0,
            taxPaise: totals.tax,
            chargePaise: 0,
            totalPaise: totals.total,
            paidPaise: 0,
            paymentStatus: 'unpaid' as const,
            createdAt: now(),
            updatedAt: now(),
          }
        }

        if (!targetOrder) return false
        const hasBillableItems = state.cart.length > 0 || state.orderItems.some((item) => item.orderId === targetOrder!.id && item.status !== 'cancelled')
        if (!hasBillableItems) return false

        const actualOrderId: string = targetOrder.id
        const existingPaymentIds = new Set(state.payments.map((payment) => payment.id))
        const totalPaid = paymentInputs.reduce((sum, payment) => sum + payment.amountPaise, 0)
        const totalCollected = paymentInputs
          .filter((payment) => isCollectedPayment(payment.method))
          .reduce((sum, payment) => sum + payment.amountPaise, 0)
        
        set((state) => {
          let finalTotalPaise = targetOrder!.totalPaise
          let finalSubtotalPaise = targetOrder!.subtotalPaise
          let finalTaxPaise = targetOrder!.taxPaise
          let finalOrderDiscount = targetOrder!.discountPaise + discountPaise

          let newOrderItems = state.orderItems
          let createdCheckoutItems: OrderItem[] = []

          if (state.cart.length > 0) {
            const createdItems = state.cart.map<OrderItem>((item) => ({
              id: newId('oi'),
              orderId: actualOrderId,
              menuItemId: item.menuItemId,
              nameSnapshot: item.name,
              itemType: item.itemType,
              isSeparateBill: item.isSeparateBill,
              quantity: item.quantity,
              unitPricePaise: item.unitPricePaise,
              taxPercent: item.taxPercent,
              taxType: item.taxType,
              taxPaise: calculateTax((item.unitPricePaise * item.quantity) - (item.discountPaise || 0), taxablePercent(item)),
              discountPaise: item.discountPaise || 0,
              totalPaise: (item.unitPricePaise * item.quantity) + calculateTax((item.unitPricePaise * item.quantity) - (item.discountPaise || 0), taxablePercent(item)) - (item.discountPaise || 0),
              stationId: item.stationId,
              status: 'served' as const,
              note: item.note,
              modifiers: item.modifiers,
              createdAt: now()
            }))
            createdCheckoutItems = createdItems
            newOrderItems = [...createdItems, ...newOrderItems]

            if (!isDirectCheckout) {
               const cartTotals = state.getCartTotal()
               finalSubtotalPaise += cartTotals.subtotal
               finalTaxPaise += cartTotals.tax
               finalOrderDiscount += cartTotals.discount
               finalTotalPaise += cartTotals.total
            }
          }

          finalTotalPaise = Math.max(0, finalTotalPaise - discountPaise)

          if (totalPaid < finalTotalPaise) return state
          
          const payments = paymentInputs.map<Payment>((payment) => ({
            id: newId('pay'),
            orderId: actualOrderId,
            method: payment.method as PaymentMethod,
            amountPaise: payment.amountPaise,
            referenceNo: payment.referenceNo,
            status: 'success',
            collectedByUserId: userId,
            createdAt: now(),
          }))
          
          const cappedCollectedPaise = Math.min(totalCollected, finalTotalPaise)
          const paymentStatus = getPaymentStatus(finalTotalPaise, cappedCollectedPaise)

          const updatedOrder: Order = {
            ...targetOrder!,
            subtotalPaise: finalSubtotalPaise,
            taxPaise: finalTaxPaise,
            discountPaise: finalOrderDiscount,
            totalPaise: finalTotalPaise,
            paidPaise: cappedCollectedPaise,
            paymentStatus,
            status: paymentStatus === 'paid' ? 'paid' : 'billed',
            closedAt: now(),
            updatedAt: now(),
          }

          const activeOrderItems = newOrderItems.filter(item => item.orderId === actualOrderId && item.status !== 'cancelled')
          const shouldConsumeRecipes = paymentStatus === 'paid' && targetOrder!.recipeConsumptionStatus !== 'consumed' && !hasRecipeConsumptionAudit(state, actualOrderId)
          const settledOrder: Order = shouldConsumeRecipes
            ? { ...updatedOrder, recipeConsumptionStatus: 'consumed', recipeConsumedAt: now(), recipeReversedAt: undefined }
            : updatedOrder

          const newSavedCarts = { ...state.savedCarts }
          if (targetOrder?.tableId) {
            delete newSavedCarts[targetOrder.tableId]
          }

          return {
            orders: isDirectCheckout ? [settledOrder, ...state.orders] : state.orders.map((candidate) => candidate.id === actualOrderId ? settledOrder : candidate),
            payments: [...payments, ...state.payments],
            kots: state.kots.map((kot) => kot.orderId === actualOrderId ? {
              ...kot,
              status: 'served' as const,
              items: kot.items.map((item) => ({ ...item, status: 'served' as const })),
            } : kot),
            orderItems: newOrderItems.map((item) => item.orderId === actualOrderId && item.status !== 'cancelled'
              ? { ...item, status: 'served' as const }
              : item),
            // Clear the table by both links. The activeOrderId is normally enough,
            // but older/imported snapshots can retain the table link without the
            // matching activeOrderId. A paid order must never reopen from either
            // stale reference.
            tables: state.tables.map((table) => table.activeOrderId === actualOrderId || table.id === targetOrder!.tableId ? {
              ...table,
              status: state.outlet.enableDirtyTableStatus === false ? 'available' as TableStatus : 'dirty' as TableStatus,
              activeOrderId: undefined,
            } : table),
            currentOrder: null,
            cart: [],
            savedCarts: newSavedCarts,
            selectedTableId: null,
            inventoryItems: shouldConsumeRecipes ? applyRecipeStockDelta(state, activeOrderItems, 'consume') : state.inventoryItems,
            auditLogs: addAudit(state, shouldConsumeRecipes ? 'recipe.stock.consumed' : 'payment.settled', shouldConsumeRecipes ? 'inventory' : 'payment', shouldConsumeRecipes ? `Consumed recipes for paid order` : `Collected ${totalPaid / 100}`, actualOrderId),
          }
        })

        const afterSettle = get()
        const order = afterSettle.orders.find(o => o.id === actualOrderId)
        if (!order || !isClosedOrder(order)) return false

        const cloudWrites: Promise<unknown>[] = []
        if (order) {
          const items = afterSettle.orderItems.filter(i => i.orderId === actualOrderId)
          if (isDirectCheckout) {
            cloudWrites.push(createCloudOrder(order, items))
          } else {
            cloudWrites.push(updateCloudOrder(order, items))
          }
          
          // Sync all the new payments for this settlement
          const newPayments = afterSettle.payments.filter((payment) => payment.orderId === actualOrderId && !existingPaymentIds.has(payment.id))
          newPayments.forEach(p => {
            cloudWrites.push(addCloudPayment(afterSettle.outlet.id, p))
            realtimeClient.broadcast('PAYMENT_ADDED', { payment: p, order } as unknown as Record<string, unknown>)
          })
        }

        realtimeClient.broadcast('PAYMENT_SETTLED', { orderId: actualOrderId, paidPaise: totalCollected })
        const completedSnapshot = afterSettle.exportSnapshot()
        const durableWrites: Promise<unknown>[] = [...cloudWrites]
        if (isTauriDesktop()) {
          durableWrites.push(saveDesktopState(completedSnapshot, useStaffStore.getState().staff))
        }

        const cloud = afterSettle.cloudSync
        if (cloud.enabled && cloud.serverUrl && cloud.outletId && cloud.accountLogin && cloud.accountSecret) {
          durableWrites.push(
            saveCloudSnapshot(
              cloud.outletId,
              cloud.tenantId || afterSettle.outlet.tenantId,
              completedSnapshot,
              realtimeClient.getClientId(),
              cloud.serverUrl,
              { accountLogin: cloud.accountLogin, accountSecret: cloud.accountSecret },
            ).then((result) => {
              get().updateCloudSyncSettings({
                lastSyncedAt: result.updatedAt,
                lastCloudUploadedAt: result.updatedAt,
              })
            }),
          )
        }

        const writeResults = await Promise.allSettled(durableWrites)
        const failedWrites = writeResults.filter((result) => result.status === 'rejected')
        if (failedWrites.length > 0) {
          failedWrites.forEach((result) => {
            if (result.status === 'rejected') console.error('Checkout persistence failed', result.reason)
          })
          useUIStore.getState().addToast(
            'error',
            'Checkout is saved on this device, but one background sync failed and will retry on the next sync.',
            'Sync Warning',
          )
        }
        if (printAfter ?? (get().printSettings.autoPrintReceipt || get().printSettings.directReceiptPrint)) setTimeout(() => get().printReceipt(actualOrderId), 0)
        return true
      },

      cancelPayments: (orderId) => set((state) => {
        const order = state.orders.find(o => o.id === orderId)
        if (!order || order.paidPaise === 0) return state

        const changedAt = now()
        const updatedOrder = {
          ...order,
          paidPaise: 0,
          paymentStatus: 'unpaid' as const,
          status: order.status === 'paid' ? 'billed' : order.status,
          updatedAt: changedAt
        }

        return {
          payments: state.payments.map(payment => payment.orderId === orderId && payment.status === 'success'
            ? { ...payment, status: 'refunded' as const, statusReason: 'Payments cancelled by user' }
            : payment),
          orders: state.orders.map(o => o.id === orderId ? updatedOrder : o),
          currentOrder: state.currentOrder?.id === orderId ? updatedOrder : state.currentOrder,
          auditLogs: addAudit(state, 'payments.cancelled', 'payment', `Cancelled all payments`, orderId),
        }
      }),

      cancelOrder: (orderId, reason) => {
        set((state) => {
        const cancelledAt = now()
        
        const newSavedCarts = { ...state.savedCarts }
        const targetOrder = state.orders.find(o => o.id === orderId)
        const shouldRestoreRecipes = targetOrder?.recipeConsumptionStatus === 'consumed' || (Boolean(targetOrder) && hasRecipeConsumptionAudit(state, orderId) && !hasRecipeReversalAudit(state, orderId))
        const orderItemsBeforeCancellation = state.orderItems.filter(item => item.orderId === orderId && item.status !== 'cancelled')
        const restoredOrder = targetOrder ? {
          ...targetOrder,
          status: 'cancelled' as const,
          paymentStatus: targetOrder.paymentStatus === 'paid' ? 'unpaid' as const : targetOrder.paymentStatus,
          paidPaise: targetOrder.paymentStatus === 'paid' ? 0 : targetOrder.paidPaise,
          cancellationReason: reason,
          cancelledAt,
          updatedAt: cancelledAt,
          recipeConsumptionStatus: shouldRestoreRecipes ? 'reversed' as const : targetOrder.recipeConsumptionStatus,
          recipeReversedAt: shouldRestoreRecipes ? cancelledAt : targetOrder.recipeReversedAt,
        } : undefined
        if (targetOrder?.tableId) {
          delete newSavedCarts[targetOrder.tableId]
        }

        return {
          orders: state.orders.map((order) => order.id === orderId && restoredOrder ? restoredOrder : order),
          payments: state.payments.map((payment) => payment.orderId === orderId && payment.status === 'success'
            ? { ...payment, status: 'refunded' as const, statusReason: `Order cancelled: ${reason}` }
            : payment),
          kots: state.kots.map((kot) => kot.orderId === orderId && kot.status !== 'cancelled'
            ? { ...kot, status: 'cancelled' as const, cancellationReason: reason, cancelledAt, items: kot.items.map((item) => ({ ...item, status: 'cancelled' as const })) }
            : kot),
          orderItems: state.orderItems.map((item) => item.orderId === orderId ? { ...item, status: 'cancelled' as const } : item),
          tables: state.tables.map((table) => table.activeOrderId === orderId ? { ...table, status: 'available' as TableStatus, activeOrderId: undefined } : table),
          currentOrder: state.currentOrder?.id === orderId ? null : state.currentOrder,
          cart: state.currentOrder?.id === orderId ? [] : state.cart,
          savedCarts: newSavedCarts,
          selectedTableId: state.currentOrder?.id === orderId ? null : state.selectedTableId,
          inventoryItems: shouldRestoreRecipes ? applyRecipeStockDelta(state, orderItemsBeforeCancellation, 'restore') : state.inventoryItems,
          auditLogs: addAudit(state, shouldRestoreRecipes ? 'recipe.stock.restored' : 'order.cancelled', shouldRestoreRecipes ? 'inventory' : 'order', shouldRestoreRecipes ? `Restored recipes after order cancellation: ${reason}` : reason, orderId),
        }
      })

        const state = get()
        const updatedOrder = state.orders.find(o => o.id === orderId)
        if (updatedOrder) {
          const items = state.orderItems.filter(i => i.orderId === orderId)
          updateCloudOrder(updatedOrder, items).catch(console.error)
          realtimeClient.broadcast('ORDER_UPDATED', updatedOrder as unknown as Record<string, unknown>)
        }
      },

      updateOrderGlobalDiscount: (orderId, type, value) => set((state) => {
        const order = state.orders.find(o => o.id === orderId)
        if (!order || order.status === 'cancelled') return state
        
        let orderTotalPaise = 0
        let orderTotalDiscount = 0

        const updatedOrderItems = state.orderItems.map(item => {
          if (item.orderId !== orderId || item.status === 'cancelled') return item
          
          let discount = 0
          if (type === 'percentage') {
            discount = Math.round((item.unitPricePaise * item.quantity * value) / 100)
          } else if (type === 'amount') {
            discount = value * 100 * item.quantity
          }

          discount = Math.min(discount, item.unitPricePaise * item.quantity)
          const newTotalPaise = (item.unitPricePaise * item.quantity) + item.taxPaise - discount
          orderTotalPaise += newTotalPaise
          orderTotalDiscount += discount
          return { ...item, discountPaise: discount, totalPaise: Math.max(0, newTotalPaise) }
        })

        const baseTotal = updatedOrderItems
          .filter(i => i.orderId === orderId && i.status !== 'cancelled')
          .reduce((sum, i) => sum + i.totalPaise, 0)

        const updatedOrder = {
          ...order,
          discountPaise: orderTotalDiscount,
          totalPaise: Math.max(0, baseTotal),
          updatedAt: now()
        }

        return {
          orderItems: updatedOrderItems,
          orders: state.orders.map(o => o.id === orderId ? updatedOrder : o),
          currentOrder: state.currentOrder?.id === orderId ? updatedOrder : state.currentOrder
        }
      }),

      updateOrderItems: (orderId, inputs) => {
        const state = get()
        const order = state.orders.find((candidate) => candidate.id === orderId)
        if (!order || order.status === 'cancelled' || order.status === 'void' || inputs.length === 0) return false
        if (inputs.some((input) => !input.menuItemId || !Number.isFinite(input.quantity) || input.quantity <= 0)) return false

        const changedAt = now()
        const previousItems = state.orderItems.filter((item) => item.orderId === orderId && item.status !== 'cancelled')
        const defaultStatus: OrderItem['status'] = ['paid', 'billed', 'ready'].includes(order.status) ? 'served' : 'draft'
        const updatedItems: OrderItem[] = inputs.map((input) => {
          const quantity = Math.max(1, Math.round(input.quantity))
          const subtotalPaise = Math.max(0, Math.round(input.unitPricePaise) * quantity)
          const discountPaise = Math.min(subtotalPaise, Math.max(0, Math.round(input.discountPaise ?? 0)))
          const taxPaise = calculateTax(Math.max(0, subtotalPaise - discountPaise), taxablePercent(input))
          return {
            id: input.id ?? newId('oi'),
            orderId,
            menuItemId: input.menuItemId,
            nameSnapshot: input.nameSnapshot,
            itemType: input.itemType,
            isSeparateBill: input.isSeparateBill,
            quantity,
            unitPricePaise: Math.max(0, Math.round(input.unitPricePaise)),
            taxPercent: input.taxPercent,
            taxType: input.taxType,
            taxPaise,
            discountPaise,
            totalPaise: Math.max(0, subtotalPaise - discountPaise + taxPaise),
            stationId: input.stationId,
            status: input.status ?? defaultStatus,
            note: input.note,
            modifiers: input.modifiers,
            createdAt: input.createdAt ?? changedAt,
          }
        })

        const subtotalPaise = updatedItems.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
        const discountPaise = updatedItems.reduce((sum, item) => sum + item.discountPaise, 0)
        const taxPaise = updatedItems.reduce((sum, item) => sum + item.taxPaise, 0)
        const totalPaise = Math.max(0, subtotalPaise + taxPaise + order.chargePaise - discountPaise)
        const collectedPaise = getCollectedPaidPaise(state.payments, orderId)
        const paidPaise = Math.min(collectedPaise, totalPaise)
        const paymentStatus = getPaymentStatus(totalPaise, paidPaise)
        const nextStatus: Order['status'] = paymentStatus === 'paid'
          ? 'paid'
          : order.status === 'paid' || order.status === 'billed' ? 'billed' : order.status
        const updatedOrder: Order = {
          ...order,
          status: nextStatus,
          subtotalPaise,
          discountPaise,
          taxPaise,
          totalPaise,
          paidPaise,
          paymentStatus,
          closedAt: paymentStatus === 'paid' ? (order.closedAt ?? changedAt) : order.closedAt,
          recipeConsumedAt: order.recipeConsumptionStatus === 'consumed' ? changedAt : order.recipeConsumedAt,
          updatedAt: changedAt,
        }

        let inventoryItems = state.inventoryItems
        if (order.recipeConsumptionStatus === 'consumed') {
          const restoredInventory = applyRecipeStockDelta(state, previousItems, 'restore')
          inventoryItems = applyRecipeStockDelta({ ...state, inventoryItems: restoredInventory }, updatedItems, 'consume')
        }

        set((current) => ({
          orders: current.orders.map((candidate) => candidate.id === orderId ? updatedOrder : candidate),
          orderItems: [
            ...current.orderItems.filter((item) => item.orderId !== orderId || item.status === 'cancelled'),
            ...updatedItems,
          ],
          inventoryItems,
          currentOrder: current.currentOrder?.id === orderId ? updatedOrder : current.currentOrder,
          auditLogs: addAudit(current, 'order.items.updated', 'order', `Updated products on ${order.orderNo}`, orderId),
        }))

        const afterState = get()
        updateCloudOrder(updatedOrder, afterState.orderItems.filter((item) => item.orderId === orderId)).catch(console.error)
        realtimeClient.broadcast('ORDER_UPDATED', { order: updatedOrder, items: updatedItems })
        return true
      },

      cancelKOT: (kotId, reason) => {
        const state = get()
        const kot = state.kots.find((candidate) => candidate.id === kotId)
        if (!kot || kot.status === 'cancelled') return false
        const affectedItemIds = new Set(kot.items.map((item) => item.orderItemId))
        const cancelledAt = now()
        set((current) => {
          const remainingItems = current.orderItems.filter((item) =>
            item.orderId === kot.orderId && !affectedItemIds.has(item.id) && item.status !== 'cancelled'
          )
          const subtotalPaise = remainingItems.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
          const taxPaise = remainingItems.reduce((sum, item) => sum + item.taxPaise, 0)
          const discountPaise = remainingItems.reduce((sum, item) => sum + item.discountPaise, 0)
          const remainingKots = current.kots.filter((candidate) =>
            candidate.orderId === kot.orderId && candidate.id !== kotId && candidate.status !== 'cancelled'
          )
          const nextStatus: Order['status'] = remainingKots.length === 0
            ? 'running'
            : remainingKots.every((candidate) => ['ready', 'served'].includes(candidate.status)) ? 'ready' : 'preparing'
          const tableStatus: TableStatus = nextStatus === 'running' ? 'occupied' : nextStatus === 'ready' ? 'ready' : 'preparing'
          return {
            kots: current.kots.map((candidate) => candidate.id === kotId ? {
              ...candidate,
              status: 'cancelled' as const,
              cancellationReason: reason,
              cancelledAt,
              items: candidate.items.map((item) => ({ ...item, status: 'cancelled' as const })),
            } : candidate),
            orderItems: current.orderItems.map((item) => affectedItemIds.has(item.id) ? { ...item, status: 'cancelled' as const } : item),
            orders: current.orders.map((order) => order.id === kot.orderId ? {
              ...order,
              status: nextStatus,
              subtotalPaise,
              discountPaise,
              taxPaise,
              totalPaise: Math.max(0, subtotalPaise + taxPaise + order.chargePaise - discountPaise),
              updatedAt: cancelledAt,
            } : order),
            currentOrder: current.currentOrder?.id === kot.orderId ? {
              ...current.currentOrder,
              status: nextStatus,
              subtotalPaise,
              discountPaise,
              taxPaise,
              totalPaise: Math.max(0, subtotalPaise + taxPaise + current.currentOrder.chargePaise - discountPaise),
              updatedAt: cancelledAt,
            } : current.currentOrder,
            tables: current.tables.map((table) => table.activeOrderId === kot.orderId ? { ...table, status: tableStatus } : table),
            auditLogs: addAudit(current, 'kot.cancelled', 'kot', reason, kotId),
          }
        })
        realtimeClient.broadcast('KOT_STATUS_UPDATED', { kotId, status: 'cancelled', reason })
        return true
      },

      cancelOrderItemQty: (orderItemId, qtyToCancel, reason) => {
        const state = get()
        const orderItem = state.orderItems.find((candidate) => candidate.id === orderItemId)
        if (!orderItem || orderItem.status === 'cancelled') return false
        
        const order = state.orders.find((candidate) => candidate.id === orderItem.orderId)
        if (!order) return false

        const isFullCancel = qtyToCancel >= orderItem.quantity
        const newQty = isFullCancel ? 0 : orderItem.quantity - qtyToCancel
        const cancelledAt = now()

        set((current) => {
          const updatedOrderItems = current.orderItems.map(item => {
            if (item.id === orderItemId) {
              if (isFullCancel) return { ...item, status: 'cancelled' as const }
              const ratio = newQty / item.quantity
              return { 
                ...item, 
                quantity: newQty, 
                totalPaise: Math.round((item.unitPricePaise * newQty) - (item.discountPaise * ratio)) + Math.round(item.taxPaise * ratio),
                discountPaise: Math.round(item.discountPaise * ratio),
                taxPaise: Math.round(item.taxPaise * ratio)
              }
            }
            return item
          })

          const remainingItems = updatedOrderItems.filter(item => item.orderId === order.id && item.status !== 'cancelled')
          const subtotalPaise = remainingItems.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
          const discountPaise = remainingItems.reduce((sum, item) => sum + item.discountPaise, 0)
          const taxPaise = remainingItems.reduce((sum, item) => sum + item.taxPaise, 0)
          
          const hasRemainingItems = remainingItems.length > 0
          const updatedOrder = {
            ...order,
            status: hasRemainingItems ? order.status : 'cancelled' as const,
            subtotalPaise,
            discountPaise,
            taxPaise,
            totalPaise: Math.max(0, subtotalPaise + taxPaise + order.chargePaise - discountPaise),
            cancellationReason: hasRemainingItems ? order.cancellationReason : reason,
            cancelledAt: hasRemainingItems ? order.cancelledAt : cancelledAt,
            updatedAt: cancelledAt
          }

          const updatedKots = current.kots.map(kot => {
            if (kot.orderId !== order.id) return kot
            const items = kot.items.map(ki => {
              if (ki.orderItemId === orderItemId) {
                if (isFullCancel) return { ...ki, status: 'cancelled' as const }
                return { ...ki, quantity: newQty }
              }
              return ki
            })
            const activeItems = items.filter((ki) => ki.status !== 'cancelled' && ki.quantity > 0)
            return {
              ...kot,
              status: activeItems.length === 0 ? 'cancelled' as const : kot.status,
              items
            }
          })

          return {
            orderItems: updatedOrderItems,
            orders: current.orders.map(o => o.id === order.id ? updatedOrder : o),
            currentOrder: current.currentOrder?.id === order.id ? (hasRemainingItems ? updatedOrder : null) : current.currentOrder,
            kots: updatedKots,
            cart: current.currentOrder?.id === order.id && !hasRemainingItems ? [] : current.cart,
            selectedTableId: current.currentOrder?.id === order.id && !hasRemainingItems ? null : current.selectedTableId,
            savedCarts: !hasRemainingItems && order.tableId ? Object.fromEntries(Object.entries(current.savedCarts).filter(([tableId]) => tableId !== order.tableId)) as Record<string, CartItem[]> : current.savedCarts,
            tables: !hasRemainingItems && order.tableId
              ? current.tables.map((table) => table.id === order.tableId || table.activeOrderId === order.id ? { ...table, status: 'available' as TableStatus, activeOrderId: undefined } : table)
              : current.tables,
            auditLogs: addAudit(current, 'order_item.cancelled', 'order_item', `Cancelled ${qtyToCancel}x ${orderItem.nameSnapshot}: ${reason}`, orderItemId),
          }
        })
        
        realtimeClient.broadcast('ORDER_STATUS_UPDATED', { orderId: order.id, status: order.status })
        return true
      },

      cancelOrderItems: (orderId, reason) => {
        const state = get()
        const order = state.orders.find((candidate) => candidate.id === orderId)
        if (!order || order.status === 'cancelled') return false
        const activeItems = state.orderItems.filter((item) => item.orderId === orderId && item.status !== 'cancelled')
        if (activeItems.length === 0) return false
        const cancelledAt = now()
        const activeItemIds = new Set(activeItems.map((item) => item.id))

        set((current) => {
          const savedCarts = order.tableId
            ? Object.fromEntries(Object.entries(current.savedCarts).filter(([tableId]) => tableId !== order.tableId)) as Record<string, CartItem[]>
            : current.savedCarts
          return {
            orderItems: current.orderItems.map((item) => activeItemIds.has(item.id) ? { ...item, status: 'cancelled' as const } : item),
            kots: current.kots.map((kot) => kot.orderId === orderId ? {
              ...kot,
              status: 'cancelled' as const,
              cancellationReason: reason,
              cancelledAt,
              items: kot.items.map((item) => ({ ...item, status: 'cancelled' as const })),
            } : kot),
            orders: current.orders.map((candidate) => candidate.id === orderId ? {
              ...candidate,
              status: 'cancelled' as const,
              subtotalPaise: 0,
              discountPaise: 0,
              taxPaise: 0,
              totalPaise: 0,
              cancellationReason: reason,
              cancelledAt,
              updatedAt: cancelledAt,
            } : candidate),
            currentOrder: current.currentOrder?.id === orderId ? null : current.currentOrder,
            cart: current.currentOrder?.id === orderId ? [] : current.cart,
            selectedTableId: current.currentOrder?.id === orderId ? null : current.selectedTableId,
            savedCarts,
            tables: current.tables.map((table) => table.activeOrderId === orderId || table.id === order.tableId ? { ...table, status: 'available' as TableStatus, activeOrderId: undefined } : table),
            auditLogs: addAudit(current, 'order.items.cancelled', 'order', `Cancelled all items: ${reason}`, orderId),
          }
        })

        realtimeClient.broadcast('ORDER_STATUS_UPDATED', { orderId, status: 'cancelled' })
        return true
      },

      revisePayment: (orderId, method, referenceNo, reason, userId) => {
        const state = get()
        const order = state.orders.find((candidate) => candidate.id === orderId)
        if (!order || order.paymentStatus !== 'paid' || order.status === 'cancelled') return false
        const changedAt = now()
        set((current) => ({
          payments: [{
            id: newId('pay'),
            orderId,
            method,
            amountPaise: order.totalPaise,
            referenceNo: referenceNo || undefined,
            status: 'success',
            collectedByUserId: userId,
            createdAt: changedAt,
            statusReason: `Replacement payment: ${reason}`,
          }, ...current.payments.map((payment) => payment.orderId === orderId && payment.status === 'success'
            ? { ...payment, status: 'failed' as const, statusReason: reason }
            : payment)],
          orders: current.orders.map((candidate) => candidate.id === orderId ? { ...candidate, paidPaise: order.totalPaise, updatedAt: changedAt } : candidate),
          auditLogs: addAudit(current, 'payment.revised', 'payment', `${reason}; changed to ${method.toUpperCase()}`, orderId),
        }))
        realtimeClient.broadcast('PAYMENT_SETTLED', { orderId, method, revised: true })
        return true
      },

      updateKOTItemStatus: (kotId, itemId, status) => {
        set((state) => {
          const updatedKots: KOT[] = state.kots.map((kot) => {
            if (kot.id !== kotId) return kot
            const items = kot.items.map((item) => item.id === itemId ? { ...item, status } : item)
            const allReady = items.every((item) => item.status === 'ready')
            return { ...kot, items, status: allReady ? 'ready' : 'preparing' }
          })
          const changedKot = updatedKots.find((kot) => kot.id === kotId)
          const orderId = changedKot?.orderId
          const orderReady = orderId ? updatedKots.filter((kot) => kot.orderId === orderId && kot.status !== 'cancelled').every((kot) => ['ready', 'served'].includes(kot.status)) : false
          return {
            kots: updatedKots,
            orderItems: state.orderItems.map((item) => item.id === changedKot?.items.find((kotItem) => kotItem.id === itemId)?.orderItemId ? { ...item, status: status === 'ready' ? 'ready' : status === 'served' ? 'served' : status === 'cancelled' ? 'cancelled' : 'preparing' } : item),
            orders: orderId ? state.orders.map((order) => order.id === orderId ? { ...order, status: orderReady ? 'ready' : 'preparing', updatedAt: now() } : order) : state.orders,
            tables: orderId ? state.tables.map((table) => table.activeOrderId === orderId ? { ...table, status: orderReady ? 'ready' : 'preparing' } : table) : state.tables,
          }
        })

        const state = get()
        const kot = state.kots.find(k => k.id === kotId)
        if (kot) {
          updateCloudKOT(state.outlet.id, kot).catch(console.error)
          if (kot.orderId) {
            const order = state.orders.find(o => o.id === kot.orderId)
            if (order) {
              const items = state.orderItems.filter(i => i.orderId === order.id)
              updateCloudOrder(order, items).catch(console.error)
            }
          }
        }
        realtimeClient.broadcast('KOT_STATUS_UPDATED', { kotId, itemId, status })
      },

      updateKOTStatus: (kotId, status) => {
        set((state) => {
          const kot = state.kots.find((candidate) => candidate.id === kotId)
          const orderId = kot?.orderId
          const affectedOrderItemIds = new Set(kot?.items.map((item) => item.orderItemId) ?? [])
          const updatedKots: KOT[] = state.kots.map((candidate) => candidate.id === kotId ? { ...candidate, status, items: candidate.items.map((item) => ({ ...item, status })) } : candidate)
          const orderReady = orderId ? updatedKots.filter((candidate) => candidate.orderId === orderId && candidate.status !== 'cancelled').every((candidate) => ['ready', 'served'].includes(candidate.status)) : false
          return {
            kots: updatedKots,
            orders: orderId ? state.orders.map((order) => order.id === orderId ? { ...order, status: orderReady ? 'ready' : 'preparing', updatedAt: now() } : order) : state.orders,
            tables: orderId ? state.tables.map((table) => table.activeOrderId === orderId ? { ...table, status: orderReady ? 'ready' : 'preparing' } : table) : state.tables,
            orderItems: state.orderItems.map((item) => affectedOrderItemIds.has(item.id) ? { ...item, status: status === 'ready' ? 'ready' : status === 'served' ? 'served' : status === 'cancelled' ? 'cancelled' : 'preparing' } : item),
          }
        })

        const state = get()
        const kot = state.kots.find(k => k.id === kotId)
        if (kot) {
          updateCloudKOT(state.outlet.id, kot).catch(console.error)
          if (kot.orderId) {
            const order = state.orders.find(o => o.id === kot.orderId)
            if (order) {
              const items = state.orderItems.filter(i => i.orderId === order.id)
              updateCloudOrder(order, items).catch(console.error)
            }
          }
        }
        realtimeClient.broadcast('KOT_STATUS_UPDATED', { kotId, status })
      },

      printReceipt: (orderId, type = 'invoice') => {
        const state = get()
        const order = state.orders.find((candidate) => candidate.id === orderId)
        if (!order) return
        const items = state.orderItems.filter((item) => item.orderId === orderId && item.status !== 'cancelled')
        const payments = state.payments.filter((payment) => payment.orderId === orderId)
        const parts = buildReceiptPrintParts(order, items, payments, state.outlet, state.printSettings, type, state.menuItems, state.menuCategories)
        void (async () => {
          for (const part of parts) {
            const url = `/print/receipt/${orderId}?type=${type}&part=${part.section}`
            const job = {
              jobName: `${type === 'proforma' ? 'Proforma' : 'Bill'} ${order.orderNo} ${part.title}`,
              text: part.text,
              browserUrl: url,
              qrCodes: part.upiPaymentUrl ? [{ data: part.upiPaymentUrl, label: 'SCAN TO PAY' }] : undefined,
            }
            try {
              const result = await sendPrintJob(state.printSettings, job)
              useUIStore.getState().addToast('success', result === 'direct' ? `${part.title} sent to printer` : `${part.title} opened in print dialog`, type === 'proforma' ? 'Proforma Print' : 'Bill Print')
            } catch (error) {
              const message = describePrinterError(error)
              if (state.printSettings.connectionMode === 'bridge') {
                useUIStore.getState().addToast('error', message, 'Bill Print')
              } else {
                useUIStore.getState().addToast('error', `${message} Opening the system print dialog instead.`)
                await sendPrintJob({ ...state.printSettings, connectionMode: 'browser' }, job)
              }
            }
          }
        })()
      },

      printCartProforma: () => {
        const state = get()
        const order = state.currentOrder
        const selectedTable = state.selectedTableId ? state.tables.find((candidate) => candidate.id === state.selectedTableId) : undefined
        const orderTable = order?.tableId ? state.tables.find((candidate) => candidate.id === order.tableId) : undefined
        const table = orderTable ?? selectedTable
        const orderId = order?.id ?? 'draft_proforma'
        const savedItems = order ? state.orderItems.filter((item) => item.orderId === order.id && item.status !== 'cancelled') : []
        const draftItems = state.cart.map<OrderItem>((item, index) => {
          const subtotal = item.unitPricePaise * item.quantity
          const discount = item.discountPaise || 0
          const tax = calculateTax(Math.max(0, subtotal - discount), taxablePercent(item))
          return {
            id: `draft_${item.menuItemId}_${index}`,
            orderId,
            menuItemId: item.menuItemId,
            nameSnapshot: item.name,
            itemType: item.itemType,
            isSeparateBill: item.isSeparateBill,
            quantity: item.quantity,
            unitPricePaise: item.unitPricePaise,
            taxPercent: item.taxPercent,
            taxType: item.taxType,
            taxPaise: tax,
            discountPaise: discount,
            totalPaise: Math.max(0, subtotal - discount + tax),
            stationId: item.stationId,
            status: 'draft',
            note: item.note,
            modifiers: item.modifiers,
            createdAt: now(),
          }
        })
        const items = [...savedItems, ...draftItems]
        if (items.length === 0) {
          useUIStore.getState().addToast('warning', 'Add items before printing proforma')
          return
        }

        const subtotalPaise = items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0)
        const discountPaise = items.reduce((sum, item) => sum + item.discountPaise, 0)
        const taxPaise = items.reduce((sum, item) => sum + item.taxPaise, 0)
        const chargePaise = order?.chargePaise ?? 0
        const totalPaise = Math.max(0, subtotalPaise + taxPaise + chargePaise - discountPaise)
        const proformaOrder: Order = order
          ? {
              ...order,
              tableName: order.tableName ?? table?.name,
              subtotalPaise,
              discountPaise,
              taxPaise,
              chargePaise,
              totalPaise,
              updatedAt: now(),
            }
          : {
              id: orderId,
              outletId: state.outlet.id,
              orderNo: 'PROFORMA',
              businessDate: today(),
              type: state.activeOrderType,
              status: 'draft',
              tableId: table?.id,
              tableName: table?.name,
              cashierUserId: 'system',
              cashierName: 'Operator',
              subtotalPaise,
              discountPaise,
              taxPaise,
              chargePaise,
              totalPaise,
              paidPaise: 0,
              paymentStatus: 'unpaid',
              createdAt: now(),
              updatedAt: now(),
            }
        const payments = order ? state.payments.filter((payment) => payment.orderId === order.id) : []
        const parts = buildReceiptPrintParts(proformaOrder, items, payments, state.outlet, state.printSettings, 'proforma', state.menuItems, state.menuCategories)

        void (async () => {
          for (const part of parts) {
            const job = {
              jobName: `Proforma ${proformaOrder.orderNo} ${part.title}`,
              text: part.text,
              qrCodes: part.upiPaymentUrl ? [{ data: part.upiPaymentUrl, label: 'SCAN TO PAY' }] : undefined,
            }
            try {
              const result = await sendPrintJob(state.printSettings, job)
              useUIStore.getState().addToast('success', result === 'direct' ? `${part.title} sent to printer` : `${part.title} opened in print dialog`, 'Proforma Print')
            } catch (error) {
              const message = describePrinterError(error)
              if (state.printSettings.connectionMode === 'bridge') {
                useUIStore.getState().addToast('error', message, 'Proforma Print')
              } else {
                useUIStore.getState().addToast('error', `${message} Opening the system print dialog instead.`)
                await sendPrintJob({ ...state.printSettings, connectionMode: 'browser' }, job)
              }
            }
          }
        })()
      },

      printKOT: (kotId, kotIds) => {
        const url = `/print/kot/${kotId}`
        const state = get()
        const kot = state.kots.find((candidate) => candidate.id === kotId)
        if (!kot) return
        const selectedKots = kotIds?.length
          ? kotIds.map((id) => state.kots.find((candidate) => candidate.id === id)).filter((candidate): candidate is KOT => Boolean(candidate))
          : [kot]
        const printableKot = state.printSettings.kotPrintMode === 'single' && selectedKots.length > 1
          ? combineKotsForPrint(selectedKots)
          : kot
        const station = kot.stationId ? state.stations.find(candidate => candidate.id === kot.stationId) : undefined
        const stationPrinter = station?.printerTarget?.trim()
        const job = {
          jobName: `KOT ${printableKot.kotNo}${station ? ` ${station.name}` : ''}`,
          text: buildKotPrintText(printableKot, state.outlet, state.printSettings),
          browserUrl: url,
        }
        const printTarget = state.printSettings.kotPrintMode === 'single' && selectedKots.length > 1
          ? (state.printSettings.printerName.trim() || stationPrinter)
          : stationPrinter
        const printSettings = printTarget
          ? { ...state.printSettings, connectionMode: state.printSettings.connectionMode === 'bridge' ? 'bridge' as const : 'native' as const, bridgeUrl: state.printSettings.bridgeUrl || DEFAULT_BRIDGE_URL, printerName: printTarget, openCashDrawer: false }
          : { ...state.printSettings, openCashDrawer: false }
        void sendPrintJob(printSettings, job)
          .then((result) => {
            useUIStore.getState().addToast('success', result === 'direct' ? `${printableKot.kotNo} sent to printer` : `${printableKot.kotNo} opened in print dialog`, 'KOT Print')
          })
          .catch(async (error) => {
            const message = describePrinterError(error)
            if (printSettings.connectionMode === 'bridge') {
              useUIStore.getState().addToast('error', message, 'KOT Print')
            } else {
              useUIStore.getState().addToast('error', `${message} Opening the system print dialog instead.`)
              await sendPrintJob({ ...state.printSettings, connectionMode: 'browser', openCashDrawer: false }, job)
            }
          })
      },

      getCartTotal: () => {
        const state = get()
        let subtotal = 0
        let tax = 0
        let discount = 0
        state.cart.forEach((item) => {
          const itemSubtotal = (item.unitPricePaise * item.quantity) - (item.discountPaise || 0)
          subtotal += itemSubtotal
          tax += calculateTax(itemSubtotal, taxablePercent(item))
          discount += item.discountPaise || 0
        })
        return { subtotal, tax, discount, total: subtotal + tax }
      },

      getActiveKOTs: () => {
        const { kots, orders } = get()
        return kots
          .map((kot) => ({ ...kot, items: kot.items.filter((item) => item.status !== 'cancelled' && item.quantity > 0) }))
          .filter((kot) =>
            kot.items.length > 0 &&
            kot.status !== 'served' &&
            kot.status !== 'cancelled' &&
            orders.some((o) => o.id === kot.orderId && !['paid', 'cancelled', 'void'].includes(o.status))
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      },

      getCustomerAccountDetails: (phone: string) => {
        const { orders, payments, orderItems } = get()
        let balancePaise = 0
        const unpaidItems: string[] = []
        
        if (!phone) return { balancePaise, unpaidItems }

        const customerOrders = orders.filter(o => o.customerPhone === phone && o.status !== 'cancelled')

        for (const order of customerOrders) {
          const orderPayments = payments.filter(p => p.orderId === order.id && p.status === 'success')
          const accountPayments = orderPayments.filter(p => p.method === 'account')
          const accountAmount = accountPayments.reduce((sum, p) => sum + p.amountPaise, 0)

          if (accountAmount > 0) {
            balancePaise += accountAmount
            
            // Find items for this order
            const items = orderItems.filter(i => i.orderId === order.id && i.status !== 'cancelled')
            
            // Count items
            const itemCounts = new Map<string, number>()
            for (const item of items) {
              itemCounts.set(item.nameSnapshot, (itemCounts.get(item.nameSnapshot) || 0) + item.quantity)
            }
            
            // Format strings
            for (const [name, qty] of itemCounts.entries()) {
              unpaidItems.push(`${name}(${qty})`)
            }
          }
        }

        return { balancePaise, unpaidItems }
      },

      getTodaySummary: () => {
        const state = get()
        const itemCountByOrder = getActiveItemCountByOrder(state.orderItems)
        const paidOrders = state.orders.filter((order) =>
          order.businessDate === today() &&
          order.paymentStatus === 'paid' &&
          !['cancelled', 'void'].includes(order.status) &&
          order.totalPaise > 0 &&
          (itemCountByOrder.get(order.id) ?? 0) > 0
        )
        const totalSalesPaise = paidOrders.reduce((sum, order) => sum + order.totalPaise, 0)
        const paymentModes = state.payments
          .filter((payment) => payment.status === 'success' && isCollectedPayment(payment.method) && paidOrders.some((order) => order.id === payment.orderId))
          .reduce<Record<string, number>>((acc, payment) => {
            acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPaise
            return acc
          }, {})

        const itemSales = state.orderItems
          .filter((item) => item.status !== 'cancelled' && paidOrders.some((order) => order.id === item.orderId))
          .reduce<Record<string, { qty: number; revenuePaise: number }>>((acc, item) => {
            acc[item.nameSnapshot] ??= { qty: 0, revenuePaise: 0 }
            acc[item.nameSnapshot].qty += item.quantity
            acc[item.nameSnapshot].revenuePaise += item.totalPaise
            return acc
          }, {})

        const hourlyData = Array.from({ length: 12 }, (_, index) => {
          const hour = index + 10
          const sales = paidOrders
            .filter((order) => new Date(order.closedAt ?? order.createdAt).getHours() === hour)
            .reduce((sum, order) => sum + order.totalPaise, 0)
          return { hour: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`, sales }
        })

        return {
          totalSalesPaise,
          orderCount: paidOrders.length,
          avgOrderValuePaise: paidOrders.length ? Math.round(totalSalesPaise / paidOrders.length) : 0,
          openTableCount: state.tables.filter((table) => {
            if (!table.activeOrderId) return false
            const linkedOrder = state.orders.find((order) => order.id === table.activeOrderId)
            if (!linkedOrder || ['paid', 'cancelled', 'void'].includes(linkedOrder.status)) return false
            return (itemCountByOrder.get(linkedOrder.id) ?? 0) > 0 || (linkedOrder.tableId ? (state.savedCarts[linkedOrder.tableId]?.length ?? 0) > 0 : false)
          }).length,
          cancelledPaise: state.orders.filter((order) => order.status === 'cancelled').reduce((sum, order) => sum + order.totalPaise, 0),
          discountPaise: paidOrders.reduce((sum, order) => sum + order.discountPaise, 0),
          paymentModes: Object.entries(paymentModes).map(([method, amountPaise]) => ({ method: method as PaymentMethod, amountPaise })),
          topItems: Object.entries(itemSales)
            .map(([name, value]) => ({ name, ...value }))
            .sort((a, b) => b.revenuePaise - a.revenuePaise)
            .slice(0, 5),
          hourlyData,
        }
      },
    }),
    {
      name: 'bhojpatra-restaurant-data-v2',
      version: 2,
      partialize: (state) => ({
        outlet: state.outlet,
        printSettings: state.printSettings,
        cloudSync: state.cloudSync,
        appUpdate: state.appUpdate,
        menuCategories: state.menuCategories,
        menuItems: state.menuItems,
        floors: state.floors,
        tables: state.tables,
        stations: state.stations,
          inventoryItems: ensureMenuInventoryItems(state.inventoryItems, state.menuItems, state.outlet.id),
        purchaseEntries: state.purchaseEntries,
        orders: state.orders,
        orderItems: state.orderItems,
        kots: state.kots,
        payments: state.payments,
        auditLogs: state.auditLogs,
        savedCarts: state.savedCarts,
        currentOrder: state.currentOrder,
        cart: state.cart,
        activeOrderType: state.activeOrderType,
        selectedTableId: state.selectedTableId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<BillingStore> | undefined
        if (!persisted) return currentState
        const normalizedBase = stripLegacyDemoData(reconcileSnapshot({
          outlet: persisted.outlet ?? DEFAULT_OUTLET,
          printSettings: persisted.printSettings ?? DEFAULT_PRINT_SETTINGS,
          menuCategories: persisted.menuCategories ?? [],
          menuItems: persisted.menuItems ?? [],
          floors: persisted.floors ?? [],
          tables: persisted.tables ?? [],
          stations: persisted.stations ?? defaultStations(persisted.outlet?.id),
          inventoryItems: persisted.inventoryItems ?? [],
          purchaseEntries: persisted.purchaseEntries ?? [],
          orders: persisted.orders ?? [],
          orderItems: persisted.orderItems ?? [],
          kots: persisted.kots ?? [],
          payments: persisted.payments ?? [],
          auditLogs: persisted.auditLogs ?? [],
          savedCarts: persisted.savedCarts ?? {},
        }))
        const normalized = {
          ...normalizedBase,
          inventoryItems: ensureMenuInventoryItems(normalizedBase.inventoryItems, normalizedBase.menuItems, normalizedBase.outlet.id),
        }
        const currentOrder = persisted.currentOrder && normalized.orders.some((order) => order.id === persisted.currentOrder?.id)
          ? normalized.orders.find((order) => order.id === persisted.currentOrder?.id) ?? null
          : null
        const selectedTableId = persisted.selectedTableId && normalized.tables.some((table) => table.id === persisted.selectedTableId)
          ? persisted.selectedTableId
          : null
        return {
          ...currentState,
          ...persisted,
          ...normalized,
          printSettings: mergeDevicePrintSettings(normalized.printSettings, persisted.printSettings),
          purchaseEntries: normalized.purchaseEntries ?? [],
          currentOrder,
          selectedTableId,
          cart: selectedTableId ? (normalized.savedCarts?.[selectedTableId] ?? persisted.cart ?? []) : [],
          activeOrderType: persisted.activeOrderType ?? currentState.activeOrderType,
        }
      },
    }
  )
)
