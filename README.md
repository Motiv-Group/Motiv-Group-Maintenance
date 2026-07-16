# Motiv — Maintenance App

A mobile-first maintenance ticketing and quoting platform for the South African market. Next.js 16 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres, Auth, Storage, Realtime), wrapped for Android with Capacitor (the wrapper loads the deployed site — see `capacitor.config.ts`).

> For architecture, conventions and the full domain model, see `CLAUDE.md`. For production readiness status, see `docs/PATH_TO_9.5.md`.

---

## Quick Start

### 1. Install Node.js
Download and install from https://nodejs.org (LTS version).

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Supabase

1. Go to https://app.supabase.com and create a project
2. Open **SQL Editor** (left sidebar)
3. Paste the entire contents of `supabase/schema.sql` and click **Run**
   — this file is the canonical, always-current schema (tables, RLS, functions,
   triggers, storage buckets). `supabase/migrations/` holds only not-yet-applied
   migrations (currently none; history is archived in `supabase/migrations/_archive/`).
4. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 4. Configure environment
```bash
cp .env.example .env.local
```

Required:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Everything else (VAPID web-push, WhatsApp intake, Groq, Sentry, Upstash rate
limiting, Resend email, cron secret, Vercel/infra dashboard tokens) is optional
and documented inline in `.env.example` — the app degrades gracefully when a
group is unset.

> WhatsApp note: the Cloud API only delivers free-form text inside the 24-hour
> customer-care window; cold sends need a pre-approved template. Email (Resend)
> is the reliable auto-channel; manual share buttons always work.

### 5. Create the platform admin

Accounts are invited through the app by role, but the first `system_admin` is
created manually:
1. **Authentication → Users** in Supabase → **Add user** (email + password)
2. **SQL Editor**:
```sql
UPDATE public.user_profiles
SET role = 'system_admin'
WHERE email = 'your@email.com';
```

From `/admin` the system admin then invites Executives, Regional Managers and
Store Managers (and links them in the **Hierarchy** tab); suppliers register
through the supplier onboarding flow. Public self-signup only creates
`individual` accounts (enforced by a DB trigger).

### 6. Run the app
```bash
npm run dev
```

Open http://localhost:3000. On a phone, use your computer's LAN IP
(e.g. http://192.168.1.5:3000) to test the mobile experience.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type-check |
| `npm test` | vitest suite (`lib/**/*.test.ts`, `tests/`) |
| `npm run schema:check` | static schema.sql consistency check |
| `npm run gen:types` | regenerate `lib/database.types.ts` from schema |

---

## Roles

| Role | Home | Who |
|---|---|---|
| `store_manager` | `/client` | store/branch staff logging tickets |
| `regional_manager` | `/regional` | oversees a region's stores; validates tickets, awards quotes, signs off work |
| `supplier` | `/supplier` | contractor/maintenance companies quoting and doing the work (competitive — multiple supplier orgs can be invited per ticket) |
| `executive` | `/executive` | estate-wide read-only dashboards |
| `individual` | `/individual` | general public — standalone home jobs (only self-signup role) |
| `system_admin` | `/admin` | platform owner — accounts, hierarchy, branding, infra dashboards |

Route access is enforced in `proxy.ts` (Next 16's `middleware.ts` rename).

## Ticket Flow (v3)

```
Store manager logs ticket (web or WhatsApp voice note)
  → Regional manager validates & invites suppliers to quote
  → Invited suppliers submit quotes (competitive)
  → RM (or executive/individual) approves a quote → ticket awarded
  → Supplier schedules & does the work
  → Supplier submits signoff (COC + before/after photos + invoice)
  → RM approves close-out → completed, or raises a snag → snag loop
```

The full state machine (23 statuses incl. assessment, variation review,
evidence requests, disputes, snags) lives in `lib/workflow.ts` — the single
source of truth for statuses, roles and transitions.

---

## Deploying to Production (Vercel)

1. Push to GitHub and import the repo in Vercel
2. Add all `.env.local` variables as Vercel Environment Variables
3. Deploy
4. Point `NEXT_PUBLIC_APP_URL`, `capacitor.config.ts` `server.url`, and
   Supabase **Authentication → URL Configuration** (Site URL + Redirect URLs)
   at the live domain — all three must match
5. `vercel.json` schedules the single daily cron (`/api/cron/v3-snapshots`);
   set `CRON_SECRET` so it can authenticate

See `docs/PREVIEW_DEPLOYMENTS.md` for the preview→dev-database setup and
`docs/INFRASTRUCTURE_TIERS.md` for free-tier limits and the deferred backlog.
