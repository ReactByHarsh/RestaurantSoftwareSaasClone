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
