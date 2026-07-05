# Go-live checklist (living)

Running list of what's left before a safe public launch. Tick as done; add rows as needed.
Tier-blocked items live in `docs/INFRASTRUCTURE_TIERS.md`. Security architecture in the PDF / `docs/STORAGE.md`.

## Do now / at deploy
- [ ] **Merge `go-public-hardening` → `main`** (Vercel auto-deploys) — ships the signed-URL code so private-bucket images work again.
- [ ] After deploy, **smoke-test**: open one ticket's photo gallery + a COC doc + a quote PDF (confirm images render); confirm a raw `…/object/public/…` URL 403s.
- [ ] **Set Vercel env vars** then redeploy (see "Where to get the env vars" below):
  - [ ] `WHATSAPP_APP_SECRET` — webhook is fail-open without it. **Waiting on WhatsApp Business registration** to obtain the App Secret. Low-risk for now (no WhatsApp traffic until registered); set it the moment you have it.
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` — error monitoring
  - [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — effective rate limiting

## Before public / commercial launch
- [ ] Replace legal template copy in `/privacy` + `/terms` (lawyer review).
- [ ] **Vercel Pro** — Hobby is non-commercial license; also unblocks the hourly SLA cron.
- [ ] **Supabase Pro** — automated backups / PITR (no backup story today).
- [x] **Enforce CSP** — ✅ done 2026-07-07 (Report-Only → enforcing).
- [x] **CSP Step 2 — nonce-based** — ✅ done 2026-07-07. Per-request nonce in `middleware.ts` + `strict-dynamic`; `'unsafe-inline'` removed from script-src (`'unsafe-eval'` dev-only). Verified in prod mode: all scripts nonce'd, theme script + React hydration work, auth gate intact, 0 CSP violations.
- [x] `/api/files/sign` — ✅ **removed** 2026-07-07 (was unused; all display signs server-side). Kills the "any logged-in user signs any path" surface. Re-add with per-file auth only if a client ever needs on-demand signing.
- [x] **Minor polish** — ✅ done 2026-07-07: account-delete now global sign-out (revokes all sessions; ~1h stateless-JWT window is inherent + documented); the 2 blob-preview `<img>` lint warnings resolved (lint now clean); Android `minifyEnabled=true` + Capacitor ProGuard keep-rules. **⚠️ Android: build a release APK and test on a device before shipping** (minify + keep-rules aren't testable headless).

**⏸️ Parked (come back to):**
- **Legal copy** — `/privacy` + `/terms` are complete POPIA/SA **templates**; parked until real legal text + `[bracketed]` details + lawyer review.
- **Leaked-password protection** — Supabase **Pro** only (tier backlog #4).
- **`WHATSAPP_APP_SECRET`** — waiting on WhatsApp Business registration.
- **Vercel Pro + Supabase Pro** — purchases (~$45/mo) for commercial license + DB backups.

---

## Supabase advisor findings (triaged 2026-07-07)

**Fix (SQL) — advisor revokes:**
- [x] ✅ Applied + folded into `supabase/schema.sql` (revoked public/authenticated EXECUTE on `append_session_photo`, `handle_new_user`, `assign_store_job_ref`).

**Fix (Supabase dashboard → Authentication):**
- [x] ✅ **OTP expiry** lowered to ≤ 3600s.
- ⏸️ **Leaked Password Protection** → **Supabase Pro only** — not on the free tier. Deferred to the tier backlog (`INFRASTRUCTURE_TIERS.md` #4); enable when on Pro.

**Safe by design — no change needed (documented so we don't "fix" them into a hole):**
- *"Public / Signed-in can execute SECURITY DEFINER function"* on the **`app_*` helpers** (`app_company_id`, `app_role`, `app_can_see_ticket`, `app_region_ids`, `app_store_ids`, `app_supplier_ids`, `app_is_company_wide`): these are **required** — RLS policies call them per query as the querying role, so they must stay executable. Each returns only the **caller's own** scoping data (keyed on `auth.uid()`), never another user's. Standard Supabase RLS pattern; leave as-is.
- *"RLS enabled, no policy"* on `whatsapp_sessions`, `store_ticket_counters`, `ticket_disputes`, `ticket_dispute_messages`, `ticket_suppliers`, `daily_briefings`, `ratings`, `technicians`: **no policy = deny-all to every user = the most restrictive/secure state.** All are accessed via the service-role admin client (which bypasses RLS by design). Adding a permissive policy here would *reduce* security. Leave deny-by-default. (One caveat: if the client-facing **ratings display** ever renders empty, add a *precise* scoped read policy for `ratings` only — don't blanket-add.)

## How to do the CSP (Content-Security-Policy)

**Where:** `next.config.mjs` → `async headers()`. Today it ships a **`Content-Security-Policy-Report-Only`** header — the browser *reports* violations but does **not** block them, so nothing breaks while we tune it.

**Why not just enforce now:** the app uses **inline scripts** (theme + splash rotation in `app/layout.tsx`), so the policy currently allows `script-src 'unsafe-inline' 'unsafe-eval'`. Enforcing as-is blocks framing/clickjacking, object/embed, base-uri and form-action exfil, and locks connect/img sources to an allowlist — but `'unsafe-inline'` means it does NOT stop inline-script XSS. Real XSS protection needs nonces (step 2).

### Step 1 — flip Report-Only → enforcing (low risk, do after confirming reports are clean)
1. Deploy with Report-Only for a bit; watch the browser console + any report endpoint for violations (especially anything the Capacitor Android WebView or Sentry needs).
2. Make sure `connect-src` includes everything the browser calls: `'self'`, Supabase REST + realtime, and — once Sentry is on — its ingest host:
   ```
   connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io;
   ```
3. In `next.config.mjs`, rename the header key from `Content-Security-Policy-Report-Only` to **`Content-Security-Policy`**. Ship. Re-test all pages + image display + WhatsApp/quote upload.

### Step 2 — strict CSP with nonces (removes `'unsafe-inline'`, real XSS defence)
1. Generate a per-request nonce in `middleware.ts` (`crypto.randomUUID()`/`randomBytes`), set it on the request + response headers.
2. Change `script-src` to `'self' 'nonce-<nonce>'` (drop `'unsafe-inline'`; drop `'unsafe-eval'` if the build allows).
3. Add `nonce={nonce}` to every inline `<script>` (the theme + splash scripts in `app/layout.tsx`) and use `next/script` with the nonce for others; read the nonce from headers in the root layout.
4. Test hard — a missed inline script will silently stop executing (theme flash, splash, etc.). This is why step 2 is a separate, carefully-tested change, not part of an urgent deploy.

**Recommendation:** do Step 1 once report-only is clean; schedule Step 2 as its own tested PR.
