# Preview deployments → dev database

**Goal:** share dev work on a live URL (so a collaborator can see it) **without** any
test data touching the production database. Vercel Preview deployments point at a
**separate dev Supabase project**; the Production deployment keeps using the real one.

No app code changes are needed — this is entirely Vercel + Supabase configuration.

```
main branch      ──► Vercel Production ──► PROD Supabase   (real users + data)
any other branch ──► Vercel Preview    ──► DEV  Supabase   (throwaway test data)
```

Every push to a non-`main` branch gets its own preview URL
(`motiv-git-<branch>-<team>.vercel.app`). Open it, log in with a **dev** test user,
and everything you do — logging tickets, quotes, sign-offs — writes to the DEV
database. Production never sees it.

---

## One-time setup

### 1. Create the dev Supabase project
- New Supabase project (free tier allows 2 projects per org — see
  `docs/INFRASTRUCTURE_TIERS.md`). Name it e.g. `motiv-dev`.
- Apply the schema: open the SQL Editor and run the full contents of
  `supabase/schema.sql` (our canonical schema — see `CLAUDE.md`).
- Create a few **test login users** (Supabase → Authentication → Users → Add user,
  or invite them once previews are live). These are dev-only accounts; they do **not**
  exist in prod.

### 2. Scope the Vercel environment variables
Vercel → Project → **Settings → Environment Variables**. Each variable has
**Production / Preview / Development** checkboxes. Set each Supabase variable **twice**
— once for Production (prod values) and once for Preview (dev values):

| Variable | Production scope | Preview scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | **dev project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | **dev anon key** |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service-role key | **dev service-role key** |
| `NEXT_PUBLIC_APP_URL` | prod domain (e.g. `https://app.motiv.co.za`) | *(optional — see Auth URLs below)* |

Leave the optional integrations (VAPID, WhatsApp, Groq, Resend, Sentry, Upstash) on
Production only unless you specifically want to test them on preview. Push notifications,
WhatsApp intake, and email simply no-op on preview if their keys are unset.

> `NEXT_PUBLIC_*` values are **baked in at build time**, so a scope/value change only
> takes effect on the **next** deployment. Each branch push rebuilds, so this is
> automatic — but re-deploy after editing the vars.

### 3. Point the dev Supabase project's auth URLs at previews
Preview URLs are **dynamic** (one per branch), so allow-list a wildcard.
In the **DEV** Supabase project → **Authentication → URL Configuration**:
- **Site URL:** your default preview URL (e.g. `https://motiv-git-dev-<team>.vercel.app`).
- **Redirect URLs (allow list):** add a wildcard covering all previews, e.g.
  `https://*-<team>.vercel.app/**`

This is required because the password-reset / callback / invite flows send an
absolute `redirectTo`; Supabase silently drops any URL not on the allow list.
(The **prod** project keeps its allow list pointed at the real domain — untouched.)

### 4. Push a branch and share
```bash
git push origin <your-branch>
```
Vercel builds a preview and comments the URL on the deployment (also visible in the
Vercel dashboard). Send that URL to your collaborator; they log in with a dev test
user and work against the dev DB.

---

## How the app already handles preview URLs

You do **not** need to hardcode or override URLs — the auth flows resolve the base URL
from the live request, so they adapt to whatever domain served the page:

- **Login** is password-based (`signInWithPassword`) — no redirect URL involved.
- **Forgot password / callback** use `window.location.origin` / the request origin —
  automatically the preview URL on a preview, the real domain on prod.
- **Invites** (`lib/invite.ts`) use `NEXT_PUBLIC_APP_URL || new URL(request.url).origin`
  — i.e. the explicit env var if set, otherwise the actual URL the admin is browsing.
  On prod that's the prod domain; on a preview that's the preview URL. There is **no**
  reliance on `VERCEL_URL`, and none is wanted (see below).

### The one rule for invites
Because previews write to the **dev** database, **only send real invites from the
production URL.** If you create an invite while browsing a preview, the invite user is
created in the **dev** project and the email link points to the preview — harmless
(it can't touch prod), but not what a real new user should receive.

If you want invite links generated on a preview to always carry the preview URL even
when an admin has a stale `NEXT_PUBLIC_APP_URL` set, set `NEXT_PUBLIC_APP_URL` in the
**Preview** scope to that branch's preview URL. Otherwise leave it unset for Preview
and the request-origin fallback handles it.

---

## Caveats specific to Motiv

- **Crons run on Production only.** The `vercel.json` cron jobs (`/api/cron/*`, which
  write the `*_health_scores` / `dashboard_snapshots` trend tables) do **not** run on
  preview deployments, so the dev DB gets no snapshot history. Dashboards compute
  **live** from tickets regardless, so previews render correctly — only the
  trend/history tables stay empty. Not a blocker.
- **Hobby previews are public.** Anyone with the preview URL can open it. That's fine
  for sharing with a collaborator, and the app is still login-gated — a stranger with
  the link only reaches the login page, not any data. (Password-protected previews are
  a Vercel Pro feature.) Hobby is also non-commercial (see `docs/INFRASTRUCTURE_TIERS.md`).
- **WhatsApp intake won't fire on previews.** The Meta webhook points at the prod
  domain, so voice-note/text ticket intake only works in production. Expected.
- **Capacitor `server.url`** (the Android wrapper) targets the prod domain and is
  unrelated to web previews.

---

## Local development

For local `npm run dev`, copy `.env.example` → `.env.local` (gitignored) and fill the
three Supabase values with the **dev** project's — so local dev also writes to the dev
DB, never prod:

```
NEXT_PUBLIC_SUPABASE_URL=<dev project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev anon key>
SUPABASE_SERVICE_ROLE_KEY=<dev service-role key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Add `http://localhost:3000/**` to the dev project's redirect allow list for local auth.

---

## Checklist

- [ ] Dev Supabase project created; `supabase/schema.sql` applied
- [ ] A few dev test users created
- [ ] Vercel: Supabase vars set for **Preview** scope → dev project (Production scope unchanged)
- [ ] Dev Supabase auth: Site URL + preview wildcard (`https://*-<team>.vercel.app/**`) allow-listed
- [ ] Pushed a branch; preview URL opens and logs in against the dev DB
- [ ] Confirmed a test ticket appears in the **dev** project, not prod
- [ ] `.env.local` (local dev) points at the dev project
