# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Motiv** — a mobile-first maintenance ticketing and quoting platform for the South African market. Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres, Auth, Storage, Realtime). A Capacitor Android wrapper points at the deployed Vercel site (`capacitor.config.ts`'s `server.url`), so it is not a normal offline-bundled native app.

## Ways of working (standing instructions — apply every session)

1. **Confirm understanding before implementing.** When a task is unclear/ambiguous, or you see a better approach than what was asked, **stop and ask first** — don't start coding on an assumption. Surface the ambiguity or the better idea and get agreement before implementation.
2. **Security & safety first.** When adding or changing any feature, keep the app's security and safety in mind by default — multi-tenant isolation (every API route checks `company_id` + role before acting; the admin/service-role client bypasses RLS so route-level authZ is the real guard), RLS on new tables, no secrets client-side, signed URLs for private storage, input/amount validation, rate limits on write/expensive routes. Flag security implications of a change even when not asked.
3. **Free-tier awareness + deferred backlog.** Dev runs on free/hobby tiers (see `docs/INFRASTRUCTURE_TIERS.md`). Respect the limits (e.g. Vercel Hobby = 2 crons, daily-only; non-commercial license). When a wanted feature is blocked by a tier limit, **add it to the "DEFERRED FEATURES BACKLOG" table in `docs/INFRASTRUCTURE_TIERS.md`** rather than silently skipping it, and check/update that list each session.
4. **Schema is `supabase/schema.sql`; migrations are ephemeral.** `supabase/schema.sql` is the **canonical, always-current** picture of the LIVE database (tables, columns, FKs, RLS policies, functions, triggers, storage). When you write a migration, the user pastes it into the Supabase SQL Editor to apply it. **Once the user confirms a migration has been applied to live, you MUST: (a) fold its effect into `supabase/schema.sql`, then (b) delete that migration file.** So `supabase/migrations/` only ever holds NOT-yet-applied migrations, and `schema.sql` always mirrors production. To refresh `schema.sql` from live, have the user run `supabase/diagnostics/export_live_schema.sql` and regenerate. Never trust an old/other schema file — `schema.sql` is the only source of truth.

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

Five roles drive everything: `client` / `store_manager` (treated identically — see `isStoreManager()` in `lib/types.ts`), `regional_manager`, `supplier` (the contractor/maintenance-company side; this role was formerly named `admin`), and `executive` (estate-wide read-only dashboards; set by an admin, not self-signup). `middleware.ts` is the single gate for route access:

- `/client/*` → `client` or `store_manager`
- `/regional/*` → `regional_manager`
- `/supplier/*` → `supplier`
- `/executive/*` → `executive`
- `/settings*` → any authenticated user
- Logged-in users hitting `/auth/login` or `/auth/signup` are redirected to their role's home (`/client`, `/supplier`, `/regional`, or `/executive`)

> Note: the service-role Supabase client is still `createAdminClient()`/`adminClient` — that's infrastructure (RLS bypass), unrelated to the `supplier` role. The DB FK columns `quotes.admin_id` / `completions.admin_id` keep their names too and reference the supplier. The `supplier` role manages a directory of trade companies shown in the UI as **"Sub Suppliers"** (the `suppliers` table) — distinct from the role itself.

Each role's top-level `app/<role>/layout.tsx` wraps content in **`ExecChrome`** (`components/exec/ExecChrome.tsx`) — the shared chrome that renders the top header + bottom tab nav and integrates `SwipeNav` (left/right swipe moves between that role's tabs on mobile). Nav bars are deep navy (`brand-600`) in both light and dark mode. `Navbar`/`BottomNav` in `components/ui/` are **legacy** — only `/settings` still uses `Navbar`. Each layout also declares which Supabase tables `RealtimeRefresh` subscribes to for that section.

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

### Dashboards v2 (Regional + Executive health engine)

**⚠️ Two parallel copies of the scoring engine exist.** `lib/health/` is the **live** one used by every role page/component (~40 importers); `lib/dashboards/` is an **older parallel copy** still imported only by `app/api/dashboards/*`, `app/api/cron/*`, and `components/dashboards/*`. The two have diverged — editing one does **not** affect the other, so confirm which path the file you're touching imports.

The engine is **pure functions, no DB**, injected with `now` for testability: `storeHealth.ts` (weighted 6-component score + override rules), `regionalHealth.ts`, `estateHealth.ts`, `sla.ts` (dual supplier/internal SLA + blocker ownership), `ticketHealth.ts`, `supplierPerformance.ts`, `repeatDefects.ts`, `decisions.ts`; weights/thresholds in `constants.ts` (`ragForScore`, `RAG_COLORS`). `lib/health/guard.ts` exposes the role gates (`requireStoreManagerV3` / `requireRegionalUser` / `requireRegionalV3` / `requireExecutiveV3`). `lib/health/data.ts` is **server-only** — loads via `createAdminClient()` and runs the engine to build `assembleStoreManagerDashboard` / `assembleRegionalDashboard` / `assembleEstateDashboard` payloads consumed by the role pages. Dashboards compute **live** from tickets (work before any snapshot exists); snapshot tables (`*_health_scores`, `dashboard_snapshots`) are trend/history, written by `vercel.json` crons (`/api/cron/*`, auth via `CRON_SECRET` or an executive). Schema: `supabase/migrations/20260616_dashboards_v2.sql`. Region = `regions` table; a store links via `profiles.region_id`; ticket `region_id` is trigger-filled. Full reference: `docs/DASHBOARDS_V2.md`.

> **Two Priority systems:** `lib/types.ts` `Priority` = `low|medium|high|urgent` (classic DB value), but `lib/health/types.ts` `Priority` = `P1|P2|P3|P4` (engine, derived from `operational_impact`). `lib/utils.ts` `PRIORITY_LEVEL_LABELS` maps **both** forms to display labels; don't assume which one a given `priority` field holds.

### Shared formatting/labels

`lib/utils.ts` is the single source of truth for ticket status/priority labels and Tailwind color classes (`STATUS_LABELS`, `STATUS_COLORS`, `PRIORITY_LABELS`, `PRIORITY_COLORS`, `QUOTE_STATUS_LABELS`, `OPERATIONAL_IMPACT_LABELS`, `PRIORITY_LEVEL_LABELS`) and locale formatting (`formatCurrency` → ZAR via `en-ZA`, `formatDate`, `formatDateTime`). Reuse these instead of re-deriving labels/colors/locale formats inline. `OPERATIONAL_IMPACT_LABELS` keys (`none`/`cosmetic`/`customer_visible`/`staff_inconvenience`/`trading_affected`/`safety_risk`/`cannot_trade`) are the canonical set shared by the web log-ticket form and the WhatsApp intake — keep them in sync.

### PWA / push notifications

The app is a PWA (`public/manifest.json`, `public/sw.js`, `components/ui/ServiceWorkerSetup.tsx`). Push requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env vars; `lib/push.ts` no-ops if these aren't set, so missing push notifications in dev usually means missing VAPID config, not a bug.

### WhatsApp AI ticket intake

`app/api/webhooks/whatsapp/route.ts` lets a store manager log a ticket from a WhatsApp voice note or text (Meta Cloud API webhook). Pipeline: **Groq Whisper** (`whisper-large-v3`, biased by `WHISPER_PROMPT` for SA-English/Afrikaans accents) transcribes → **Groq LLaMA** (`llama-3.3-70b-versatile`, `temperature 0`, JSON mode, `TICKET_EXTRACTION_PROMPT`) returns English `title`/`description`/`category`/`operational_impact`/`priority`/`confidence`, clamped to the exact web-form enums by `sanitiseExtracted`. The draft is stored in `whatsapp_sessions` (status `awaiting_confirm`) and sent back with **tap-to-edit** interactive buttons/lists (✅ Looks good / ✏️ Edit → field picker → value lists; Title/Description captured via the `pending_field` column). Confirm → `awaiting_photos` (min 2 / max 5 photos) → ticket created. Ticket `priority`/`severity` are derived from `operational_impact` via `impactToPriority` (mirrors the engine — **not** the raw LLM priority word); `confidence` below `CONFIDENCE_THRESHOLD` sets `tickets.needs_review` and flags the RM notification. New columns (`whatsapp_sessions.category`/`operational_impact`/`confidence`/`pending_field`, `tickets.needs_review`) come from `supabase/migrations/20260618_*.sql`. Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GROQ_API_KEY`. Note: this uses **Groq (OpenAI-compatible)**, not Anthropic.

### Splash screens

Two layers, distinct images in `public/splash/` (web) and `android/.../res/drawable/` (native):
- **Web** — `app/layout.tsx` renders `<div id="motiv-splash">` (SSR, styled in `globals.css`) that paints instantly and fades via a CSS animation. An inline script rotates the city image per load (4 portrait on phones, landscape `horisontal.jpg` on wide screens, no immediate repeat via `localStorage`) and **hides itself inside Capacitor** (`window.Capacitor`) so the native splash isn't doubled.
- **Native (Android)** — `MainActivity.java` overlays a random city image (`res/drawable/splash_city{1..4}.png`, center-crop, navy behind) in `onCreate` and fades it after `SHOW_MS`. The launch-theme `windowBackground` (`@drawable/splash`, all densities) is solid navy so there's no logo flash. The OS launch background can't randomize (painted before app code) — rotation happens in `onCreate`. Capacitor splash config + `@capacitor/assets` masters are in `capacitor.config.ts` / `assets/`.

### Required environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`; optionally `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` for push; and `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_VERIFY_TOKEN` / `GROQ_API_KEY` for the WhatsApp intake.

> `NEXT_PUBLIC_APP_URL` + the Capacitor `server.url` (`capacitor.config.ts`) + Supabase Auth Site/redirect URLs must all point at the live domain — changing the domain means updating all three (and rebuilding the Android wrapper).

## Conventions

- Currency is always ZAR via `formatCurrency`; dates via `formatDate`/`formatDateTime` (`en-ZA` locale).
- Dark mode is class-based (`darkMode: 'class'` in `tailwind.config.ts`); the brand palette is `brand-50..900` (deep navy/gold, `brand-600` ≈ `#0d1f2d`). A blocking inline script in `app/layout.tsx` sets the `dark` class before paint to avoid theme flash — don't remove it without preserving that behavior.
- Surface/text colors are CSS vars in `globals.css` (`--app-bg`, `--surface` ≈ `#1f2937` dark, `--surface-2`, `--border`, `--hover`, `--input-bg`, `--text` / `--text-muted` / `--text-faint`) that auto-swap light/dark — use `var(--…)`, never hardcoded hex, or it breaks one mode. The shared card is `Card` in `components/exec/ui.tsx`. Older `components/regional|admin/*` still use raw `gray-*`/`white` classes.
- `globals.css` has an **unlayered** `html.dark select { background-color: … }` rule: native `<select>` option popups composite their bg from the control, and the translucent dark `--input-bg` renders unreadable, so this override is required — it must stay **outside `@layer`** to beat the Tailwind utility.
- Realtime UI updates go through `RealtimeRefresh`, declared per-layout with the table list relevant to that role's pages.
