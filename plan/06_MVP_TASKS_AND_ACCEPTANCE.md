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
