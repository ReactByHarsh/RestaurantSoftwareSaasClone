# All-in-One Restaurant SaaS Cloudflare Blueprint

This is a combined single Markdown file containing all separate planning files. You can paste this entire file into an AI IDE or keep the separate files for cleaner implementation.



---

# Included File: README.md

# Restaurant SaaS Cloudflare Plan — File Guide

This folder contains a complete implementation brief for building a Petpooja/FoodKart-style restaurant management SaaS as a fast single-page application on Cloudflare.

## Files

1. `01_MASTER_PLAN.md` — overall SaaS vision, competitor analysis, MVP scope, modules, roadmap, pricing, and sync decision.
2. `02_UI_UX_SPEC.md` — complete compact UI/UX specification for billing, tables, captain, kitchen, admin, reports, and mobile/tablet views.
3. `03_CLOUDFLARE_TECH_STACK.md` — best Cloudflare-first architecture, performance plan, services, auth, realtime, offline strategy, deployment.
4. `04_PROJECT_STRUCTURE_DATABASE_API.md` — folder structure, database schema, API contracts, role permissions, events, and state model.
5. `05_AI_IDE_IMPLEMENTATION_PROMPT.md` — paste-ready master prompt for Codex / AI IDE to build the project.
6. `06_MVP_TASKS_AND_ACCEPTANCE.md` — task checklist with acceptance criteria so implementation stays focused.

## Recommended Build Direction

Build a web-first PWA SaaS, not a heavy desktop app.

- Frontend: React + Vite + TypeScript + Tailwind + Radix/shadcn-style components.
- Backend: Cloudflare Workers + Hono.
- Database: Cloudflare D1 + Drizzle ORM.
- Realtime: Durable Objects + WebSockets per outlet.
- Storage: R2 for receipts, exports, logos, menu images.
- Cache/settings: KV for menu/settings snapshots.
- Async jobs: Queues for receipts, reports, webhook retries.
- Deployment: Cloudflare Workers Static Assets or Cloudflare Pages + Workers API.

## Key Product Decision

Do not build a manual “sync” button for MVP. Build automatic realtime sync between Counter, Captain, Kitchen, and Admin screens. Add offline-first sync only after the core online flow is stable.



---

# Included File: 01_MASTER_PLAN.md

# Restaurant Management SaaS — Master Product Plan

## 1. Product Goal

Build a fast, simple, compact, browser-based restaurant SaaS inspired by tools like Petpooja, FoodKart/ZenPOS, Restroworks/POSist, SlickPOS, UrbanPiper-style online order management, and modern kitchen display systems.

The product should run as a single-page application where users click buttons/tabs and the working area changes instantly without page reloads.

The SaaS must support these restaurant operations:

- Counter billing
- Table/floor management
- Captain/waiter ordering
- Kitchen Order Ticket/KOT routing
- Kitchen display screen
- Cook/chef order status updates
- Admin dashboard
- Owner reports
- Menu management
- Tax/discount/charges
- Inventory basics
- Staff roles and permissions
- Customer history
- Receipt printing/export
- Multi-outlet support later

## 2. What Existing Restaurant SaaS Products Teach Us

### Petpooja-style learnings

Important features to copy conceptually, not visually:

- Very fast billing flow, ideally 2–3 clicks for common actions.
- Billing, table management, KOT generation, split/merge bills, discounts, and coupons must be tightly connected.
- Multi-terminal/counter billing should sync to a master outlet state.
- KOT should support station-wise routing, for example food counter, beverage counter, dessert counter.
- Captain app should let staff take orders from tables and send them to POS/KOT.
- Kitchen display should show dine-in and online orders, let staff mark items ready, and reduce paper KOT dependency.
- Offline support is useful but not mandatory for MVP if the first target is cloud-first restaurants with stable internet.

### Restroworks/POSist-style learnings

Important enterprise patterns:

- Front of house, back of house, kitchen suite, insights, and digital ordering should be treated as separate modules.
- Multi-outlet and franchise control matters later.
- Strong reporting and owner visibility are selling points.
- Chains need centralized menu, outlet-level pricing, user rights, audit logs, and anti-theft controls.

### UrbanPiper-style learnings

Important delivery-order pattern:

- Delivery aggregator integrations are complex and should not be MVP.
- The product should be designed so Swiggy/Zomato/aggregator integrations can be added later.
- For MVP, add a manual “Online Order” source field so restaurant staff can enter orders from Swiggy/Zomato manually.

### Toast/Hike POS/KDS-style learnings

Important UX and operational patterns:

- Table layout should allow floor creation, table status, and starting orders directly from the table view.
- Kitchen display should update in realtime when counter/captain changes an order.
- Kitchen staff should see prep time, item quantity, modifiers, table number, waiter/captain, and order age.
- Kitchen can mark individual items as Preparing, Ready, Served, or Cancelled.

## 3. Target Users

### Restaurant Owner

Wants:

- Daily sales
- Item-wise sales
- Staff-wise activity
- Cash/UPI/card collection
- Expenses
- Discounts given
- Cancelled/void orders
- Inventory consumption

### Manager/Admin

Wants:

- Manage tables, menu, staff, tax, discounts
- Check live running orders
- Close day and export reports
- Resolve disputes

### Counter Staff/Cashier

Wants:

- Fast billing
- Search menu quickly
- Add items in one tap
- Print KOT
- Print bill
- Accept payment
- Split/merge bills

### Captain/Waiter

Wants:

- Mobile/tablet table order screen
- Quick add items
- Modifiers and notes
- Send KOT
- Ask for bill
- Mark table service status

### Cook/Chef/Kitchen Staff

Wants:

- Large, clear KOT display
- Orders grouped by station
- Item notes and modifiers visible
- Timer/order age
- Mark ready
- Avoid confusion and repeated shouting

## 4. SaaS Name Placeholder

Use placeholder name: `RestroFlow Cloud`.

Codex can replace it later.

## 5. Core Product Principle

The entire SaaS should feel like this:

> Open app → select outlet → choose role screen → work immediately.

No unnecessary heavy dashboard first. The first screen after login should depend on role:

- Cashier → Billing screen
- Captain → Tables/Captain screen
- Kitchen → KDS screen
- Manager → Live operations screen
- Owner → Dashboard/reports screen

## 6. MVP Modules

### Must-have MVP

1. Authentication and tenant/outlet setup
2. Role-based access
3. Menu categories and items
4. Modifiers/add-ons
5. Table/floor layout
6. Order creation
7. KOT creation
8. Realtime kitchen display
9. Billing and payment
10. Receipt print view
11. Day close summary
12. Basic sales reports
13. Basic inventory items and stock adjustments
14. Settings for GST/tax/service charges
15. Audit logs

### Phase 2

1. Customer CRM
2. Loyalty wallet/points
3. Discounts/coupons
4. QR scan ordering
5. Online ordering website
6. Printer integration helper
7. Offline-first mode with local queue
8. Multi-outlet dashboard
9. Purchase and vendor management
10. Expense tracking

### Phase 3

1. Swiggy/Zomato/UrbanPiper-like integrations
2. Recipe-level inventory auto deduction
3. Central kitchen
4. Franchise controls
5. Advanced analytics
6. AI item recommendations
7. Voice order entry
8. Self-service kiosk
9. WhatsApp receipts/marketing
10. Accounting integrations

## 7. MVP Navigation

Use a left compact sidebar on desktop/tablet and bottom navigation on mobile.

Main tabs:

1. Billing
2. Tables
3. Captain
4. Kitchen
5. Orders
6. Menu
7. Inventory
8. Customers
9. Reports
10. Admin
11. Settings

Important: This is still one SPA. Tabs should switch components/views without full reload.

## 8. Recommended “Single Page App” Layout

```txt
+--------------------------------------------------------------------------------+
| Top Bar: Outlet | Shift | User | Online status | Sync/Realtime status | Search |
+--------------------+-----------------------------------------------------------+
| Compact Sidebar    | Main Work Area                                            |
| Billing            |                                                           |
| Tables             | The active module renders here instantly                  |
| Captain            |                                                           |
| Kitchen            |                                                           |
| Orders             |                                                           |
| Menu               |                                                           |
| Inventory          |                                                           |
| Reports            |                                                           |
| Admin              |                                                           |
| Settings           |                                                           |
+--------------------+-----------------------------------------------------------+
```

## 9. FoodKart “Sync” Option — Do We Need It?

For MVP: **No manual sync button is required.**

Reason:

- If the system is cloud-first and all devices are connected to the internet, orders should sync automatically through the backend.
- Counter, Captain, Kitchen, and Admin should receive realtime events using WebSockets.
- A visible status indicator is still needed: `Live`, `Reconnecting`, `Offline`, `Pending local changes`.

Add manual sync only if you implement true offline-first operation where devices can create orders without internet.

Recommended approach:

### MVP online-first

- No manual sync button.
- Use realtime WebSocket updates.
- Add auto reconnect.
- Add “last updated 2 sec ago” indicator.

### Later offline-first

- Store pending orders in IndexedDB.
- Queue mutations locally.
- Auto-sync when online.
- Show conflict warnings if table/order changed on another device.
- Add optional “Retry sync now” button, not a main workflow button.

## 10. Performance Goal

Target performance:

- App shell load: under 2 seconds on 4G after first visit.
- Repeat app open: under 1 second due to PWA caching.
- Add item to order: instant local UI update under 100 ms.
- KOT appears on kitchen screen: usually under 1 second on stable internet.
- Billing screen item search: under 100 ms using local menu cache.
- No page reload when switching modules.

## 11. Why Cloudflare Is Suitable

Cloudflare is a good fit because this SaaS needs:

- Very fast static frontend delivery.
- Lightweight APIs.
- Global/edge deployment.
- Realtime coordination per restaurant outlet.
- Low operational overhead.
- Serverless scaling.

Use Cloudflare Workers for APIs, D1 for SQL data, Durable Objects for realtime outlet state, R2 for storage, KV for cached settings/menu snapshots, and Queues for background jobs.

## 12. Major Product Screens

### Billing Screen

Purpose: fastest counter operation.

Sections:

- Left: categories and menu items
- Center: current order/cart
- Right: table/customer/payment/KOT actions
- Top: search, order type, waiter, table, status

Critical actions:

- New order
- Select table
- Add item
- Add modifier/note
- Quantity + / -
- Send KOT
- Print KOT
- Settle bill
- Split bill
- Merge table
- Apply discount
- Void/cancel with reason

### Table/Floor Screen

Purpose: live restaurant map.

Table statuses:

- Available
- Occupied
- KOT sent
- Preparing
- Ready
- Bill requested
- Payment pending
- Reserved
- Dirty/cleaning

### Captain Screen

Purpose: mobile/tablet order-taking.

Features:

- Assigned table list
- Search items
- Quick category chips
- Add notes/modifiers
- Send KOT
- Request bill
- See kitchen readiness

### Kitchen Screen/KDS

Purpose: chef order flow.

Features:

- Orders grouped by station
- Color/status by age
- Item modifiers visible
- Table/order source visible
- Mark Preparing
- Mark Ready
- Mark Item Served
- Filter by station

### Admin Screen

Purpose: control setup.

Features:

- Staff roles
- Menu
- Taxes
- Charges
- Tables/floors
- Printers
- Outlet settings
- Audit logs

### Reports Screen

Purpose: owner visibility.

MVP reports:

- Today sales
- Payment mode collection
- Category sales
- Item sales
- Table turnover
- Staff order count
- Cancelled/voided items
- Discounts
- Day close

## 13. Business Model

Possible pricing for Indian market:

### Starter

- ₹799–₹1,499/month/outlet
- Billing, tables, KOT, reports
- 3 users
- 1 KDS screen

### Growth

- ₹1,999–₹3,999/month/outlet
- Captain app
- Inventory
- Customer CRM
- Discounts
- More users

### Pro

- ₹4,999–₹9,999/month/outlet
- Multi-outlet
- Advanced analytics
- Loyalty
- Online ordering
- Integrations

### Enterprise

- Custom pricing
- Chains, franchises, central kitchen, API, dedicated support

## 14. Competitive Differentiation

Focus on:

1. Very simple compact UX.
2. Browser/PWA-first, works on Android tablets, phones, desktops.
3. Fast Cloudflare architecture.
4. No bulky installation for basic use.
5. Easy onboarding for small restaurants.
6. Clean role-based screens instead of one overloaded system.
7. Affordable pricing.
8. Later: hybrid offline mode.

## 15. Implementation Priorities

Build in this order:

1. Project setup and UI shell
2. Auth, tenants, outlets, roles
3. Menu/category/item management
4. Table/floor management
5. Billing order/cart screen
6. Order and KOT backend
7. Realtime outlet events with Durable Objects
8. Kitchen display screen
9. Payment settlement and receipt
10. Reports and day close
11. Inventory basics
12. PWA caching and polish

## 16. Non-Negotiable Rules for AI IDE

- Keep UI simple, compact, and touch-friendly.
- Do not overbuild enterprise features before MVP works.
- Every API must enforce tenant/outlet access.
- Every critical action must create an audit log.
- Do not use Node-only libraries that fail on Cloudflare Workers.
- Use optimistic UI only where rollback is handled.
- Keep billing screen extremely fast.
- Avoid heavy animation.
- Avoid massive component libraries.
- Store money in paise/cents as integers.
- Use UTC timestamps in database; display local time in UI.
- Never trust client-calculated totals; backend recalculates.

## 17. References Used For Planning

- Petpooja restaurant POS/billing features: https://www.petpooja.com/poss
- Petpooja restaurant billing software: https://www.petpooja.com/poss/restaurant-billing-software
- Petpooja Captain Ordering App: https://www.petpooja.com/poss/captain-ordering-app
- Petpooja Kitchen Display System: https://www.petpooja.com/poss/kitchen-display-system
- Restroworks restaurant management platform: https://www.restroworks.com/
- UrbanPiper delivery order integrations: https://www.urbanpiper.com/
- Toast KDS guide: https://doc.toasttab.com/doc/platformguide/platformKDSOverview.html
- Hike POS table layout/KDS guide: https://help.hikeup.com/portal/en/kb/articles/table-layout-kitchen-display-in-hike-pos
- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Cloudflare storage options: https://developers.cloudflare.com/workers/platform/storage-options/
- Cloudflare Durable Objects docs: https://developers.cloudflare.com/durable-objects/



---

# Included File: 02_UI_UX_SPEC.md

# UI/UX Specification — Compact Restaurant SaaS SPA

## 1. UX Direction

Design a compact, fast, easy restaurant operations UI for cashiers, captains, kitchen staff, managers, and owners.

The UI should feel like a professional restaurant POS, not like a generic admin dashboard.

Core UX words:

- Fast
- Compact
- Touch-friendly
- Clear
- Low training
- Real-time
- Minimal clicks
- High contrast
- No clutter

## 2. Device Targets

### Primary

- Android tablet at counter
- Desktop/laptop at counter/admin
- Kitchen display monitor/tablet
- Captain Android phone/tablet

### Responsive breakpoints

- Mobile: 360–767 px
- Tablet: 768–1199 px
- Desktop: 1200+ px

## 3. Visual Style

Use clean SaaS design with a restaurant POS feel.

Recommended palette:

```txt
Background:      #F8FAFC
Surface:         #FFFFFF
Surface muted:   #F1F5F9
Primary:         #0F766E  (teal)
Primary dark:    #115E59
Accent:          #F59E0B  (amber for active food/order actions)
Danger:          #DC2626
Success:         #16A34A
Warning:         #D97706
Text:            #0F172A
Text muted:      #64748B
Border:          #E2E8F0
```

Dark mode can be added later for kitchen display.

## 4. Typography

Use system fonts for performance:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

If using external font, self-host it, do not block app load.

## 5. Layout Shell

### Desktop/tablet shell

```txt
+--------------------------------------------------------------------------------+
| Top Bar                                                                        |
| Logo | Outlet | Shift | Search | Live Status | User | Quick Actions           |
+-------------+------------------------------------------------------------------+
| Sidebar     | Active Screen                                                     |
| Billing     |                                                                  |
| Tables      |                                                                  |
| Captain     |                                                                  |
| Kitchen     |                                                                  |
| Orders      |                                                                  |
| Menu        |                                                                  |
| Inventory   |                                                                  |
| Reports     |                                                                  |
| Admin       |                                                                  |
| Settings    |                                                                  |
+-------------+------------------------------------------------------------------+
```

### Mobile shell

```txt
+------------------------------------------------+
| Top Bar: Outlet + Live Status + User           |
+------------------------------------------------+
| Active Screen                                  |
+------------------------------------------------+
| Bottom Nav: Billing | Tables | Kitchen | More  |
+------------------------------------------------+
```

## 6. Top Bar Requirements

Top bar must show:

- Current outlet
- Active shift
- Current user/role
- Realtime status: Live / Reconnecting / Offline
- Current business date
- Quick command/search box

Quick actions:

- New Bill
- New Table Order
- Open KDS
- Day Close

## 7. Sidebar Requirements

Sidebar should be icon + label.

Collapsed width: 64 px.
Expanded width: 180 px.

Main items:

1. Billing
2. Tables
3. Captain
4. Kitchen
5. Orders
6. Menu
7. Inventory
8. Customers
9. Reports
10. Admin
11. Settings

Use role-based visibility.

Cashier sees: Billing, Tables, Orders, Customers.
Captain sees: Captain, Tables, Orders.
Kitchen sees: Kitchen only.
Manager sees: all operational tabs.
Owner sees: Dashboard, Reports, Admin, Settings.

## 8. Billing Screen UI

### Purpose

This is the most important screen. It must be extremely fast.

### Layout

```txt
+--------------------------------------------------------------------------------+
| Billing Top: Dine-in | Takeaway | Delivery | Table | Customer | Search          |
+----------------------+--------------------------------+------------------------+
| Category List        | Menu Grid                      | Current Order          |
| Starters             | [Paneer Tikka] [Tea] [Dosa]   | Table A4               |
| Main Course          | [Coffee] [Burger] [Biryani]   | Items                  |
| Beverages            |                                | Qty +/-                |
| Desserts             |                                | Notes                  |
|                      |                                | Subtotal/Tax/Total     |
+----------------------+--------------------------------+------------------------+
| Bottom Actions: Hold | Send KOT | Print KOT | Discount | Settle | Print Bill       |
+--------------------------------------------------------------------------------+
```

### Billing UX rules

- Menu item cards must be large enough for touch.
- Show category chips horizontally on mobile.
- Search should focus with `/` keyboard shortcut.
- Quantity change should require one tap.
- Modifier/note dialog should be quick.
- Send KOT must be prominent.
- Settle bill must be visually separate from KOT.
- Cancel/Void must require reason and manager PIN.

### Menu item card

Display:

- Item name
- Price
- Veg/non-veg marker if enabled
- Short availability state: Available / 86 / Low stock

### Cart item row

Display:

- Item name
- Variant/modifiers
- Quantity controls
- Item note
- Price
- Remove button

## 9. Table/Floor Screen UI

### Purpose

Show live status of restaurant tables.

### Layout

```txt
+--------------------------------------------------------------------------------+
| Floor Tabs: Ground | AC Hall | Rooftop | Family Room                            |
+--------------------------------------------------------------------------------+
| [T1 Available] [T2 Occupied 12m] [T3 KOT Sent] [T4 Ready] [T5 Bill Requested]   |
| [T6 Payment Due] [T7 Reserved] [T8 Dirty]                                      |
+--------------------------------------------------------------------------------+
| Right Drawer on table click:                                                    |
| Table info, active order, captain, KOT status, total, actions                   |
+--------------------------------------------------------------------------------+
```

### Table statuses

- Available: white/gray
- Occupied: blue
- KOT sent: amber
- Preparing: orange
- Ready: green
- Bill requested: purple
- Payment pending: red
- Reserved: cyan
- Dirty: gray striped

### Table actions

- Start order
- Add items
- Send KOT
- Print bill
- Settle payment
- Transfer table
- Merge tables
- Split bill
- Mark dirty/clean

## 10. Captain Screen UI

### Purpose

Fast mobile/tablet table-side ordering.

### Layout

```txt
+------------------------------------------------+
| Captain: Assigned Tables | Search              |
+------------------------------------------------+
| Table Cards: A1, A2, B4, C3                    |
+------------------------------------------------+
| Selected Table                                 |
| Category chips                                 |
| Item list                                      |
| Current order drawer                           |
+------------------------------------------------+
| Send KOT | Request Bill                        |
+------------------------------------------------+
```

### Captain rules

- Optimized for one-hand mobile use.
- Large touch targets.
- Minimal typing.
- Recent/frequent items at top.
- Notes via quick tags: Less Spicy, No Onion, Jain, Extra Cheese, Parcel.
- Captain cannot settle payment unless permission enabled.

## 11. Kitchen Display/KDS UI

### Purpose

Replace paper KOT confusion with real-time display.

### Layout

```txt
+--------------------------------------------------------------------------------+
| KDS Top: Station filter | All / New / Preparing / Ready | Fullscreen | Sound     |
+--------------------------------------------------------------------------------+
| KOT Card 1              | KOT Card 2                    | KOT Card 3             |
| Table A4                | Takeaway #18                  | Delivery Manual #21    |
| 12:34 PM | 8 min age    | 12:36 PM | 6 min age            | 12:39 PM | 3 min age |
| 2x Paneer Tikka         | 1x Coffee                     | 1x Biryani             |
| Note: Less spicy        |                              | Note: No onion         |
| [Preparing] [Ready]     | [Preparing] [Ready]           | [Preparing] [Ready]    |
+--------------------------------------------------------------------------------+
```

### KDS rules

- Use large font.
- No tiny admin details.
- Show order age clearly.
- New orders should have sound/visual pulse.
- Allow station filtering.
- Allow item-level ready marking.
- Fullscreen mode is required.
- Kitchen staff should not see money totals unless permission enabled.

## 12. Orders Screen UI

Purpose: searchable history and live order control.

Filters:

- Running
- KOT sent
- Preparing
- Ready
- Billed
- Paid
- Cancelled
- Today
- Date range
- Order type
- Staff

Order row:

- Order number
- Table/source
- Customer
- Status
- Amount
- Payment status
- Time
- Staff

## 13. Menu Management UI

### Layout

```txt
+--------------------------------------------------------------------------------+
| Menu Top: Search | Add Item | Import | Export | Availability Mode             |
+-------------------+------------------------------------------------------------+
| Categories        | Item Table / Cards                                           |
| Starters          | Item | Price | Tax | Category | Available | Actions          |
| Mains             |                                                              |
+-------------------+------------------------------------------------------------+
```

### Item fields

- Name
- Category
- Price
- Tax slab
- Item type: veg/non-veg/egg/other
- SKU/code
- Availability
- Preparation station
- Modifiers/add-ons
- Image optional
- Description optional

## 14. Inventory UI

MVP inventory should be simple.

Screens:

- Stock items
- Stock adjustments
- Low stock alerts
- Purchase entries later
- Recipe mapping later

Stock item fields:

- Name
- Unit
- Current stock
- Minimum stock
- Cost per unit
- Supplier optional

## 15. Reports UI

Owner/manager dashboard cards:

- Today sales
- Orders count
- Average order value
- Payment mode split
- Top 5 selling items
- Open tables
- Cancelled amount
- Discounts

Charts can be simple. Do not overuse charts in MVP.

## 16. Admin UI

Admin tabs:

- Staff/users
- Roles/permissions
- Floors/tables
- Taxes/charges
- Printer settings
- Outlet settings
- Audit logs
- Subscription/billing later

## 17. Forms and Modals

Rules:

- Use drawer for large edit forms.
- Use modal for confirmation.
- Keep delete/cancel actions protected.
- For manager approval, use PIN modal.
- Always show success/error toast.

## 18. Keyboard Shortcuts

Desktop billing shortcuts:

```txt
/        Focus search
F2       New order
F4       Send KOT
F6       Print bill
F8       Settle payment
Esc      Close drawer/modal
+        Increase selected item quantity
-        Decrease selected item quantity
Ctrl+K   Command palette
```

## 19. Empty States

Examples:

- No menu items: “Add your first menu item to start billing.”
- No running orders: “No active orders right now.”
- Kitchen no orders: “Kitchen is clear.”
- No tables: “Create your first floor and table layout.”

## 20. Error States

Realtime failure:

```txt
Reconnecting… Orders are safe. New changes will retry automatically.
```

Offline mode MVP:

```txt
You are offline. Viewing cached data only. New orders are disabled until connection returns.
```

Later offline-first mode:

```txt
Offline mode. 3 changes pending sync.
```

## 21. Accessibility

- Minimum touch target: 44x44 px.
- Clear color + label; do not rely only on color.
- Support keyboard navigation for billing.
- Use aria labels on icon buttons.
- Use high contrast on KDS.

## 22. Component List

Build reusable components:

- AppShell
- SidebarNav
- TopStatusBar
- RoleGuard
- OutletSwitcher
- LiveStatusBadge
- BillingMenuGrid
- CategoryRail
- OrderCart
- CartItemRow
- TableGrid
- TableCard
- KOTCard
- KDSBoard
- PaymentDrawer
- ModifierDialog
- ManagerPinDialog
- DataTable
- ReportCard
- EmptyState
- ConfirmDialog
- ToastProvider

## 23. AI IDE Instructions For UI

Ask AI IDE to build UI in this order:

1. Static app shell with role-based nav.
2. Billing screen mock with local state.
3. Table screen mock with statuses.
4. KDS screen mock with realtime-ready state shape.
5. Admin/menu CRUD UI.
6. Reports UI.
7. Connect to API after UI flow is clean.

## 24. UI Quality Bar

Before backend integration, the UI must satisfy:

- Cashier can create a dummy order in less than 20 seconds.
- Captain can add 3 items to a table in less than 15 seconds.
- Kitchen can mark order ready in one tap.
- Manager can find today's sales in one click.
- No screen feels like a generic spreadsheet unless it is a report/admin table.



---

# Included File: 03_CLOUDFLARE_TECH_STACK.md

# Cloudflare Tech Stack and Architecture

## 1. Final Tech Stack Recommendation

Use this stack:

```txt
Frontend:       React + Vite + TypeScript
Routing:        TanStack Router or React Router
Styling:        Tailwind CSS + Radix UI primitives / shadcn-style components
Icons:          Lucide React
State:          Zustand for UI/session + TanStack Query for server state
Forms:          React Hook Form + Zod
Backend:        Cloudflare Workers + Hono
Database:       Cloudflare D1
ORM:            Drizzle ORM
Realtime:       Cloudflare Durable Objects + WebSockets
Storage:        Cloudflare R2
Cache:          Cloudflare KV
Async jobs:     Cloudflare Queues
Validation:     Zod on API boundaries
Auth:           Custom session auth with HttpOnly cookies + D1 sessions
Deployment:     Cloudflare Workers Static Assets or Pages + Workers API
Testing:        Vitest + Playwright
Lint/format:    ESLint + Prettier
Package mgr:    pnpm
```

## 2. Why This Stack

### React + Vite

Best for a fast single-page POS-style app with tabs and instant screen switching.

### Hono on Cloudflare Workers

Small, fast, TypeScript-friendly API framework that works well in edge/serverless environments.

### D1 + Drizzle

D1 gives SQL structure for restaurant data: tenants, outlets, orders, order items, payments, tables, staff, inventory, etc.

Drizzle gives type-safe migrations and queries.

### Durable Objects

Use one Durable Object instance per outlet for live operational state:

```txt
OutletRealtimeDO: outlet:{outletId}
```

It coordinates:

- Active WebSocket clients
- Live order changes
- Table state broadcasts
- KOT/KDS updates
- Reconnect state snapshots
- Last known live state

### R2

Use for:

- Receipt PDFs/images
- Export files
- Menu item images
- Restaurant logos
- Backups later

### KV

Use for fast read-heavy data:

- Public outlet settings snapshot
- Menu snapshot
- Feature flags
- App config

Do not use KV as the source of truth for orders/payments.

### Queues

Use for non-blocking tasks:

- Email/WhatsApp receipt job
- Report generation
- Webhook retries
- Audit export
- Aggregator integration jobs later

## 3. Cloudflare Performance Expectations

Cloudflare is suitable for this product because Workers can deploy full-stack apps and APIs across Cloudflare's global network with low infrastructure overhead. Workers support frontend static assets, APIs, storage bindings, D1, KV, Queues, and Durable Objects.

Expected strengths:

- Very fast static app shell delivery.
- Low-latency API close to users.
- Serverless scaling.
- Realtime coordination using Durable Objects.
- No VPS maintenance.
- Good for India-focused SaaS if database/realtime placement is planned carefully.

Expected limitations:

- Some Node.js libraries will not work on Workers.
- Long-running CPU-heavy tasks should be moved to queues or external service.
- D1 is excellent for SaaS relational data, but design queries carefully.
- For complex offline desktop-style POS with local hardware printers, a small local helper app may be needed later.

## 4. Recommended Architecture

```txt
Browser/PWA
  |
  | HTTPS API + WebSocket
  v
Cloudflare Worker API (Hono)
  |         |          |           |
  |         |          |           +--> R2: receipts, exports, images
  |         |          +--------------> KV: menu/settings cache
  |         +-------------------------> D1: relational source of truth
  +-----------------------------------> Durable Object per outlet: realtime state
                       |
                       +--> WebSocket broadcast to Billing/Captain/Kitchen/Admin
```

## 5. Realtime Flow

Example: Captain sends order to kitchen.

```txt
Captain app submits order item
  -> Worker validates session, outlet, permissions
  -> Worker writes order/order_items/KOT to D1 transaction
  -> Worker sends event to OutletRealtimeDO
  -> Durable Object broadcasts ORDER_UPDATED + KOT_CREATED
  -> Billing screen updates
  -> Kitchen screen displays KOT
  -> Admin live screen updates table status
```

## 6. Data Ownership

Source of truth:

- D1 is source of truth for persistent data.
- Durable Object is source of truth for active live coordination only.
- KV is cache only.
- Client IndexedDB is cache/pending offline queue only.

## 7. Tenant Model

Use SaaS multi-tenancy:

```txt
Tenant = restaurant brand/company
Outlet = physical restaurant/cloud kitchen branch
User = staff member
Role = owner/admin/manager/cashier/captain/kitchen
```

Every table must include `tenant_id` and usually `outlet_id`.

Every API must verify:

1. User is authenticated.
2. User belongs to tenant.
3. User has access to outlet.
4. User role has permission for action.

## 8. Auth Recommendation

Use custom session auth for first version.

- Store users in D1.
- Password hashing should use a Workers-compatible secure library.
- Store sessions in D1 with hashed session token.
- Use HttpOnly Secure SameSite=Lax cookies.
- Add PIN for quick manager approval and staff switching.

Later options:

- Passkeys
- Google login for owners/admins
- OTP login for staff

## 9. Offline Strategy

### MVP: online-first

- App shell cached using PWA.
- Menu/settings cached locally.
- If offline, show read-only or limited mode.
- New order creation disabled while offline.
- No manual sync button.
- Automatic reconnect.

### Phase 2: offline-first

Use IndexedDB for:

- Menu cache
- Active order drafts
- Pending mutations

Use sync strategy:

```txt
Client creates local mutation
  -> mutation gets client_mutation_id
  -> stored in IndexedDB pending queue
  -> UI shows pending state
  -> when online, sync queue to Worker
  -> Worker checks idempotency
  -> Worker writes to D1
  -> Durable Object broadcasts confirmed event
  -> client marks local mutation synced
```

Conflict handling:

- Table/order version number.
- If server version changed, show conflict dialog.
- For payments, never allow offline settlement in MVP.

## 10. Printing Strategy

Browser printing is enough for MVP.

MVP:

- Receipt print page using `window.print()`.
- KOT print page using `window.print()`.
- Print-friendly CSS.

Phase 2:

- Local printer helper app for ESC/POS thermal printers.
- WebUSB/WebSerial optional where supported.
- Print queue and station printer mapping.

## 11. API Style

Use REST for simplicity.

Base path:

```txt
/api/v1
```

Examples:

```txt
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/me
GET    /api/v1/outlets/:outletId/menu
POST   /api/v1/outlets/:outletId/orders
PATCH  /api/v1/outlets/:outletId/orders/:orderId
POST   /api/v1/outlets/:outletId/orders/:orderId/kot
POST   /api/v1/outlets/:outletId/orders/:orderId/payments
GET    /api/v1/outlets/:outletId/reports/today
GET    /api/v1/outlets/:outletId/live/ws
```

## 12. WebSocket Event Names

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
USER_ACTIVITY
DAY_CLOSED
```

## 13. Durable Object Design

Create one DO class:

```txt
OutletRealtimeDO
```

Responsibilities:

- Accept WebSocket connections.
- Authenticate connection using short-lived token.
- Track connected clients by role/device.
- Broadcast outlet events.
- Store recent event buffer for reconnect.
- Provide current live state snapshot.

Do not store all historical orders only in Durable Object. Persist to D1.

## 14. D1 Database Design Principles

- Use integer IDs or cuid/ulid strings.
- Store money as integer paise.
- Use UTC timestamps.
- Use `version` columns for optimistic concurrency.
- Use soft deletes for critical business records.
- Add audit logs for sensitive actions.
- Add indexes on `tenant_id`, `outlet_id`, `created_at`, `status`.

## 15. Security Checklist

- HttpOnly session cookies.
- CSRF protection for cookie-based mutation routes.
- Rate limit login attempts.
- Tenant isolation on every query.
- Manager PIN for voids/refunds/discount override.
- Audit log for:
  - login
  - order cancellation
  - item void
  - discount
  - payment settlement
  - day close
  - settings changes
- Never trust client totals.
- Recalculate bill on server.
- Validate all inputs with Zod.
- Apply Cloudflare Turnstile on public signup/login if needed.

## 16. Caching Strategy

### Cache aggressively

- App shell JS/CSS/images
- Static assets
- Icons
- Menu snapshots
- Outlet settings

### Do not cache incorrectly

- Active orders
- Payments
- Reports requiring real-time accuracy
- Authenticated user permissions unless short TTL

## 17. Performance Optimization

Frontend:

- Code split admin/reports screens.
- Keep billing screen bundle small.
- Use virtualized lists only if menu/report list becomes large.
- Cache menu in memory and IndexedDB.
- Use optimistic UI for adding items, but reconcile with server.
- Minimize rerenders in cart.

Backend:

- Use D1 prepared statements.
- Batch writes where possible.
- Keep Worker CPU work short.
- Use Durable Object for realtime coordination.
- Use Queues for long tasks.
- Add indexes.

## 18. Deployment Plan

### Local development

```bash
pnpm install
pnpm dev
pnpm db:generate
pnpm db:migrate:local
```

### Cloudflare deployment

```bash
pnpm cf:login
pnpm db:create
pnpm db:migrate:prod
pnpm deploy
```

Use Wrangler configuration for:

- D1 binding
- Durable Object binding
- KV namespace
- R2 bucket
- Queue binding
- Environment variables

## 19. Recommended Repo Setup

Use a monorepo:

```txt
apps/web       React SPA
apps/api       Worker API if separated
packages/db    Drizzle schema and migrations
packages/shared shared types and Zod schemas
packages/ui     reusable UI components
```

For simplicity, first MVP can be one Worker project serving both static assets and API.

## 20. What Not To Use Initially

Avoid for MVP:

- Electron desktop app
- Heavy Next.js server features
- Complex microservices
- Kubernetes
- Separate PostgreSQL unless Cloudflare D1 limits become a real issue
- Native Android app before PWA is proven
- Offline-first before online flow is stable
- Aggregator integrations before internal order flow works

## 21. Cloudflare Services Mapping

```txt
Frontend SPA          -> Workers Static Assets / Pages
API routes            -> Workers + Hono
SQL data              -> D1
Realtime outlet state -> Durable Objects + WebSockets
Cached menu/settings  -> KV
Images/exports        -> R2
Async jobs            -> Queues
Scheduled tasks       -> Cron Triggers / Workflows later
Bot protection        -> Turnstile
Observability         -> Workers Logs + Analytics
```

## 22. Final Architecture Decision

Build a Cloudflare-first online SaaS PWA.

Manual sync button is not needed in MVP. The system should show realtime status and sync automatically. Add proper offline sync only after the product is stable and actual restaurants demand it.



---

# Included File: 04_PROJECT_STRUCTURE_DATABASE_API.md

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



---

# Included File: 05_AI_IDE_IMPLEMENTATION_PROMPT.md

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



---

# Included File: 06_MVP_TASKS_AND_ACCEPTANCE.md

# MVP Tasks and Acceptance Criteria

## Phase 0 — Project Foundation

### Tasks

- Create monorepo.
- Configure pnpm workspaces.
- Configure TypeScript.
- Configure Vite React app.
- Configure Worker + Hono.
- Configure Tailwind.
- Configure Drizzle.
- Configure Wrangler.
- Add D1, KV, R2, Queue, Durable Object bindings.
- Add `.env.example`.

### Acceptance

- `pnpm install` works.
- `pnpm dev` starts frontend/API locally.
- Worker deploy config exists.
- TypeScript has no errors.

## Phase 1 — Shared Types and Database

### Tasks

- Add shared constants.
- Add permission map.
- Add Zod schemas.
- Add Drizzle schema.
- Add migrations.
- Add seed script.

### Acceptance

- Local D1 migration runs.
- Seed data creates demo tenant, users, menu, floors, and tables.
- Types are shared between frontend and backend.

## Phase 2 — Auth and Roles

### Tasks

- Login API.
- Logout API.
- Session cookie.
- Session middleware.
- User/outlet access middleware.
- Permission middleware.
- Login screen.
- Outlet selection.
- Role-based navigation.

### Acceptance

- Demo users can log in.
- Kitchen role only sees kitchen.
- Cashier sees billing/tables/orders.
- Owner sees reports/admin/settings.
- Protected APIs reject unauthenticated requests.

## Phase 3 — App Shell UI

### Tasks

- AppShell.
- SidebarNav.
- Mobile bottom nav.
- TopStatusBar.
- LiveStatusBadge.
- Empty states.
- Responsive layout.

### Acceptance

- Switching tabs does not reload page.
- Layout works on mobile, tablet, desktop.
- Live/reconnect/offline status has UI placeholder.

## Phase 4 — Menu Management

### Tasks

- Menu category CRUD.
- Menu item CRUD.
- Availability toggle.
- Tax field.
- Station field.
- Menu API.
- Menu cache client side.

### Acceptance

- Admin can create/edit categories and items.
- Billing screen receives menu.
- Item availability affects billing screen.

## Phase 5 — Tables/Floors

### Tasks

- Floor CRUD.
- Table CRUD.
- Table status display.
- Start order from table.
- Table drawer.

### Acceptance

- Manager can create floors/tables.
- Cashier can start order from table.
- Active order changes table status.

## Phase 6 — Billing MVP

### Tasks

- Billing screen layout.
- Category rail.
- Menu grid.
- Item search.
- Current order cart.
- Quantity controls.
- Notes/modifiers placeholder.
- Create order API.
- Add item API.
- Server-side total calculation.

### Acceptance

- Cashier can create dine-in/takeaway order.
- Cashier can add/remove/update items.
- Totals are calculated by server.
- UI remains fast.

## Phase 7 — KOT and Kitchen Display

### Tasks

- Send KOT API.
- KOT tables.
- KOT item statuses.
- Kitchen screen.
- KOT cards.
- Station filter.
- Mark preparing/ready.

### Acceptance

- Cashier/captain can send KOT.
- KDS displays KOT.
- Kitchen can mark item/order ready.
- Order/table status updates.

## Phase 8 — Realtime Durable Object

### Tasks

- OutletRealtimeDO.
- WebSocket connection.
- Short-lived WS token.
- Broadcast events.
- Client realtime hook.
- Reconnect logic.
- Event handling in Billing/Tables/Kitchen.

### Acceptance

- Billing creates KOT; Kitchen receives it without refresh.
- Kitchen marks ready; Billing/Tables update without refresh.
- Reconnect status is visible.
- Manual sync button is not needed.

## Phase 9 — Payment and Receipts

### Tasks

- Payment drawer.
- Cash/UPI/card/split payment.
- Payment API.
- Bill status.
- Receipt print page.
- Print CSS.
- Payment audit logs.

### Acceptance

- Cashier can settle bill.
- Paid order cannot be edited normally.
- Receipt is printable.
- Payment mode appears in report.

## Phase 10 — Reports

### Tasks

- Today sales summary.
- Payment mode split.
- Item sales.
- Cancelled/void report.
- Day close placeholder.

### Acceptance

- Owner/manager can view today sales.
- Report numbers match settled payments.
- Cash/UPI/card split is visible.

## Phase 11 — Inventory Basics

### Tasks

- Inventory items CRUD.
- Stock adjustment.
- Low stock alert.
- Stock movement history.

### Acceptance

- Admin can add stock items.
- Admin can adjust stock.
- Low stock items are visible.

## Phase 12 — Security and Audit

### Tasks

- CSRF protection.
- Rate limit login.
- Manager PIN checks.
- Audit logs.
- Tenant isolation tests.
- Server-side total validation.

### Acceptance

- Cross-tenant access is impossible.
- Sensitive actions create audit logs.
- Discounts/voids need correct permissions.

## Phase 13 — PWA and Performance

### Tasks

- App manifest.
- Service worker/static cache.
- Cache menu/settings.
- Code splitting.
- Lighthouse check.
- Basic offline read-only page.

### Acceptance

- App can be installed on Android.
- Repeat load is fast.
- Offline state is clear.
- Billing screen remains responsive.

## Phase 14 — Deployment

### Tasks

- Cloudflare resources created.
- Production D1 migration.
- R2 bucket configured.
- KV namespace configured.
- Queue configured.
- Durable Object migration configured.
- Deploy Worker/app.

### Acceptance

- Production URL works.
- Login works in production.
- Realtime works in production.
- D1 data persists.

## Final MVP Demo Script

1. Login as cashier.
2. Open Billing.
3. Select Dine-in and Table G1.
4. Add Paneer Tikka, Butter Naan, Coffee.
5. Send KOT.
6. Open Kitchen in another browser/device.
7. Confirm KOT appears instantly.
8. Mark order Preparing.
9. Mark order Ready.
10. Billing/Tables update live.
11. Settle bill with Cash + UPI split.
12. Print receipt.
13. Login as owner.
14. View today sales report.

## Definition of Done

The SaaS MVP is done only when:

- It works on Cloudflare.
- It is fast on tablet/mobile.
- It supports role-based screens.
- It has billing, tables, KOT, KDS, payments, reports.
- It has automatic realtime updates.
- It protects tenant/outlet data.
- It has a clean compact UI.
- It avoids unnecessary manual sync complexity in MVP.

