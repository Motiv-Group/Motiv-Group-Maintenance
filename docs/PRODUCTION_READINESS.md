# Motiv — production readiness (security & policies)

> **Note (2026-07-06):** `clean_install.sql` and `schema_v3.sql` were removed — they did **not** match the live database (they built the old v1 `profiles` schema). The single source of truth is now **`supabase/schema.sql`** (reconstructed from the live prod dump). Fresh installs apply the numbered `supabase/migrations/*.sql` in order; use `schema.sql` as the reference for what the live DB looks like.

## What the base schema provides
- **RLS enabled on every table.** Tables with no policy (`suppliers`, `push_subscriptions`, `whatsapp_sessions`, and analytics *writes*) are reachable **only by the service-role key** (server-side) — clients get deny-by-default. The app already uses the admin client for those.
- **`whatsapp_sessions` RLS turned ON** (the original migration left it OFF — that was a hole: a public table with no RLS is world read/write via the API).
- **`security definer` functions pinned** with `set search_path = public` (prevents search-path hijack — a Supabase linter warning).
- Role-scoped read policies per role (`store_manager` / `regional_manager` / `supplier` / `executive` / `system_admin`), plus owner-scoped read for `individual` standalone tickets (migration 20260706).

## Storage — private buckets + signed URLs ✅
All buckets (`ticket-photos`, `completion-docs`, `quote-attachments`, `supplier-docs`) are **private** (migration 20260708). No public read — files, including **COCs, invoices and completion photos**, are served only via short-lived **signed URLs** generated server-side (`lib/storage.ts` `signManyUrls` → batched `createSignedUrls`). Uploads are gated to authenticated users with per-bucket MIME allow-lists + 15 MB caps. There is **no client-side signing endpoint** (the old `/api/files/sign` was removed 2026-07-07).
- **Follow-up (audit MEDIUM 2 / tracker B5):** enforce a per-user path prefix in the upload policies (object name starts with `auth.uid()`) and add per-user upload quotas.

## Auth (Supabase dashboard → Authentication)
- [ ] **Site URL** = production URL; **Redirect URLs** = exact allowlist (prod + `http://localhost:3000`), no wildcards.
- [ ] **Confirm email** ON (so signups verify ownership).
- [ ] **Leaked password protection** ON; **minimum password length** ≥ 8 (the app enforces 8 client-side — enforce server-side too).
- [ ] **Bot/abuse:** enable **CAPTCHA (hCaptcha/Turnstile)** on signup (still worth it to throttle account/email abuse).
- [ ] Custom **SMTP** sender (the built-in mailer is rate-limited / not for production volume).
- [ ] Only the **Email** provider enabled unless you intend others.

## ✅ Signup role escalation — CLOSED (migration 20260721)
`handle_new_user` now **clamps any client-supplied role to `individual`** — self-signup can only ever create an Individual. Every privileged role (store_manager / regional_manager / executive / supplier / system_admin) is assigned only by a trusted service-role path (admin invite via `lib/invite`, token-gated supplier onboard, `create_store_manager`) that upserts the role after creation. A browser calling `auth.signUp({ data: { role: 'system_admin' } })` gets a plain Individual account.
- Optional further hardening: carry the privileged role in `raw_app_meta_data` (server-only, unsettable by the client) instead of relying on the post-create upsert.

## Secrets & keys
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is **server-only** (never `NEXT_PUBLIC_*`). Confirm it's only in Vercel server env. It bypasses RLS — treat as root.
- [ ] `CRON_SECRET` set (guards `/api/cron/*`).
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set if using push.
- [ ] Rotate keys if the old project's keys ever leaked.

## App-level
- [x] **Rate limiting** (`lib/rate-limit.ts`) uses **Upstash Redis** — a distributed sliding window shared across the serverless fleet — when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set, with a graceful **in-memory fallback** (per-instance) on outage or when unset. Applied to every write/expensive route. (Audit follow-up B9: alert when it falls back so an Upstash outage isn't silent.)
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
- [x] A non-logged-in request for a raw `completion-docs` file URL returns **403** (buckets are private; access is via short-lived signed URLs only).
