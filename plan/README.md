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
