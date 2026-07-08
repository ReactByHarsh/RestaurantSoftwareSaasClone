import type { Role } from './types'

// ─── Permission Map ───────────────────────────────────────────────────────────

export type Permission =
  | 'billing:create_order'
  | 'billing:add_item'
  | 'billing:send_kot'
  | 'billing:apply_discount'
  | 'billing:void_item'
  | 'billing:settle_payment'
  | 'billing:print_bill'
  | 'billing:view'
  | 'tables:view'
  | 'tables:manage'
  | 'tables:merge'
  | 'tables:transfer'
  | 'captain:view'
  | 'captain:send_kot'
  | 'kitchen:view'
  | 'kitchen:update_status'
  | 'orders:view'
  | 'menu:view'
  | 'menu:manage'
  | 'inventory:view'
  | 'inventory:manage'
  | 'reports:view_today'
  | 'reports:view_advanced'
  | 'admin:manage_staff'
  | 'admin:manage_settings'
  | 'admin:view_audit_logs'
  | 'settings:view'
  | 'settings:manage'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'billing:view', 'billing:create_order', 'billing:add_item', 'billing:send_kot',
    'billing:apply_discount', 'billing:void_item', 'billing:settle_payment', 'billing:print_bill',
    'tables:view', 'tables:manage', 'tables:merge', 'tables:transfer',
    'captain:view', 'captain:send_kot',
    'kitchen:view', 'kitchen:update_status',
    'orders:view',
    'menu:view', 'menu:manage',
    'inventory:view', 'inventory:manage',
    'reports:view_today', 'reports:view_advanced',
    'admin:manage_staff', 'admin:manage_settings', 'admin:view_audit_logs',
    'settings:view', 'settings:manage',
  ],
  admin: [
    'billing:view', 'billing:create_order', 'billing:add_item', 'billing:send_kot',
    'billing:apply_discount', 'billing:void_item', 'billing:settle_payment', 'billing:print_bill',
    'tables:view', 'tables:manage', 'tables:merge', 'tables:transfer',
    'captain:view', 'captain:send_kot',
    'kitchen:view', 'kitchen:update_status',
    'orders:view',
    'menu:view', 'menu:manage',
    'inventory:view', 'inventory:manage',
    'reports:view_today', 'reports:view_advanced',
    'admin:manage_staff', 'admin:manage_settings', 'admin:view_audit_logs',
    'settings:view', 'settings:manage',
  ],
  manager: [
    'billing:view', 'billing:create_order', 'billing:add_item', 'billing:send_kot',
    'billing:apply_discount', 'billing:void_item', 'billing:settle_payment', 'billing:print_bill',
    'tables:view', 'tables:manage', 'tables:merge', 'tables:transfer',
    'captain:view', 'captain:send_kot',
    'kitchen:view', 'kitchen:update_status',
    'orders:view',
    'menu:view', 'menu:manage',
    'inventory:view', 'inventory:manage',
    'reports:view_today', 'reports:view_advanced',
    'admin:manage_staff', 'admin:manage_settings', 'admin:view_audit_logs',
    'settings:view',
  ],
  cashier: [
    'billing:view', 'billing:create_order', 'billing:add_item', 'billing:send_kot',
    'billing:settle_payment', 'billing:print_bill',
    'tables:view',
    'orders:view',
    'menu:view',
  ],
  captain: [
    'captain:view', 'captain:send_kot',
    'tables:view',
    'orders:view',
    'menu:view',
    'billing:view',
  ],
  kitchen: [
    'kitchen:view', 'kitchen:update_status',
  ],
  inventory: [
    'inventory:view', 'inventory:manage',
    'menu:view',
  ],
  viewer: [
    'billing:view', 'tables:view', 'orders:view', 'reports:view_today',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function getNavItems(role: Role): string[] {
  const all: { key: string; perm: Permission }[] = [
    { key: 'owner', perm: 'reports:view_today' },
    { key: 'tables', perm: 'tables:view' },
    { key: 'captain', perm: 'captain:view' },
    { key: 'kitchen', perm: 'kitchen:view' },
    { key: 'orders', perm: 'orders:view' },
    { key: 'menu', perm: 'menu:view' },
    { key: 'inventory', perm: 'inventory:view' },
    { key: 'reports', perm: 'reports:view_today' },
    { key: 'admin', perm: 'admin:manage_staff' },
    { key: 'printers', perm: 'settings:view' },
    { key: 'settings', perm: 'settings:view' },
  ]
  return all
    .filter((item) => {
      if (item.key === 'owner') return ['owner', 'admin', 'manager', 'viewer'].includes(role)
      return hasPermission(role, item.perm)
    })
    .map(n => n.key)
}

export function getDefaultRoute(role: Role): string {
  switch (role) {
    case 'kitchen': return '/app/kitchen'
    case 'captain': return '/app/captain'
    case 'cashier': return '/app/tables'
    case 'inventory': return '/app/inventory'
    case 'owner': return '/app/owner'
    case 'admin': return '/app/tables'
    case 'manager': return '/app/tables'
    case 'viewer': return '/app/reports'
    default: return '/app/tables'
  }
}
