# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Motiv** — a mobile-first maintenance ticketing and quoting platform for the South African market. Next.js 16 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres, Auth, Storage, Realtime). A Capacitor Android wrapper points at the deployed Vercel site (`capacitor.config.ts`'s `server.url`), so it is not a normal offline-bundled native app.

## Ways of working (standing instructions — apply every session)

1. **Confirm understanding before implementing.** When a task is unclear/ambiguous, or you see a better approach than what was asked, **stop and ask first** — don't start coding on an assumption. Surface the ambiguity or the better idea and get agreement before implementation.
2. **Security & safety first.** When adding or changing any feature, keep the app's security and safety in mind by default — multi-tenant isolation (every API route checks `company_id` + role before acting; the admin/service-role client bypasses RLS so route-level authZ is the real guard), **cross-supplier isolation** (multiple independent supplier orgs compete inside one company — scope supplier-facing queries to the caller's `supplierIds` via `supplier_users`/`ticket_suppliers`, never to the whole company), RLS on new tables, no secrets client-side, signed URLs for private storage, input/amount validation, rate limits on write/expensive routes. Flag security implications of a change even when not asked.
3. **Free-tier awareness + deferred backlog.** Dev runs on free/hobby tiers (see `docs/INFRASTRUCTURE_TIERS.md`). Respect the limits (e.g. Vercel Hobby = 2 crons, daily-only; non-commercial license). When a wanted feature is blocked by a tier limit, **add it to the "DEFERRED FEATURES BACKLOG" table in `docs/INFRASTRUCTURE_TIERS.md`** rather than silently skipping it, and check/update that list each session.
4. **Schema is `supabase/schema.sql`; migrations are ephemeral.** `supabase/schema.sql` is the **canonical, always-current** picture of the LIVE database (tables, columns, FKs, RLS policies, functions, triggers, storage). When you write a migration, the user pastes it into the Supabase SQL Editor to apply it. **Once the user confirms a migration has been applied to live, you MUST: (a) fold its effect into `supabase/schema.sql`, then (b) MOVE that migration file to `supabase/migrations/_archive/` (do NOT delete it — the same migration may still need applying to another environment, e.g. dev).** So `supabase/migrations/` only holds NOT-yet-applied migrations, `_archive/` keeps applied ones for re-use, and `schema.sql` always mirrors production. To refresh `schema.sql` from live, have the user run `supabase/diagnostics/export_live_schema.sql` and regenerate. Never trust an old/other schema file — `schema.sql` is the only source of truth.
5. **Mobile-correct every UI change.** This is a mobile-first app (the Android/PWA render the same responsive site). Whenever you add or change ANY UI — a page, card, list/table, modal/pop-up, filter bar, form, or file upload — apply the **`mobile-ready` skill** (`.claude/skills/mobile-ready/SKILL.md`) before committing: mobile-first additive (base = phone, `sm:`/`lg:` restore desktop pixel-identical), no horizontal page scroll, bottom-sheet modals that lock the background (`useScrollLock`), real touch targets, robust photo upload, and verify at 375px. Don't wait to be asked — run the skill's checklist on the diff every time.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000; use your LAN IP to test on mobile)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (eslint 9)
- `npx tsc --noEmit` — type-check without emitting
- `npm test` — vitest suite: `lib/**/*.test.ts` + `tests/**` (workflow transition matrix, health engine, projects, and real-handler API authZ tests with mocked Supabase in `tests/api/`)
- `npm run schema:check` — static `schema.sql` consistency check
- `npm run gen:types` — regenerate `lib/database.types.ts` from the schema (CI fails on drift)

### Database migrations

Migrations live in `supabase/migrations/` but are **not** applied via Supabase CLI — they're run manually by pasting into the Supabase SQL Editor. Per standing instruction #4 the folder holds only not-yet-applied migrations (usually none); applied history is parked in `supabase/migrations/_archive/`. When adding a new migration, give it a clearly-later/unique dated name and keep it idempotent where practical.

## Architecture

### Roles & route protection

Six roles drive everything: `store_manager` (the store/client side — the legacy `client` role is treated identically, see `isStoreManager()` in `lib/types.ts`), `regional_manager`, `supplier` (the contractor/maintenance-company side; formerly named `admin`), `executive` (estate-wide read-only dashboards; set by an admin, not self-signup), `individual` (general-public self-signup — standalone jobs, no company/store/region; the only role **public self-signup** can create, clamped by the `handle_new_user` trigger — suppliers register via the supplier-onboard flow, which grants the role server-side), and `system_admin` (platform/master admin — the app owner). SM/RM/Executive accounts are invited and linked by the system admin (Hierarchy tab). `proxy.ts` (the Next 16 rename of `middleware.ts` — same convention, exports `proxy`) is the single gate for route access:

- `/client/*` → `store_manager`
- `/regional/*` → `regional_manager`
- `/supplier/*` → `supplier`
- `/executive/*` → `executive` or `system_admin`
- `/individual/*` → `individual`
- `/admin/*` → `system_admin` (platform-admin: business overview, accounts + Hierarchy tab, branding/customization, audit viewer, and the Supabase/Vercel/Resend/Upstash/Sentry infra dashboard)
- `/settings*` → any authenticated user
- Logged-in users hitting `/auth/login` or `/auth/signup` are redirected to their role's home (`/client`, `/supplier`, `/regional`, `/executive`, `/individual`, or `/admin`)

> Note: the service-role Supabase client is still `createAdminClient()`/`adminClient` — that's infrastructure (RLS bypass), unrelated to the `supplier` role. **Suppliers are competing outsiders**: `suppliers` is the supplier-company table (verification via `supplier_verification_docs` + `verification_status`, `is_motiv` flag for Motiv's own org), users link to supplier orgs via `supplier_users`, and per-ticket invites live in `ticket_suppliers`. `quotes`/`signoffs` reference the supplier org via `supplier_id`. The v2 "Sub Suppliers" directory UI was removed in v3.

Each role's top-level `app/<role>/layout.tsx` wraps content in **`ExecChrome`** (`components/exec/ExecChrome.tsx`) — the shared chrome that renders the top header + bottom tab nav and integrates `SwipeNav` (left/right swipe moves between that role's tabs on mobile). `/settings` uses its own `SettingsChrome`. Each layout also declares which Supabase tables `RealtimeRefresh` subscribes to for that section.

### Supabase client pattern

Three clients in `lib/supabase/`:
- `client.ts` `createClient()` — browser client for Client Components
- `server.ts` `createClient()` — server client for Server Components/Route Handlers, RLS-bound to the current user's session via cookies
- `server.ts` `createAdminClient()` — service-role client that **bypasses RLS** and disables Next's fetch cache (`cache: 'no-store'`). Use this only for cross-user operations the requesting user shouldn't have direct table access for (e.g. inserting notifications for other users, looking up other users' profiles, push subscription cleanup).

### API route pattern

Route handlers under `app/api/**/route.ts` follow a consistent shape (see `app/api/tickets/route.ts` as the reference example):
1. `createClient()` + `auth.getUser()` → 401 if missing
2. `await rateLimit(key, limit, windowMs)` from `lib/rate-limit.ts` for write endpoints — Upstash Redis sliding window when `UPSTASH_REDIS_REST_*` is set (global across instances); per-instance in-memory fallback otherwise, with a Sentry alert when production falls back
3. Validate the body via `parseJsonBody` + zod (`lib/validate.ts`)
4. Mutate via the user-scoped client (RLS enforced)
5. Switch to `createAdminClient()` to fan out notifications/lookups across other users' rows
6. Insert `notifications` rows AND fire `sendPushToUser`/`sendPushToMany` (`lib/push.ts`, web-push + VAPID, no-ops silently if VAPID env vars are unset)
7. `logAudit()` (`lib/audit.ts`) for privileged actions; `revalidatePath()` the affected dashboards

### Domain model & ticket flow

**`lib/workflow.ts` is the single source of truth for the ticket lifecycle** — 23 statuses with per-role transitions (`TRANSITIONS`, `STATUS_META`, `resolveTransition`). Happy path:

```
open → assigned → assessment / quote_requested → quoted → accepted
     → in_progress → submitted_for_signoff → approved_closeout → completed
```

plus branch states: `variation_review` (VOs), `evidence_requested`, `suppliers_declined`, the snag chain, disputes (`ticket_disputes` pause the disputed step), and `cancelled`. `pending_sign_off`/`snag` in `lib/types.ts` are legacy v2 values.

Flow across roles: store manager logs a ticket (web form or WhatsApp voice note) → the regional manager validates and **invites suppliers to quote** (`ticket_suppliers` — competitive, several supplier orgs at once) → invited suppliers submit `quotes` → the RM (or executive/individual on their own tickets) approves one via `/api/tickets/[id]/quote-decision`, awarding the ticket (`tickets.supplier_id`) → the supplier schedules and works → submits a **signoff** (`signoffs` table: COC + before/after photos + invoice; review rounds in `signoff_rounds`) → RM approves close-out or raises a snag. All lifecycle moves go through `/api/tickets/[id]/transition`.

Other tables: `suppliers`/`supplier_users`/`supplier_verification_docs` (supplier companies + verification), `technicians` (supplier field teams), `ratings` (RMs/executives/individuals rate suppliers), `push_subscriptions` (web-push endpoints), `audit_logs` (privileged-action trail, viewer at `/admin/audit`), `app_settings` (runtime branding), projects tables (multi-store rollout tracking).

### Dashboards v3 (health engine)

**`lib/health/` is the only scoring engine** (the old parallel `lib/dashboards/` copy is deleted). Pure functions, no DB, injected with `now` for testability: `storeHealth.ts` (weighted 6-component score + override rules), `regionalHealth.ts`, `estateHealth.ts`, `sla.ts` (dual supplier/internal SLA + blocker ownership), `ticketHealth.ts`, `supplierPerformance.ts`, `repeatDefects.ts`, `decisions.ts`; weights/thresholds in `constants.ts` (`statusForScore`, `STATUS_COLORS`; bands: Controlled 95–100 / Attention 80–94 / At Risk 51–79 / Critical 0–50). `lib/health/guard.ts` exposes the role gates (`requireStoreManagerV3` / `requireRegionalUser` / `requireRegionalV3` / `requireExecutiveV3` / `requireSupplierV3` / `requireIndividual`). `lib/health/data.ts` is **server-only** — loads via `createAdminClient()` and runs the engine to build the `assemble*Dashboard` payloads consumed by the role pages. Dashboards compute **live** from tickets; snapshot tables (`*_health_scores`, `dashboard_snapshots`) are trend/history, written by the **single daily cron** `/api/cron/v3-snapshots` (`vercel.json`, `0 5 * * *`; auth via `CRON_SECRET` or executive/system_admin) which also runs the repeat-defect recompute, morning-briefing push, and archived-notification purge. `/api/cron/v3-recompute` is a manual/executive trigger only (unscheduled — Hobby cron limit). Region = `regions` table; a store links via `stores.region_id`; users map through the `store_users` / `regional_users` join tables; ticket `region_id`/`region_code` are copied from the store by the create-ticket API. Schema: `supabase/schema.sql`. Reference: `docs/DASHBOARDS_V2.md`.

> **Priority:** live `tickets.priority` holds `P1|P2|P3|P4` (default `P3`, derived from `operational_impact`); `tickets.severity` holds `low|medium|high|critical`. The `lib/types.ts` `Priority` union (`low|medium|high|urgent`) is legacy. `lib/utils.ts` `PRIORITY_LEVEL_LABELS` maps **both** forms to display labels; don't assume which form a given `priority` field holds.

### Shared formatting/labels

`lib/utils.ts` is the single source of truth for ticket status/priority labels and Tailwind color classes (`STATUS_LABELS`, `STATUS_COLORS`, `PRIORITY_LABELS`, `PRIORITY_COLORS`, `QUOTE_STATUS_LABELS`, `OPERATIONAL_IMPACT_LABELS`, `PRIORITY_LEVEL_LABELS`) and locale formatting (`formatCurrency` → ZAR via `en-ZA`, `formatDate`, `formatDateTime`). Reuse these instead of re-deriving labels/colors/locale formats inline. `OPERATIONAL_IMPACT_LABELS` keys (`none`/`cosmetic`/`customer_visible`/`staff_inconvenience`/`trading_affected`/`safety_risk`/`cannot_trade`) are the canonical set shared by the web log-ticket form and the WhatsApp intake — keep them in sync.

### PWA / push notifications

The app is a PWA. The manifest is a **dynamic route** — `app/manifest.webmanifest/route.ts` (admin re-branding applies without redeploy); there is no `public/manifest.json`. `public/sw.js` is **push-only** (push + notificationclick — no fetch handler, no offline caching yet), registered by `components/ui/ServiceWorkerSetup.tsx`. Push requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; `lib/push.ts` no-ops if these aren't set, so missing push notifications in dev usually means missing VAPID config, not a bug.

### WhatsApp AI ticket intake

`app/api/webhooks/whatsapp/route.ts` lets a store manager log a ticket from a WhatsApp voice note or text (Meta Cloud API webhook; HMAC `x-hub-signature-256` verified, fail-closed in production). Pipeline: **Groq Whisper** (`whisper-large-v3`, biased by `WHISPER_PROMPT` for SA-English/Afrikaans accents) transcribes → **Groq LLaMA** (`llama-3.3-70b-versatile`, `temperature 0`, JSON mode, `TICKET_EXTRACTION_PROMPT`) returns English `title`/`description`/`category`/`operational_impact`/`priority`/`confidence`, clamped to the exact web-form enums by `sanitiseExtracted`. The draft is stored in `whatsapp_sessions` (status `awaiting_confirm`) and sent back with **tap-to-edit** interactive buttons/lists (✅ Looks good / ✏️ Edit → field picker → value lists; Title/Description captured via the `pending_field` column). Confirm → `awaiting_photos` (min 2 / max 5 photos) → ticket created. Ticket `priority`/`severity` are derived from `operational_impact` via `impactToPriority` (mirrors the engine — **not** the raw LLM priority word); `confidence` below `CONFIDENCE_THRESHOLD` sets `tickets.needs_review` and flags the RM notification. Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `GROQ_API_KEY`. Note: this uses **Groq (OpenAI-compatible)**, not Anthropic.

### Splash screen (native Android only)

The web splash was removed (comment in `app/layout.tsx`) — only the native layer remains: `MainActivity.java` overlays a random city image (`android/.../res/drawable/splash_city{1..4}.png`, center-crop, charcoal `#0E1016` behind) in `onCreate` and fades it after `SHOW_MS`. The launch-theme `windowBackground` (`@drawable/splash`, all densities) is solid charcoal so there's no logo flash. The OS launch background can't randomize (painted before app code) — rotation happens in `onCreate`.

### Required environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. Optional groups (each degrades gracefully when unset): VAPID web-push, WhatsApp intake + Groq, Sentry, Upstash rate limiting, Resend email, `CRON_SECRET`, Vercel/infra-dashboard tokens, `MAX_USER_UPLOAD_BYTES`. **`.env.example` is the authoritative annotated list.**

> `NEXT_PUBLIC_APP_URL` + the Capacitor `server.url` (`capacitor.config.ts`) + Supabase Auth Site/redirect URLs must all point at the live domain — changing the domain means updating all three (and rebuilding the Android wrapper).

## Conventions

- **Brand/CI reference:** fonts + colours are documented in `docs/COMPANY_IDENTITY.md` (Geist via `next/font`, wired through Tailwind `font-sans`). The palette is **warm charcoal + gold/cream**: `brand-600` = `#0e1016` factory default, exposed as RGB-channel CSS vars and **admin-overridable at runtime** via `/admin/customization` (`app_settings`). Interactive elements use **blue** for actions and **green** for select/accept/approve — not the soft gold.
- Currency is always ZAR via `formatCurrency`; dates via `formatDate`/`formatDateTime` (`en-ZA` locale).
- Dark mode is class-based (`darkMode: 'class'` in `tailwind.config.ts`). A blocking inline script in `app/layout.tsx` sets the `dark` class before paint to avoid theme flash — don't remove it without preserving that behavior.
- Surface/text colors are CSS vars in `globals.css` (`--app-bg`, `--surface` = `#ffffff` light / `#17181e` dark, `--surface-2`, `--nav-bg`, `--border`, `--hover`, `--input-bg`, `--text` / `--text-muted` / `--text-faint`) that auto-swap light/dark — use `var(--…)`, never hardcoded hex, or it breaks one mode. The shared card is `Card` in `components/exec/ui.tsx`. Older `components/regional|admin/*` still use raw `gray-*`/`white` classes.
- `globals.css` has an **unlayered** `html.dark select { background-color: … }` rule: native `<select>` option popups composite their bg from the control, and the translucent dark `--input-bg` renders unreadable, so this override is required — it must stay **outside `@layer`** to beat the Tailwind utility.
- Realtime UI updates go through `RealtimeRefresh`, declared per-layout with the table list relevant to that role's pages.
- **Mobile rules** (see `docs/MOBILE_READINESS.md`): primary lists never scroll horizontally (stacked-card fallback under `sm`, `overflow-x-auto` only for secondary/document tables); badge clusters never starve primary text (stack or un-fix widths at base); all pop-ups use the shared bottom-sheet `Modal`; mobile density = `p-4` cards / `h-10` chips / `text-xl` values with `sm:` restoring desktop. Fixes are mobile-first additive — `sm:`/`lg:` keep desktop pixel-identical.
