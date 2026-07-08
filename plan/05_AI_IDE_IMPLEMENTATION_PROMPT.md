# Paste-Ready Prompt For Codex / AI IDE

Use this prompt in the project folder.

---

You are a senior full-stack engineer. Build a Cloudflare-first restaurant management SaaS called `RestroFlow Cloud`.

## Product Summary

Create a fast single-page restaurant POS/management SaaS inspired by Petpooja/FoodKart-style workflows. The app must be compact, simple, touch-friendly, and extremely fast. Users should click sidebar buttons/tabs and the active page should change instantly without full reload.

The product must support:

- Counter billing
- Table/floor management
- Captain/waiter ordering
- KOT generation
- Kitchen display system
- Cook order status updates
- Admin/settings
- Menu management
- Basic inventory
- Reports
- Role-based permissions
- Realtime sync between counter, captain, kitchen, and admin

Do not build a manual sync button in MVP. Build automatic realtime updates with reconnect status. Offline-first sync can be added later.

## Required Tech Stack

Use exactly this stack unless there is a strong Cloudflare compatibility reason:

- React + Vite + TypeScript for frontend
- Tailwind CSS for styling
- Radix UI primitives or shadcn-style components
- Lucide React icons
- Zustand for local UI state
- TanStack Query for server state
- React Hook Form + Zod for forms
- Cloudflare Workers for backend
- Hono for API routing
- Cloudflare D1 for database
- Drizzle ORM for schema/migrations
- Cloudflare Durable Objects + WebSockets for realtime outlet state
- Cloudflare R2 for files/receipts/exports/images
- Cloudflare KV for menu/settings cache
- Cloudflare Queues for async jobs
- Vitest for tests
- Playwright for E2E tests
- pnpm package manager

Avoid Node-only dependencies that fail on Cloudflare Workers.

## Architecture

Use a monorepo:

```txt
restroflow-cloud/
  apps/web
  apps/worker
  packages/db
  packages/shared
  packages/ui
```

The Worker API should serve `/api/v1/*`. The frontend is a SPA served from Cloudflare Workers Static Assets or Cloudflare Pages.

Use one Durable Object per outlet:

```txt
OutletRealtimeDO: outlet:{outletId}
```

It should broadcast events to all connected screens:

- Billing
- Tables
- Captain
- Kitchen
- Admin/manager live view

## UI Requirements

Build these SPA routes/tabs:

1. `/billing`
2. `/tables`
3. `/captain`
4. `/kitchen`
5. `/orders`
6. `/menu`
7. `/inventory`
8. `/customers`
9. `/reports`
10. `/admin`
11. `/settings`

Use a compact sidebar on desktop/tablet and bottom nav on mobile.

Top bar must show:

- Outlet
- Shift
- User/role
- Live status: Live / Reconnecting / Offline
- Search/command

### Billing Screen

Layout:

- Left: categories
- Center: menu item grid
- Right: current order/cart
- Bottom/right actions: Hold, Send KOT, Print KOT, Discount, Settle, Print Bill

Must support:

- Order type: dine-in, takeaway, delivery, online manual
- Table selection
- Customer optional
- Add item
- Quantity +/-
- Modifiers/notes
- Send KOT
- Payment settlement
- Receipt print view

### Table Screen

Show floor tabs and table cards.

Statuses:

- available
- occupied
- kot_sent
- preparing
- ready
- bill_requested
- payment_pending
- reserved
- dirty

Actions:

- Start order
- Add items
- Send KOT
- Print bill
- Settle payment
- Transfer table
- Merge tables placeholder
- Mark dirty/clean

### Captain Screen

Mobile/tablet optimized.

- Assigned table cards
- Quick item search
- Category chips
- Current table order drawer
- Send KOT
- Request bill

### Kitchen/KDS Screen

Large card layout.

- Station filter
- New/preparing/ready filters
- KOT cards
- Show table/source, order age, item quantities, notes/modifiers
- Mark Preparing
- Mark Ready
- Fullscreen mode
- Sound/visual indicator for new KOT

### Admin/Menu/Reports

Build usable MVP screens for:

- Menu categories/items CRUD
- Floors/tables CRUD
- Staff/users list
- Basic settings
- Today sales report
- Payment mode report
- Item sales report

## Visual Design

Use this palette:

```txt
Background:      #F8FAFC
Surface:         #FFFFFF
Surface muted:   #F1F5F9
Primary:         #0F766E
Primary dark:    #115E59
Accent:          #F59E0B
Danger:          #DC2626
Success:         #16A34A
Warning:         #D97706
Text:            #0F172A
Text muted:      #64748B
Border:          #E2E8F0
```

Use system font stack. Keep UI professional, simple, and compact. No heavy animations.

## Database

Create these tables in D1 using Drizzle migrations:

- tenants
- outlets
- users
- user_outlets
- sessions
- floors
- restaurant_tables
- menu_categories
- menu_items
- modifier_groups
- modifiers
- item_modifier_groups
- taxes
- charges
- stations
- shifts
- orders
- order_items
- order_item_modifiers
- kots
- kot_items
- payments
- customers
- inventory_items
- stock_movements
- day_closes
- audit_logs

Rules:

- Every business table must include tenant_id.
- Outlet-specific tables must include outlet_id.
- Store money as integer paise.
- Store timestamps as UTC ISO strings.
- Add indexes for outlet_id, business_date, status, created_at.
- Do not trust client totals; backend recalculates.

## Auth and Permissions

Implement custom session auth:

- Login with email/phone + password.
- Session stored in D1.
- HttpOnly Secure SameSite=Lax cookie.
- Middleware loads user and outlet access.
- Permission guard checks role/action.

Roles:

- owner
- admin
- manager
- cashier
- captain
- kitchen
- inventory
- viewer

Manager PIN required for:

- Void item
- Cancel paid order
- High discount
- Refund placeholder

## API Routes

Implement these MVP routes:

```txt
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/outlets
GET    /api/v1/outlets/:outletId/bootstrap

GET    /api/v1/outlets/:outletId/menu
POST   /api/v1/outlets/:outletId/menu/categories
POST   /api/v1/outlets/:outletId/menu/items
PATCH  /api/v1/outlets/:outletId/menu/items/:itemId

GET    /api/v1/outlets/:outletId/tables
POST   /api/v1/outlets/:outletId/floors
POST   /api/v1/outlets/:outletId/tables
PATCH  /api/v1/outlets/:outletId/tables/:tableId

GET    /api/v1/outlets/:outletId/orders
POST   /api/v1/outlets/:outletId/orders
GET    /api/v1/outlets/:outletId/orders/:orderId
POST   /api/v1/outlets/:outletId/orders/:orderId/items
PATCH  /api/v1/outlets/:outletId/orders/:orderId/items/:orderItemId
POST   /api/v1/outlets/:outletId/orders/:orderId/kot
POST   /api/v1/outlets/:outletId/orders/:orderId/payments

GET    /api/v1/outlets/:outletId/kitchen/kots
PATCH  /api/v1/outlets/:outletId/kitchen/kots/:kotId/items/:kotItemId/status

GET    /api/v1/outlets/:outletId/reports/today
GET    /api/v1/outlets/:outletId/reports/item-sales
GET    /api/v1/outlets/:outletId/reports/payment-modes

GET    /api/v1/outlets/:outletId/live/ws-token
GET    /api/v1/outlets/:outletId/live/ws
```

## Realtime Events

Implement event broadcasting via Durable Object:

```txt
ORDER_CREATED
ORDER_UPDATED
ORDER_ITEM_ADDED
ORDER_ITEM_CANCELLED
KOT_CREATED
KOT_STATUS_CHANGED
TABLE_STATUS_CHANGED
PAYMENT_SETTLED
BILL_PRINTED
MENU_UPDATED
INVENTORY_LOW
DAY_CLOSED
```

When API mutates order/table/KOT/payment data:

1. Validate auth and permissions.
2. Write to D1.
3. Create audit log for sensitive actions.
4. Send event to OutletRealtimeDO.
5. Durable Object broadcasts to connected clients.

## Seed Data

Create seed script with:

- Demo tenant
- Main outlet
- Users: owner, manager, cashier, captain, kitchen
- Floor: Ground Floor, AC Hall
- Tables: G1–G10, A1–A8
- Categories: Starters, Main Course, Rice, Breads, Beverages, Desserts
- Items: Paneer Tikka, Veg Biryani, Masala Dosa, Tea, Coffee, Butter Naan, Dal Tadka, Gulab Jamun

## Testing

Add tests for:

- Money calculation
- Tax calculation
- Permission guard
- Tenant isolation
- Create order
- Add item
- Send KOT
- KDS status update
- Settle payment

Add Playwright E2E:

1. Cashier logs in.
2. Opens Billing.
3. Creates dine-in order for table G1.
4. Adds items.
5. Sends KOT.
6. Kitchen screen sees KOT.
7. Kitchen marks ready.
8. Cashier settles payment.
9. Report shows sale.

## Acceptance Criteria

The MVP is complete when:

- App deploys to Cloudflare.
- Login works.
- Role-based navigation works.
- Menu CRUD works.
- Tables/floors work.
- Cashier can create order and send KOT.
- Kitchen receives KOT in realtime.
- Kitchen can mark ready.
- Billing can settle payment.
- Reports show today's sales.
- All critical actions validate tenant/outlet permissions.
- UI is responsive and usable on tablet/mobile.
- No manual sync button is required; realtime status is visible.

## Important Engineering Rules

- Keep code modular and readable.
- Use TypeScript strictly.
- Use Zod validation for all API inputs.
- Use Drizzle migrations.
- Keep Worker code Cloudflare-compatible.
- Recalculate all totals server-side.
- Use optimistic UI carefully with rollback.
- Add audit logs for sensitive operations.
- Do not overbuild offline sync in MVP.
- Do not implement Swiggy/Zomato integrations in MVP; add manual online order source only.
- Keep UI compact and fast.

Start by creating the project structure, package files, wrangler config, shared types, DB schema, and app shell. Then implement modules in the order listed in the acceptance criteria.
