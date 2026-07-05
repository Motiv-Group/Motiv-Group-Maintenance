# Go-live checklist (living)

Running list of what's left before a safe public launch. Tick as done; add rows as needed.
Tier-blocked items live in `docs/INFRASTRUCTURE_TIERS.md`. Security architecture in the PDF / `docs/STORAGE.md`.

## Do now / at deploy
- [ ] **Merge `go-public-hardening` → `main`** (Vercel auto-deploys) — ships the signed-URL code so private-bucket images work again.
- [ ] After deploy, **smoke-test**: open one ticket's photo gallery + a COC doc + a quote PDF (confirm images render); confirm a raw `…/object/public/…` URL 403s.
- [ ] **Set Vercel env vars** then redeploy (see "Where to get the env vars" below):
  - [ ] `WHATSAPP_APP_SECRET` — webhook is fail-open without it
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` — error monitoring
  - [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — effective rate limiting

## Before public / commercial launch
- [ ] Replace legal template copy in `/privacy` + `/terms` (lawyer review).
- [ ] **Vercel Pro** — Hobby is non-commercial license; also unblocks the hourly SLA cron.
- [ ] **Supabase Pro** — automated backups / PITR (no backup story today).
- [ ] **Enforce CSP** (currently Report-Only — see below).
- [ ] Per-file storage authorization (`/api/files/sign` currently gates "logged-in", not "owns this file").
- [ ] Password policy (min-8 only today), account-delete session revoke, `<img>`→`next/image`, Android `minifyEnabled=true`.

---

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
