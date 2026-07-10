// Core types for BhojPatra Desk

export type Role = 'owner' | 'admin' | 'manager' | 'cashier' | 'captain' | 'kitchen' | 'inventory' | 'viewer'

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'online_manual'

export type OrderStatus = 'draft' | 'running' | 'kot_sent' | 'preparing' | 'ready' | 'billed' | 'paid' | 'cancelled' | 'void'

export type TableStatus = 'available' | 'occupied' | 'kot_sent' | 'preparing' | 'ready' | 'bill_requested' | 'payment_pending' | 'reserved' | 'dirty'

export type KOTStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled'

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet' | 'due' | 'account' | 'paytm' | 'cheque' | 'aggregator' | 'complementary'

export type ItemType = 'veg' | 'nonveg' | 'egg' | 'other'

export type StockUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'nos' | 'plate' | 'portion'

export type ProductUsageType = 'sale_purchase' | 'sale_only' | 'purchase_only' | 'kitchen_processed'

// ─── User / Auth ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  tenantId: string
  name: string
  email?: string
  phone?: string
  role: Role
  status: 'active' | 'inactive' | 'halted'
  pin?: string
  lastLoginAt?: string
  createdAt: string
  restaurantName?: string
  accessStartsAt?: string
  accessEndsAt?: string
  paymentReceived?: boolean
  renewalPaymentReceived?: boolean
  paymentNote?: string
  paymentAmount?: number
  paymentDate?: string
  renewalAmount?: number
  renewalDate?: string
}

export interface Outlet {
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
}

export interface AuthState {
  user: User | null
  outlet: Outlet | null
  token: string | null
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuCategory {
  id: string
  outletId: string
  parentId?: string
  name: string
  color?: string
  billGroup?: string
  separateBill?: boolean
  taxType?: 'GST' | 'VAT' | 'None'
  taxPercent?: number
  cgstPercent?: number
  sgstPercent?: number
  vatPercent?: number
  discountPercent?: number
  sortOrder: number
  isActive: boolean
}

export interface MenuItem {
  id: string
  outletId: string
  categoryId: string
  name: string
  shortCode?: string
  barcode?: string
  description?: string
  productType?: ProductUsageType
  itemType: ItemType
  pricePaise: number
  costPricePaise?: number
  mrpPaise?: number
  specialPricePaise?: number
  onlinePricePaise?: number
  deliveryPricePaise?: number
  takeawayPricePaise?: number
  preparationMinutes?: number
  primaryUnit?: StockUnit
  alternateUnits?: AlternateUnit[]
  minimumStock?: number
  taxPercent: number
  taxType?: 'GST' | 'VAT' | 'None'
  taxInReverse?: boolean
  hsnCode?: string
  cgstPercent?: number
  sgstPercent?: number
  vatPercent?: number
  stationId?: string
  isAvailable: boolean
  isSeparateBill?: boolean
  isFavorite?: boolean
  activeOnApp?: boolean
  recommended?: boolean
  recipeItems?: RecipeItem[]
  modifierGroups?: ModifierGroup[]
  sortOrder: number
}

export interface AlternateUnit {
  unit: string
  factor: number
}

export interface RecipeItem {
  inventoryItemId: string
  name: string
  quantity: number
  unit: StockUnit
}

export interface Modifier {
  id: string
  name: string
  pricePaise: number
}

export interface ModifierGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  modifiers: Modifier[]
}

// ─── Tables / Floors ─────────────────────────────────────────────────────────

export interface Floor {
  id: string
  outletId: string
  name: string
  sortOrder: number
  isActive: boolean
}

export interface RestaurantTable {
  id: string
  outletId: string
  floorId: string
  name: string
  seats: number
  status: TableStatus
  activeOrderId?: string
  assignedUserId?: string
  sortOrder: number
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface Order {
  id: string
  outletId: string
  orderNo: string
  businessDate: string
  type: OrderType
  status: OrderStatus
  tableId?: string
  tableName?: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  captainUserId?: string
  captainName?: string
  cashierUserId?: string
  cashierName?: string
  subtotalPaise: number
  discountPaise: number
  taxPaise: number
  chargePaise: number
  totalPaise: number
  paidPaise: number
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  notes?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  cancellationReason?: string
  cancelledAt?: string
}

export interface OrderItem {
  id: string
  orderId: string
  menuItemId: string
  nameSnapshot: string
  itemType: ItemType
  isSeparateBill?: boolean
  quantity: number
  unitPricePaise: number
  taxPercent?: number
  taxType?: 'GST' | 'VAT' | 'None'
  taxPaise: number
  discountPaise: number
  totalPaise: number
  stationId?: string
  status: 'draft' | 'kot_sent' | 'preparing' | 'ready' | 'served' | 'cancelled'
  note?: string
  modifiers?: string[]
  createdAt: string
}

// ─── KOT ──────────────────────────────────────────────────────────────────────

export interface KOT {
  id: string
  orderId: string
  orderNo: string
  kotNo: string
  tableName?: string
  orderType: OrderType
  stationId?: string
  status: KOTStatus
  captainName?: string
  createdByUserId: string
  createdAt: string
  cancellationReason?: string
  cancelledAt?: string
  items: KOTItem[]
}

export interface KOTItem {
  id: string
  kotId: string
  orderItemId: string
  name: string
  quantity: number
  note?: string
  modifiers?: string[]
  status: KOTStatus
  itemType: ItemType
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  orderId: string
  method: PaymentMethod
  amountPaise: number
  referenceNo?: string
  status: 'success' | 'failed' | 'refunded'
  collectedByUserId: string
  createdAt: string
  statusReason?: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string
  outletId: string
  name: string
  unit: StockUnit
  currentStock: number
  minimumStock: number
  costPerUnit: number
  supplier?: string
  lastUpdatedAt: string
}

export interface StockMovement {
  id: string
  inventoryItemId: string
  type: 'in' | 'out' | 'adjustment' | 'waste'
  quantity: number
  note?: string
  userId: string
  createdAt: string
}

export interface PurchaseEntry {
  id: string
  outletId: string
  inventoryItemId: string
  menuItemId?: string
  itemName: string
  supplier?: string
  invoiceNo?: string
  unit: StockUnit
  unitSize: number
  quantity: number
  stockQuantity: number
  ratePaise: number
  basePaise: number
  gstPercent: number
  gstPaise: number
  vatPercent: number
  vatPaise: number
  totalPaise: number
  paymentMode: 'cash' | 'card' | 'upi'
  barcode?: string
  createdAt: string
  updatedAt: string
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface DailySummary {
  date: string
  totalSalesPaise: number
  orderCount: number
  avgOrderValuePaise: number
  paymentModes: { method: PaymentMethod; amountPaise: number }[]
  topItems: { name: string; qty: number; revenuePaise: number }[]
  cancelledPaise: number
  discountPaise: number
  openTableCount: number
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: string
  entityType: string
  entityId?: string
  details?: string
  createdAt: string
}

// ─── Station ─────────────────────────────────────────────────────────────────

export interface Station {
  id: string
  outletId: string
  name: string
  appIp?: string
  printerTarget?: string
  printerMode?: 'default' | 'lan' | 'bluetooth' | 'usb' | 'wired'
}

// ─── Realtime Events ─────────────────────────────────────────────────────────

export type RealtimeEventType =
  | 'CONNECTED'
  | 'STATE_UPDATED'
  | 'STATE_DELETED'
  | 'SAVE_REJECTED'
  | 'KOT_CREATED'
  | 'KOT_STATUS_UPDATED'
  | 'KOT_ADDED'
  | 'KOT_UPDATED'
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'ORDER_STATUS_UPDATED'
  | 'TABLE_STATUS_UPDATED'
  | 'PAYMENT_SETTLED'
  | 'PAYMENT_ADDED'
  | 'KOTS_TRANSFERRED'
  | 'STAFF_UPDATED'

export interface RealtimeEvent {
  type: RealtimeEventType
  outletId: string
  payload: Record<string, unknown>
  timestamp: string
  clientId?: string
}
