# Motiv — production readiness (security & policies)

Run `supabase/clean_install.sql` first (full schema + RLS + buckets + the SLA seed). Then work this checklist.

## What `clean_install.sql` already does
- **RLS enabled on every table.** Tables with no policy (`suppliers`, `push_subscriptions`, `whatsapp_sessions`, and analytics *writes*) are reachable **only by the service-role key** (server-side) — clients get deny-by-default. The app already uses the admin client for those.
- **`whatsapp_sessions` RLS turned ON** (the original migration left it OFF — that was a hole: a public table with no RLS is world read/write via the API).
- **`security definer` functions pinned** with `set search_path = public` (prevents search-path hijack — a Supabase linter warning).
- Role-scoped read policies for client / supplier / regional_manager / executive.

## Storage — IMPORTANT (you chose public buckets)
All 3 buckets are **public**: anyone with a file URL can open it, no login. That includes **COCs, invoices and completion photos** in `completion-docs` / `quote-attachments`.
- **Recommended hardening:** make `completion-docs` + `quote-attachments` **private** and serve via short-lived signed URLs.
  - SQL: `update storage.buckets set public = false where id in ('completion-docs','quote-attachments');`
  - Code change: replace `getPublicUrl(...)` with `createSignedUrl(path, 3600)` in `SubmitCompletionForm`, `SendQuoteForm`, and wherever those docs are displayed (completion review, ticket detail).
- Tell me to do this and I'll refactor the uploads/displays.

## Auth (Supabase dashboard → Authentication)
- [ ] **Site URL** = production URL; **Redirect URLs** = exact allowlist (prod + `http://localhost:3000`), no wildcards.
- [ ] **Confirm email** ON (so signups verify ownership).
- [ ] **Leaked password protection** ON; **minimum password length** ≥ 8 (the app enforces 8 client-side — enforce server-side too).
- [ ] **Bot/abuse:** enable **CAPTCHA (hCaptcha/Turnstile)** on signup. Especially important because **executive self-signup is OPEN** (see below).
- [ ] Custom **SMTP** sender (the built-in mailer is rate-limited / not for production volume).
- [ ] Only the **Email** provider enabled unless you intend others.

## ⚠ Open executive signup
`handle_new_user` currently lets anyone register as **executive** → full estate-wide read of every store, ticket and financial figure. You chose to keep this. For production strongly consider one of:
- Lock the trigger to `('store_manager','regional_manager')` and set executives via SQL, **or**
- Gate the Executive option in the signup UI behind an invite code (`EXEC_SIGNUP_CODE`).
Say the word and I'll implement either.

## Secrets & keys
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **server-only** (never `NEXT_PUBLIC_*`). Confirm it's only in Vercel server env. It bypasses RLS — treat as root.
- [ ] `CRON_SECRET` set (guards `/api/cron/*`).
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set if using push.
- [ ] Rotate keys if the old project's keys ever leaked.

## App-level
- [ ] **Rate limiting** (`lib/rate-limit.ts`) is in-memory **per serverless instance** — it resets on cold start and isn't shared across instances. For real abuse protection move it to a shared store (Upstash Redis / Supabase table). Fine for low volume; note the limitation.
- [ ] Validate/escape all user input on write routes (already mutate via RLS-bound client).

## Database & ops
- [ ] Enable **Point-in-Time Recovery / daily backups** (paid tier) before real data lands.
- [ ] **Enforce SSL** on database connections (Settings → Database).
- [ ] Run the Supabase **Security Advisor** (Dashboard → Advisors) and clear warnings — should be clean after this script (RLS on all, search_path pinned).
- [ ] Restrict direct DB access; use the connection pooler for app traffic.
- [ ] Set up log drains / alerts for auth failures and 5xx.

## Verify
- [ ] Advisor shows no "RLS disabled" / "function search_path mutable" warnings.
- [ ] As an anon user, hitting the REST API for `tickets`/`profiles` returns only permitted rows.
- [ ] A non-logged-in request for a `completion-docs` file URL — decide if that's acceptable (it is allowed today).
