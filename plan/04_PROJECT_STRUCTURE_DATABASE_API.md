# Project Structure, Database, API, and Specifications

## 1. Repository Structure

Recommended monorepo:

```txt
restroflow-cloud/
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  wrangler.toml
  .env.example
  .gitignore

  apps/
    web/
      index.html
      package.json
      vite.config.ts
      tsconfig.json
      src/
        main.tsx
        app.tsx
        routes/
          root.tsx
          login.tsx
          app-shell.tsx
          billing.tsx
          tables.tsx
          captain.tsx
          kitchen.tsx
          orders.tsx
          menu.tsx
          inventory.tsx
          customers.tsx
          reports.tsx
          admin.tsx
          settings.tsx
        components/
          shell/
            AppShell.tsx
            SidebarNav.tsx
            TopStatusBar.tsx
            LiveStatusBadge.tsx
          billing/
            BillingScreen.tsx
            CategoryRail.tsx
            MenuGrid.tsx
            MenuItemCard.tsx
            OrderCart.tsx
            CartItemRow.tsx
            PaymentDrawer.tsx
            ModifierDialog.tsx
          tables/
            TableScreen.tsx
            FloorTabs.tsx
            TableGrid.tsx
            TableCard.tsx
            TableDrawer.tsx
          captain/
            CaptainScreen.tsx
            AssignedTables.tsx
            CaptainOrderDrawer.tsx
          kitchen/
            KitchenScreen.tsx
            KDSBoard.tsx
            KOTCard.tsx
            StationFilter.tsx
          admin/
            StaffManager.tsx
            RoleManager.tsx
            FloorManager.tsx
            TaxSettings.tsx
          shared/
            DataTable.tsx
            ConfirmDialog.tsx
            EmptyState.tsx
            Toast.tsx
        hooks/
          useAuth.ts
          useOutlet.ts
          useRealtime.ts
          useMenu.ts
          useOrders.ts
          useKeyboardShortcuts.ts
        lib/
          apiClient.ts
          queryClient.ts
          realtimeClient.ts
          money.ts
          date.ts
          permissions.ts
        store/
          uiStore.ts
          billingStore.ts
        styles/
          globals.css

    worker/
      package.json
      tsconfig.json
      src/
        index.ts
        env.ts
        router.ts
        middleware/
          auth.ts
          tenant.ts
          permissions.ts
          csrf.ts
          errors.ts
        routes/
          auth.routes.ts
          outlet.routes.ts
          menu.routes.ts
          table.routes.ts
          order.routes.ts
          kot.routes.ts
          payment.routes.ts
          report.routes.ts
          inventory.routes.ts
          admin.routes.ts
          realtime.routes.ts
        services/
          auth.service.ts
          menu.service.ts
          order.service.ts
          kot.service.ts
          payment.service.ts
          report.service.ts
          inventory.service.ts
          audit.service.ts
          realtime.service.ts
        durable-objects/
          OutletRealtimeDO.ts
        queues/
          receipt.queue.ts
          report.queue.ts
        utils/
          id.ts
          money.ts
          time.ts
          response.ts
          errors.ts

  packages/
    db/
      package.json
      drizzle.config.ts
      src/
        schema.ts
        migrations/
        seed.ts
        queries/
          menu.queries.ts
          order.queries.ts
          report.queries.ts
    shared/
      package.json
      src/
        types.ts
        permissions.ts
        constants.ts
        zod/
          auth.schema.ts
          menu.schema.ts
          order.schema.ts
          table.schema.ts
          payment.schema.ts
          inventory.schema.ts
    ui/
      package.json
      src/
        button.tsx
        input.tsx
        badge.tsx
        card.tsx
        drawer.tsx
        dialog.tsx
        tabs.tsx
        table.tsx
```

## 2. Environment Variables

`.env.example`

```txt
APP_NAME=RestroFlow Cloud
APP_URL=http://localhost:8787
SESSION_COOKIE_NAME=rf_session
SESSION_SECRET=change-me
CSRF_SECRET=change-me
NODE_ENV=development
```

Cloudflare bindings in `wrangler.toml`:

```toml
name = "restroflow-cloud"
main = "apps/worker/src/index.ts"
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "apps/web/dist"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "restroflow-db"
database_id = "REPLACE_ME"

[[kv_namespaces]]
binding = "CACHE"
id = "REPLACE_ME"

[[r2_buckets]]
binding = "R2"
bucket_name = "restroflow-assets"

[[queues.producers]]
binding = "RECEIPT_QUEUE"
queue = "receipt-jobs"

[[durable_objects.bindings]]
name = "OUTLET_REALTIME"
class_name = "OutletRealtimeDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["OutletRealtimeDO"]
```

## 3. Database Schema Overview

Use D1/SQLite via Drizzle.

### Core SaaS tables

```txt
tenants
outlets
users
user_outlets
roles
permissions
role_permissions
sessions
audit_logs
```

### Restaurant setup tables

```txt
floors
tables
menu_categories
menu_items
modifier_groups
modifiers
item_modifier_groups
taxes
charges
payment_methods
stations
printers
```

### Operations tables

```txt
shifts
orders
order_items
order_item_modifiers
kots
kot_items
payments
bill_receipts
table_events
customer_profiles
inventory_items
stock_movements
day_closes
```

## 4. Table Definitions

### tenants

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### outlets

```sql
CREATE TABLE outlets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  gstin TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  pin_hash TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

### user_outlets

```sql
CREATE TABLE user_outlets (
  user_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  PRIMARY KEY (user_id, outlet_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (outlet_id) REFERENCES outlets(id)
);
```

### floors

```sql
CREATE TABLE floors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### restaurant_tables

Use `restaurant_tables` instead of `tables` to avoid reserved/confusing names.

```sql
CREATE TABLE restaurant_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  floor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 120,
  height INTEGER DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'available',
  active_order_id TEXT,
  assigned_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### menu_categories

```sql
CREATE TABLE menu_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### menu_items

```sql
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_code TEXT,
  description TEXT,
  item_type TEXT DEFAULT 'veg',
  price_paise INTEGER NOT NULL,
  tax_id TEXT,
  station_id TEXT,
  image_key TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  track_inventory INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### orders

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  business_date TEXT NOT NULL,
  type TEXT NOT NULL, -- dine_in, takeaway, delivery, online_manual
  status TEXT NOT NULL DEFAULT 'draft',
  table_id TEXT,
  customer_id TEXT,
  captain_user_id TEXT,
  cashier_user_id TEXT,
  subtotal_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  charge_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL DEFAULT 0,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
```

### order_items

```sql
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  station_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, kot_sent, preparing, ready, served, cancelled
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### kots

```sql
CREATE TABLE kots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  kot_no TEXT NOT NULL,
  station_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new, preparing, ready, served, cancelled
  printed_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### kot_items

```sql
CREATE TABLE kot_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  kot_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### payments

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL, -- cash, upi, card, wallet, due
  amount_paise INTEGER NOT NULL,
  reference_no TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  collected_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
```

## 5. Indexes

Create important indexes:

```sql
CREATE INDEX idx_orders_outlet_date ON orders(outlet_id, business_date);
CREATE INDEX idx_orders_status ON orders(outlet_id, status);
CREATE INDEX idx_orders_table ON orders(outlet_id, table_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_kots_outlet_status ON kots(outlet_id, status);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_menu_items_outlet_category ON menu_items(outlet_id, category_id);
CREATE INDEX idx_audit_logs_outlet_created ON audit_logs(outlet_id, created_at);
```

## 6. Roles and Permissions

### Roles

```txt
owner
admin
manager
cashier
captain
kitchen
inventory
viewer
```

### Permission examples

```txt
billing:create_order
billing:add_item
billing:send_kot
billing:apply_discount
billing:void_item
billing:settle_payment
billing:print_bill

tables:view
tables:manage
tables:merge
tables:transfer

kitchen:view
kitchen:update_status

menu:view
menu:manage

inventory:view
inventory:manage

reports:view_today
reports:view_advanced

admin:manage_staff
admin:manage_settings
admin:view_audit_logs
```

## 7. API Contracts

### Login

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "emailOrPhone": "manager@example.com",
  "password": "password"
}
```

Response:

```json
{
  "user": {
    "id": "usr_1",
    "name": "Manager",
    "role": "manager"
  },
  "outlets": [
    { "id": "out_1", "name": "Main Outlet" }
  ]
}
```

### Get menu

```http
GET /api/v1/outlets/:outletId/menu
```

Response:

```json
{
  "categories": [],
  "items": [],
  "modifiers": [],
  "version": 12
}
```

### Create order

```http
POST /api/v1/outlets/:outletId/orders
```

Request:

```json
{
  "type": "dine_in",
  "tableId": "tbl_1",
  "customerId": null,
  "captainUserId": "usr_2",
  "items": [
    {
      "menuItemId": "itm_1",
      "quantity": 2,
      "modifierIds": ["mod_1"],
      "note": "Less spicy"
    }
  ]
}
```

Response:

```json
{
  "order": {},
  "items": [],
  "serverVersion": 1
}
```

### Add item

```http
POST /api/v1/outlets/:outletId/orders/:orderId/items
```

Request:

```json
{
  "menuItemId": "itm_1",
  "quantity": 1,
  "modifierIds": [],
  "note": "No onion",
  "clientMutationId": "cm_abc123"
}
```

### Send KOT

```http
POST /api/v1/outlets/:outletId/orders/:orderId/kot
```

Request:

```json
{
  "orderItemIds": ["oi_1", "oi_2"],
  "stationId": null,
  "print": false
}
```

Response:

```json
{
  "kot": {},
  "kotItems": []
}
```

### Update KOT item status

```http
PATCH /api/v1/outlets/:outletId/kots/:kotId/items/:kotItemId/status
```

Request:

```json
{
  "status": "ready"
}
```

### Settle payment

```http
POST /api/v1/outlets/:outletId/orders/:orderId/payments
```

Request:

```json
{
  "payments": [
    { "method": "cash", "amountPaise": 50000 },
    { "method": "upi", "amountPaise": 25000, "referenceNo": "UPI123" }
  ],
  "discountPaise": 0,
  "managerPin": null
}
```

Backend recalculates totals and validates payment amount.

## 8. WebSocket Contract

Connection:

```txt
GET /api/v1/outlets/:outletId/live/ws?token=short_lived_token
```

Client hello:

```json
{
  "type": "HELLO",
  "deviceId": "dev_counter_1",
  "role": "cashier",
  "lastEventId": "evt_123"
}
```

Server event:

```json
{
  "id": "evt_124",
  "type": "KOT_CREATED",
  "outletId": "out_1",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "payload": {
    "orderId": "ord_1",
    "kotId": "kot_1"
  }
}
```

## 9. State Machines

### Order status

```txt
draft -> kot_sent -> preparing -> ready -> billed -> paid -> closed
                         |          |        |
                         v          v        v
                      cancelled   served   cancelled
```

### Table status

```txt
available -> occupied -> kot_sent -> preparing -> ready -> bill_requested -> payment_pending -> dirty -> available
```

### KOT status

```txt
new -> preparing -> ready -> served
  \-> cancelled
```

## 10. Business Rules

### Billing

- Server always calculates subtotal, tax, discount, charges, and total.
- Payment cannot exceed bill total unless change calculation is implemented.
- Paid orders cannot be edited without refund/void flow.
- Cancelled items require reason.
- Discount above allowed threshold requires manager PIN.

### KOT

- Only items not already sent to KOT can be sent in a new KOT.
- KOT can be station-wise.
- Kitchen can update item status.
- Ready item updates table/order live status.

### Tables

- A table can have only one active order unless split-order mode is implemented.
- Merging tables creates a link between active order and multiple table IDs later.
- Transfer table changes table_id and creates audit log.

## 11. Seed Data

Create seed data:

- Demo tenant: Demo Restaurant
- Outlet: Main Outlet
- Users:
  - owner@example.com / owner
  - manager@example.com / manager
  - cashier@example.com / cashier
  - captain@example.com / captain
  - kitchen@example.com / kitchen
- Floors:
  - Ground Floor
  - AC Hall
- Tables:
  - G1–G10
  - A1–A8
- Categories:
  - Starters
  - Main Course
  - Rice
  - Breads
  - Beverages
  - Desserts
- Items:
  - Paneer Tikka
  - Veg Biryani
  - Masala Dosa
  - Tea
  - Coffee
  - Butter Naan
  - Dal Tadka
  - Gulab Jamun

## 12. Testing Requirements

### Unit tests

- Money calculation
- Tax calculation
- Order status transitions
- Permission checks
- Tenant isolation checks

### Integration tests

- Create order
- Add item
- Send KOT
- KDS status update
- Settle payment
- Day close

### E2E tests

- Cashier creates dine-in order and sends KOT.
- Kitchen marks KOT ready.
- Cashier settles payment.
- Owner views today report.

## 13. AI IDE Build Sequence

1. Create monorepo and config.
2. Create shared types and Zod schemas.
3. Create DB schema and migrations.
4. Create Worker API skeleton.
5. Create auth/session middleware.
6. Create seed data.
7. Create React app shell.
8. Create billing UI with mock data.
9. Connect menu API.
10. Connect orders API.
11. Add KOT API.
12. Add Durable Object WebSocket.
13. Connect KDS screen realtime.
14. Add payment settlement.
15. Add reports.
16. Polish PWA and deployment.
