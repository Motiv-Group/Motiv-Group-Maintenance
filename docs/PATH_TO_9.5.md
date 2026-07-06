# Path to 9.5 / 10 — production-grade tracker

> **Living doc.** Derived from `docs/Motiv_Production_Readiness_Audit_2026-07-06.pdf` (v1.4).
> Claude updates this file whenever an item is completed or a new issue is found — check + update it every session.
> 9.5 overall = **every section ≥ 9.0** *plus* independent validation (penetration test + backup-restore drill).

**Overall score:** 7.4 / 10 → target 9.5
**Last updated:** 2026-07-06
**Audit baseline commit:** ff1bdeb (audit) / cdc7dec (same-day fixes)

## Legend
| Mark | Meaning |
|---|---|
| ✅ | Done (with commit) |
| 🟡 | In progress |
| 🔲 | To do — **code** (Claude can do it) |
| ⛔ | Blocked on **owner** (purchase, legal content, lawyer, registration, external registration) |
| 🆕 | New issue found after the audit |
| Owner | `Code` = Claude · `You` = owner action · `Both` |

## Section scores (now → 9.5)
| Section | Now | Gap to close (short) |
|---|---|---|
| API security & authorisation | 8.5 | webhook fail-closed · body schema validation · rate-limit-fallback alert · audit logs · pen test |
| Database & row-level security | 8.5 | owner-scoped Individual RLS · schema-drift CI · quarterly advisor · restore drill |
| Security headers / CSP | 9.5 | hold; add CSP report endpoint · re-verify after Next upgrade · HSTS preload submit |
| File storage | 9.0 | per-user path prefix · upload quotas · bucket-growth alert |
| Individual-accounts | 8.0 | e2e verify · realtime decision · transition tests · self-signup abuse review |
| Dependencies | 6.0 | Next 15/16 upgrade · ESLint 9 · Renovate · `npm audit` in CI |
| Legal / POPIA | 4.0 | real content in /privacy /terms /sla · Info Officer registered · lawyer sign-off · signup consent |
| Infrastructure & operations | 6.0 | Vercel Pro + Supabase Pro + PITR · staging · uptime/log alerts · SMTP · runbook |
| Code quality & tests | 8.5 | transition-matrix tests · CI pipeline · route authZ tests · Playwright smoke |
| UI/UX | 8.0 | Phase 2 (work queue, chip diet, tab consolidation, etc.) · usability pass |

---

## Phase A — launch gate

| # | Item | Section | Owner | Status |
|---|---|---|---|---|
| A1 | Apply migration 20260722 (supplier wizard) to live, fold into schema.sql, delete file | DB | Code | ✅ 2026-07-06 (folded + deleted this session) |
| A2 | Verify Individual lifecycle end-to-end on deployed app (log job → assign supplier → approve quote → sign-off → close-out) | Individual | You | ✅ 2026-07-06 — full lifecycle completed on deployed app after the N2 (supplier transition on company-null tickets) + N3 (labels) + N1 (uploads) fixes. Ticket reached **completed**. |
| A3 | Complete + lawyer-review legal content: `/privacy`, `/terms`, `/sla` (all bracketed templates) | Legal | ⛔ You | 🔲 |
| A4 | Decide SLA priority timings (P1 res 4h→24h + make-safe; P2 24h→48h or re-baseline; business-hours windows), then align `sla_rules` + `FALLBACK_SLA` + `/sla`, bump `SLA_VERSION` | SLA/Legal | Both | 🔲 needs your decision → then Code |
| A5 | Buy Vercel Pro + Supabase Pro; enable PITR/daily backups; leaked-password protection; add hourly SLA cron | Infra | ⛔ You (~$45/mo) | 🔲 |
| A6 | Set prod env vars: `UPSTASH_REDIS_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `WHATSAPP_APP_SECRET` (when Meta lands) | Infra | You | ✅ 2026-07-06 — Sentry (DSN + `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT`, EU region, capture verified client + server → 200 + issues visible in dashboard), `UPSTASH_REDIS_*`, `CRON_SECRET` all set local + Vercel and redeployed. `WHATSAPP_APP_SECRET` ⛔ deferred until the business is registered with Meta (webhook already fail-closed in prod per A7). |
| A7 | **HIGH 3** — make WhatsApp webhook **fail-closed** in production (`NODE_ENV==='production' && !WA_APP_SECRET → reject`) | API | Code | ✅ 2026-07-06 (`verifyWebhookSignature` rejects in prod when secret unset; fail-open dev-only) |
| A8 | Launch smoke test: signed-URL images render, raw storage URL → 403, signup creates Individual only, each role dashboard loads, WhatsApp intake e2e | All | Both | 🔲 launch day |

## Phase B — hardening (weeks 1–3 after launch)

| # | Item | Section | Owner | Status |
|---|---|---|---|---|
| B1 | **MEDIUM 4** — transition-matrix test suite for `lib/workflow` `resolveTransition()` (every status × action × role incl. `individual`) | Tests | Code | ✅ 2026-07-06 (`lib/workflow.test.ts`, +277 tests, 295 total green) |
| B2 | CI pipeline (GitHub Actions): tsc + lint + vitest + build on every PR; nothing merges red; `npm audit --omit=dev` fail-on-high | Tests/Deps | Code | ✅ 2026-07-06 (`.github/workflows/ci.yml`: PR→main + push→main; `npm ci` → tsc → lint → `npm test` (295) → build (placeholder env); all verified green locally. `npm audit --omit=dev --audit-level=high` is **non-blocking** for now — one known HIGH Next.js advisory only clears via B6 (Next 15/16), so `continue-on-error: true` until then. Branch-protection ruleset requiring the **`build`** check applied to `main` 2026-07-06 (owner) — a red tsc/lint/test/build now blocks merge. CI reproduced green locally on `6d2e8c4` (tsc · lint · 313 tests · build).) |
| B3 | Integration tests for the 3 handlers fixed in cdc7dec (mock Supabase, assert authZ per role) | Tests | Code | ✅ 2026-07-06 (`tests/api/tickets-authz.test.ts`, 18 cases across PATCH/DELETE `/api/tickets/[id]` + POST `/transition`; hoisted Supabase mock, no DB. Covers the Individual-owner regression, cross-company 404, supplier/non-owner 403, unauth 401. `tests/**` added to vitest include; full suite 313 green) |
| B4 | **MEDIUM 1** — Individual realtime: add owner-scoped RLS read policy (`created_by = auth.uid() AND company_id IS NULL`) **or** drop the subscription | DB/Individual | Code | ✅ 2026-07-06 (applied to live, folded into schema.sql, file deleted). ⏳ still verify realtime on deployed `/individual` |
| B5 | **MEDIUM 2** — storage per-user path prefix in upload policies (object name starts with `auth.uid()`) + per-user upload quotas | Storage | Code | 🟡 per-user path now **enforced server-side** in `POST /api/uploads` (`<userId>/…`, client can't spoof) via N1 fix; per-user **quotas** still TODO |
| B6 | **HIGH 1** — Next.js 15/16 upgrade PR (clears advisory list incl. nonce-CSP XSS); retest CSP, Capacitor WebView, auth cookies | Deps | Code | 🔲 big; standalone PR |
| B7 | **MEDIUM 5** — ESLint 9 migration (fold into B6) | Deps | Code | 🔲 |
| B8 | API §6.2 — add body schema validation (zod) to every write route → malformed input = explicit 400 | API | Code | ✅ 2026-07-06 — `lib/validate.ts` (`parseJsonBody`) + zod schemas on **32** JSON write routes; 2 no-body routes skipped (`seen`, `notifications`); 3 FormData routes (`uploads`, `parse-quote-pdf`, `whatsapp`) out of scope. Non-breaking (permissive: fields optional unless the handler already 400s on missing; unknown keys stripped as before). tsc + lint + build green. ⏳ runtime spot-check recommended. |
| B9 | API §6.3 — Sentry alert when rate limiter falls back to in-memory (Upstash outage no longer silent) | API | Code | ✅ 2026-07-06 (`lib/rate-limit.ts` `alertFallback()` → `Sentry.captureException` on Upstash `.limit()` throw + `captureMessage` when Redis unconfigured in prod; throttled 5-min/process to protect free-tier event budget; no-ops in dev when DSN unset) |
| B10 | API §6.4 — audit-log rows for privileged actions (provisioning, admin account ops, role changes) | API | Code | ✅ 2026-07-06 (`lib/audit.ts` `logAudit()` best-effort writer; wired into 6 privileged routes — `provision` ×12 actions, `admin/accounts` ×6, `admin/suppliers`, `account/delete`, `supplier/onboard` ×2, `supplier/assign-rm` ×2 = 24 call sites; `audit_logs` table already existed unused; new `/admin/audit` viewer + nav tab; no secrets in metadata; tsc + prod build green) |
| B11 | **Register #6** — standalone-supplier list views (Tickets/Quotes/Signoff/Snags/Performance) keyed on `supplier_id` not `company_id` (Motiv-pool suppliers) | Individual/Supplier | Code | 🔲 |
| B12 | **Register #7** — SLA re-acceptance gate on `SLA_VERSION` bump (login-time prompt before new work); capture signatures for pre-wizard invited suppliers | Supplier | Code | 🔲 |
| B13 | **MEDIUM 3** — docs refresh: `PRODUCTION_READINESS.md` (buckets private, Redis rate-limit), `CLAUDE.md` role/env sections, stale `schema.sql` comment (`/api/files/sign`) | Docs | Code | ✅ 2026-07-06 (CLAUDE.md 6 roles + routes + env; PRODUCTION_READINESS storage/rate-limit/verify; schema comment; `.env.example` ADMIN_EMAILS deprecated) |
| B14 | UI Phase 2 — RM "Needs my decision" work queue; status-chip diet; zero-KPI tile cleanup; supplier tabs 7→5; destructive-button demotion; session-expiry re-login; pull-to-refresh | UI | Code | 🔲 |
| B15 | Renovate/Dependabot for weekly dependency PRs | Deps | Code | ✅ 2026-07-06 (`.github/dependabot.yml`: weekly npm + github-actions PRs; minor/patch grouped into one PR, majors individual, limit 5. Each PR is gated by B2's CI. `next` major will surface here = the B6 workstream; `xlsx` CDN tarball can't be auto-bumped → stays manual per C10.) |

## Phase C — validation (month 2)

| # | Item | Section | Owner | Status |
|---|---|---|---|---|
| C1 | Staging environment (2nd Vercel project + Supabase branch/project) to rehearse migrations + Next upgrade | Infra | You/Code | 🔲 |
| C2 | Backup-restore drill after PITR is on (a backup never restored is a hope) | Infra | You | 🔲 |
| C3 | Uptime monitoring + alerting on public URL + key API routes | Infra | You | 🔲 |
| C4 | Vercel log drain → alerts on auth failures + 5xx spikes | Infra | You | 🔲 |
| C5 | Custom SMTP for Supabase auth mail | Infra | You | 🔲 |
| C6 | Incident runbook (key rotation, deploy rollback, DB restore) | Infra | Both | 🔲 |
| C7 | CSP `report-to`/`report-uri` endpoint to collect violations | CSP | Code | 🔲 |
| C8 | Submit domain to HSTS preload list (header already opts in) | CSP | You | 🔲 |
| C9 | Schema-drift CI: run `export_live_schema.sql` vs `schema.sql` and diff (monthly or CI) | DB | Code | 🔲 |
| C10 | Quarterly: Supabase Security Advisor re-run + manual `xlsx` (SheetJS) advisory check | DB/Deps | You | 🔲 |
| C11 | POPIA: appoint + register Information Officer with the Information Regulator; signup consent checkbox with stored timestamp | Legal | ⛔ You + Code (checkbox) | 🔲 |
| C12 | Independent penetration test | Validation | You | 🔲 |
| C13 | Usability pass with 3–5 real store managers + suppliers on phones; re-test low-end Android via Capacitor | UI | You | 🔲 |

---

## New issues found after the audit (🆕)
| # | Issue | Severity | Status |
|---|---|---|---|
| N1 | **All photo/doc uploads 403'd** — storage RLS on this (migrated) project never receives the user's JWT, so `auth.uid()`/`auth.role()` are null in `storage.objects` policies and every browser→storage upload 403'd (all roles, all buckets). Proven via raw HTTP with a valid user token. **Policy tweaks can't fix it** (no claim reaches storage RLS). **Fix: route uploads through `POST /api/uploads`** — authenticates via cookie, validates MIME/size, forces a per-user path, writes with the service-role client (bypasses storage RLS). Verified end-to-end (login → upload → 200, per-user path). `lib/upload.ts` now POSTs to the route; real errors surfaced. | **BLOCKER** (uploads broken) | ✅ 2026-07-06 (verified live in preview) |
| N2 | **Supplier can't act on Individual (company-null) tickets** — `/transition` (start_work etc.) + `/decline-invite` gated on `ticket.company_id === supplier.company_id`, but a supplier's profile company is the client that invited them, not the ticket's; on a Motiv-pool/Individual ticket (`company_id` null) it 404'd ("Ticket not found") on **Mark in progress**. Fix: exempt `supplier` from the company-equality gate (they work cross-company; `hasAccess`/invite-link is the real gate). | HIGH | ✅ 2026-07-06 (transition + decline-invite) |
| N4 | **Disputes on Individual tickets were unresolvable** — dispute route required a company + mapped only RM/exec as resolver, so a supplier-raised dispute on an Individual ticket had no resolver. Fix: `individual` now acts as the resolver (`regional_manager` acting role) gated by `created_by`; company gate applies only to real RM/exec; resolver-side notifications route to the owner via `notifyResolver()`; the Individual ticket page now renders the dispute thread + resolve controls. Adversarial authZ review: no holes. | MEDIUM | ✅ 2026-07-06 (code + review) · ⏳ **needs live test** (supplier raise → individual resolve) |
| N5 | **Supplier had no customer name/address for Individual (home) jobs** — supplier detail showed only "Individual". Now shows the customer's name + phone + address (from `user_profiles`) so the supplier can arrange the home visit. | LOW | ✅ 2026-07-06 · ⏳ **needs live test** (address may be blank — signup doesn't force one) |
| N3 | **Supplier UI showed a fake company/store on Individual tickets** — Individuals correctly have NO company/store in the data (verified: profile `company_id` null, no store/region links, no tickets carry them), but the supplier side labelled their jobs with the supplier's OWN company + a "Store" fallback. Fixed across the whole supplier surface: detail page (load company by `t.company_id`, hide Store when null) **and** dashboard + tickets list + quotes/signoff rows + store-group headings + store panel now show **"Individual"** (no company/store) via a new `SupplierTicketRow.isIndividual` flag. | MEDIUM | ✅ 2026-07-06 |

## Done log
- **2026-07-06 B2** — CI pipeline added: `.github/workflows/ci.yml` runs on every PR into `main` and on push to `main`. One `build` job (Node 20, `cache: npm`): `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run build`. Cheap checks run before the slow build (fail-fast). The build step gets inert placeholder Supabase/APP_URL env (all data access is force-dynamic → runtime-only, so nothing hits a real DB at compile time). A final `npm audit --omit=dev --audit-level=high` step is **non-blocking** (`continue-on-error: true`) because there is a known HIGH Next.js advisory that only clears by upgrading to Next 15/16 (**B6**, breaking) — otherwise every PR would be red from day one. Once B6 lands and the audit is clean, drop `continue-on-error` so a new high vuln blocks the merge. All five steps verified green locally (lint clean, 295 tests pass, prod build exit 0; audit correctly exits 1 on the known Next.js high). **Owner action:** enable a branch-protection rule on `main` requiring the "build" status check — the workflow reports status but only branch protection blocks a red merge. B2 closed.
- **2026-07-06 B10** — audit trail for privileged actions. The `audit_logs` table already existed (from `20260616_dashboards_v2.sql`: id/company_id/actor_id/action/entity_type/entity_id/metadata/created_at + a company-scoped read RLS policy) but nothing wrote to it. Added `lib/audit.ts` `logAudit(admin, entry)` — a best-effort writer that never throws (a logging failure can't break the mutation it records) and always uses the service-role client (audit_logs has no insert policy). Wired 24 call sites across 6 privileged routes: `provision` (add/deactivate/reactivate/delete/update store, add region, invite/approve/reject RM, invite/create store manager, add supplier), `admin/accounts` (create executive, invite RM/SM, bulk import, move store, relink RM), `admin/suppliers` (approve/reject), `account/delete` (POPIA self-erasure), `supplier/onboard` (invited + self-signup), `supplier/assign-rm` (assign/unassign). Actions are namespaced (`provision.*`/`admin.*`/`supplier.*`/`account.*`); metadata carries only non-secret context (emails/names/ids/counts — never passwords or invite tokens). New read-only viewer at `/admin/audit` (system_admin only; service-role read so it isn't limited by the company-scoped RLS) + an "Audit" nav tab. Verified: tsc clean, production build green, route loads + guard redirects unauthenticated users. NOTE: the supplier's own trade-directory CRUD (sub-suppliers, technicians, verification-docs) is intentionally out of scope — that's a supplier managing their own data, not a cross-user privileged action. API §6.4 closed.
- **2026-07-06 A6 (Sentry admin tab fix)** — `/admin/sentry` was erroring "Sentry rejected the token (auth failed)". Root cause: Sentry **org auth tokens** (`sntrys_`) only carry the `org:ci` scope (source-map upload) and can **never** read issues — proven via API (403 "You do not have permission" on the slug-independent `/projects/` endpoint). Split the tokens: `lib/admin/sentry.ts` now reads a dedicated `SENTRY_API_TOKEN` (User Auth Token / Internal Integration with `project:read` + `event:read`), falling back to `SENTRY_AUTH_TOKEN` for back-compat; the org token stays as `SENTRY_AUTH_TOKEN` for build source-map upload. Error/unconfigured messages + `.env.example` updated to explain the two-token split. Verified: with the read token set, `issues/` → 200 (2 rows) and `stats/` → 200. `tsc` clean.
- **2026-07-06 B9** — rate-limiter fallback is no longer silent. `lib/rate-limit.ts` gained `alertFallback()`: on an Upstash `.limit()` throw (Redis outage) it `Sentry.captureException(e)`, and when Redis is unconfigured in production (`NODE_ENV==='production'` && no `UPSTASH_REDIS_*`) it `Sentry.captureMessage(...)` — both tagged `subsystem: rate-limit`, `fallback: in-memory`. Throttled to one capture per 5 min per process so a sustained outage doesn't exhaust Sentry's free-tier event budget. No-ops in dev (Sentry disabled when DSN unset). `tsc --noEmit` clean. API §6.3 closed.
- **2026-07-06 A6** — prod env vars set. **Sentry** live: code was already wired (`@sentry/nextjs` ^10.63, browser/server/edge init, `withSentryConfig` source-map wrap, `/admin/sentry` dashboard) — all no-op until env set. Owner created the Sentry project (EU region, project id `4511682875818064`) and set `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` in `.env.local` and Vercel. Verified end-to-end via temp test route + client throw → both POSTed to `ingest.de.sentry.io/…/envelope/` → **200**, and both issues (`MOTIV_GROUP-1` server, `MOTIV_GROUP-2` client) appeared in the Sentry Issues list (temp route deleted). Dashboard host auto-derives `de.sentry.io` from the DSN region. `UPSTASH_REDIS_*` + `CRON_SECRET` also set and Vercel redeployed. Only `WHATSAPP_APP_SECRET` deferred — blocked until the business is registered with Meta (webhook already fail-closed in prod, A7).
- **2026-07-06 A1** — migration 20260722 (supplier onboarding wizard) folded into `supabase/schema.sql`, file deleted. Register #1 cleared.
- **2026-07-06 B1** — `lib/workflow.test.ts`: exhaustive status × action × role matrix for `resolveTransition()`, explicit `individual` allow/deny pins (the BLOCKER-1 regression class), supplier-exclusive actions, terminal/unknown-input guards, and table invariants. +277 tests → **295 passing**.
- **2026-07-06 B4** — migration `20260706_individual_owner_rls.sql` applied to live + folded into `schema.sql` (helper `app_owns_standalone_ticket()` + owner-read policies on tickets/quotes/signoffs), file deleted. Individual browser reads/realtime unblocked. Register #10 (realtime half) cleared.
- **2026-07-06 A7** — WhatsApp webhook `verifyWebhookSignature()` now fails **closed** in production when `WHATSAPP_APP_SECRET` is unset (was fail-open everywhere); dev keeps fail-open. Audit HIGH 3 closed.
- **2026-07-06 N1** — fixed the production upload outage (all roles). Root cause proven: storage RLS never sees the JWT on this migrated project, so `auth.uid()`/`auth.role()` are null in `storage.objects` policies → every browser upload 403'd. New `POST /api/uploads` route uploads via the service-role client after cookie auth + MIME/size validation, forcing a `<userId>/…` path (also advances B5). `lib/upload.ts` posts to it. Verified end-to-end in preview (login → upload → 200). The applied `auth.uid()` policy migration was folded into schema.sql (correct-in-principle, but not the live write path).
- **2026-07-06 N1 (sweep)** — migrated **all** remaining direct browser→storage uploads onto the route via shared `uploadFiles`/`uploadOne`: `SubmitCompletionForm` (COC/POC), `VerificationCard` (supplier-docs), `SendQuoteForm` (quote-attachments), `RmTicketActions`, `DisputeBox`, `SupplierAttachments`, `AddInfoForm`. All 7 were still broken after the log-a-job fix; now fixed app-wide. tsc + lint clean.
- **2026-07-06 B13** — doc drift fixed: `CLAUDE.md` now lists all 6 roles (+`individual`, +`system_admin`) with correct `/individual` + `/admin` routes and a corrected env list; `PRODUCTION_READINESS.md` storage section rewritten (private buckets + signed URLs), rate-limiting marked Upstash-Redis, verify item corrected to 403; stale `/api/files/sign` reference removed from `schema.sql`; `NEXT_PUBLIC_ADMIN_EMAILS` marked deprecated in `.env.example`. Audit MEDIUM 3 closed.
