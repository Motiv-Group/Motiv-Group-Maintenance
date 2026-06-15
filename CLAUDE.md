# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Motiv** — a mobile-first maintenance ticketing and quoting platform for the South African market. Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres, Auth, Storage, Realtime). A Capacitor Android wrapper points at the deployed Vercel site (`capacitor.config.ts`'s `server.url`), so it is not a normal offline-bundled native app.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000; use your LAN IP to test on mobile)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (next/core-web-vitals config)
- `npx tsc --noEmit` — type-check without emitting

There is no test suite in this repo.

### Database migrations

Migrations live in `supabase/migrations/` but are **not** applied via Supabase CLI — they're run manually by pasting into the Supabase SQL Editor (per README). Numbering is not strictly sequential/unique (multiple `002_*.sql` files exist) — check file contents and git history to determine actual apply order, and don't assume the prefix number reflects when it should run. When adding a new migration, give it a clearly-later/unique name and keep it idempotent where practical.

## Architecture

### Roles & route protection

Four roles drive everything: `client` / `store_manager` (treated identically — see `isStoreManager()` in `lib/types.ts`), `regional_manager`, and `supplier` (the contractor/maintenance-company side; this role was formerly named `admin`). `middleware.ts` is the single gate for route access:

- `/client/*` → `client` or `store_manager`
- `/regional/*` → `regional_manager`
- `/supplier/*` → `supplier`
- `/settings*` → any authenticated user
- Logged-in users hitting `/auth/login` or `/auth/signup` are redirected to their role's home (`/client`, `/supplier`, or `/regional`)

> Note: the service-role Supabase client is still `createAdminClient()`/`adminClient` — that's infrastructure (RLS bypass), unrelated to the `supplier` role. The DB FK columns `quotes.admin_id` / `completions.admin_id` keep their names too and reference the supplier. The `supplier` role manages a directory of trade companies shown in the UI as **"Sub Suppliers"** (the `suppliers` table) — distinct from the role itself.

Each role has its own top-level `app/<role>/layout.tsx` defining nav links (`Navbar` + `BottomNav` + `SwipeNav`) and which Supabase tables `RealtimeRefresh` subscribes to for that section.

### Supabase client pattern

Three clients in `lib/supabase/`:
- `client.ts` `createClient()` — browser client for Client Components
- `server.ts` `createClient()` — server client for Server Components/Route Handlers, RLS-bound to the current user's session via cookies
- `server.ts` `createAdminClient()` — service-role client that **bypasses RLS** and disables Next's fetch cache (`cache: 'no-store'`). Use this only for cross-user operations the requesting user shouldn't have direct table access for (e.g. inserting notifications for other users, looking up other users' profiles, push subscription cleanup).

### API route pattern

Route handlers under `app/api/**/route.ts` follow a consistent shape (see `app/api/tickets/route.ts` as the reference example):
1. `createClient()` + `auth.getUser()` → 401 if missing
2. `rateLimit(key, limit, windowMs)` from `lib/rate-limit.ts` for write endpoints (in-memory, per-instance — resets on restart, not shared across instances)
3. Mutate via the user-scoped client (RLS enforced)
4. Switch to `createAdminClient()` to fan out notifications/lookups across other users' rows
5. Insert `notifications` rows AND fire `sendPushToUser`/`sendPushToMany` (`lib/push.ts`, web-push + VAPID, no-ops silently if VAPID env vars are unset)
6. `revalidatePath()` the affected dashboards

### Domain model & ticket flow

Core types in `lib/types.ts`. The ticket lifecycle:

```
open → quoted → accepted → in_progress → pending_sign_off → completed
                     ↓                          ↓
                 declined                 snag / snag_in_progress
also: cancelled (any point)
```

Flow across roles: client submits ticket → admins (and the store's `regional_manager`) get notifications → admin sends a `quote` → client accepts/declines → admin progresses status → admin submits a `completion` (COC + proof-of-completion photos) → regional manager reviews/approves (`pending_sign_off → completed`) or raises a `snag`.

Other tables: `suppliers` (the supplier-role-managed trade directory, shown in the UI as "Sub Suppliers"), `ratings` (clients rate suppliers), `push_subscriptions` (web-push endpoints).

### Shared formatting/labels

`lib/utils.ts` is the single source of truth for ticket status/priority labels and Tailwind color classes (`STATUS_LABELS`, `STATUS_COLORS`, `PRIORITY_LABELS`, `PRIORITY_COLORS`, `QUOTE_STATUS_LABELS`) and locale formatting (`formatCurrency` → ZAR via `en-ZA`, `formatDate`, `formatDateTime`). Reuse these instead of re-deriving labels/colors/locale formats inline.

### PWA / push notifications

The app is a PWA (`public/manifest.json`, `public/sw.js`, `components/ui/ServiceWorkerSetup.tsx`). Push requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env vars; `lib/push.ts` no-ops if these aren't set, so missing push notifications in dev usually means missing VAPID config, not a bug.

### Required environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`, and optionally `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` for push.

## Conventions

- Currency is always ZAR via `formatCurrency`; dates via `formatDate`/`formatDateTime` (`en-ZA` locale).
- Dark mode is class-based (`darkMode: 'class'` in `tailwind.config.ts`); the brand palette is `brand-50..900` (deep navy/gold). A blocking inline script in `app/layout.tsx` sets the `dark` class before paint to avoid theme flash — don't remove it without preserving that behavior.
- Realtime UI updates go through `RealtimeRefresh`, declared per-layout with the table list relevant to that role's pages.
