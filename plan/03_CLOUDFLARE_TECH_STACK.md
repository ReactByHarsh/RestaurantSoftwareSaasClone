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
