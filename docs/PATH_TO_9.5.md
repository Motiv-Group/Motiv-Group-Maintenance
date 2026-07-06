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
| A2 | Verify Individual lifecycle end-to-end on deployed app (log job → assign supplier → approve quote → sign-off → close-out) | Individual | You | 🔲 next deploy |
| A3 | Complete + lawyer-review legal content: `/privacy`, `/terms`, `/sla` (all bracketed templates) | Legal | ⛔ You | 🔲 |
| A4 | Decide SLA priority timings (P1 res 4h→24h + make-safe; P2 24h→48h or re-baseline; business-hours windows), then align `sla_rules` + `FALLBACK_SLA` + `/sla`, bump `SLA_VERSION` | SLA/Legal | Both | 🔲 needs your decision → then Code |
| A5 | Buy Vercel Pro + Supabase Pro; enable PITR/daily backups; leaked-password protection; add hourly SLA cron | Infra | ⛔ You (~$45/mo) | 🔲 |
| A6 | Set prod env vars: `UPSTASH_REDIS_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `WHATSAPP_APP_SECRET` (when Meta lands) | Infra | You | 🔲 |
| A7 | **HIGH 3** — make WhatsApp webhook **fail-closed** in production (`NODE_ENV==='production' && !WA_APP_SECRET → reject`) | API | Code | ✅ 2026-07-06 (`verifyWebhookSignature` rejects in prod when secret unset; fail-open dev-only) |
| A8 | Launch smoke test: signed-URL images render, raw storage URL → 403, signup creates Individual only, each role dashboard loads, WhatsApp intake e2e | All | Both | 🔲 launch day |

## Phase B — hardening (weeks 1–3 after launch)

| # | Item | Section | Owner | Status |
|---|---|---|---|---|
| B1 | **MEDIUM 4** — transition-matrix test suite for `lib/workflow` `resolveTransition()` (every status × action × role incl. `individual`) | Tests | Code | ✅ 2026-07-06 (`lib/workflow.test.ts`, +277 tests, 295 total green) |
| B2 | CI pipeline (GitHub Actions): tsc + lint + vitest + build on every PR; nothing merges red; `npm audit --omit=dev` fail-on-high | Tests/Deps | Code | 🔲 |
| B3 | Integration tests for the 3 handlers fixed in cdc7dec (mock Supabase, assert authZ per role) | Tests | Code | 🔲 |
| B4 | **MEDIUM 1** — Individual realtime: add owner-scoped RLS read policy (`created_by = auth.uid() AND company_id IS NULL`) **or** drop the subscription | DB/Individual | Code | ✅ 2026-07-06 (applied to live, folded into schema.sql, file deleted). ⏳ still verify realtime on deployed `/individual` |
| B5 | **MEDIUM 2** — storage per-user path prefix in upload policies (object name starts with `auth.uid()`) + per-user upload quotas | Storage | Code | 🟡 per-user path now **enforced server-side** in `POST /api/uploads` (`<userId>/…`, client can't spoof) via N1 fix; per-user **quotas** still TODO |
| B6 | **HIGH 1** — Next.js 15/16 upgrade PR (clears advisory list incl. nonce-CSP XSS); retest CSP, Capacitor WebView, auth cookies | Deps | Code | 🔲 big; standalone PR |
| B7 | **MEDIUM 5** — ESLint 9 migration (fold into B6) | Deps | Code | 🔲 |
| B8 | API §6.2 — add body schema validation (zod) to every write route → malformed input = explicit 400 | API | Code | 🔲 |
| B9 | API §6.3 — Sentry alert when rate limiter falls back to in-memory (Upstash outage no longer silent) | API | Code | 🔲 |
| B10 | API §6.4 — audit-log rows for privileged actions (provisioning, admin account ops, role changes) | API | Code | 🔲 |
| B11 | **Register #6** — standalone-supplier list views (Tickets/Quotes/Signoff/Snags/Performance) keyed on `supplier_id` not `company_id` (Motiv-pool suppliers) | Individual/Supplier | Code | 🔲 |
| B12 | **Register #7** — SLA re-acceptance gate on `SLA_VERSION` bump (login-time prompt before new work); capture signatures for pre-wizard invited suppliers | Supplier | Code | 🔲 |
| B13 | **MEDIUM 3** — docs refresh: `PRODUCTION_READINESS.md` (buckets private, Redis rate-limit), `CLAUDE.md` role/env sections, stale `schema.sql` comment (`/api/files/sign`) | Docs | Code | ✅ 2026-07-06 (CLAUDE.md 6 roles + routes + env; PRODUCTION_READINESS storage/rate-limit/verify; schema comment; `.env.example` ADMIN_EMAILS deprecated) |
| B14 | UI Phase 2 — RM "Needs my decision" work queue; status-chip diet; zero-KPI tile cleanup; supplier tabs 7→5; destructive-button demotion; session-expiry re-login; pull-to-refresh | UI | Code | 🔲 |
| B15 | Renovate/Dependabot for weekly dependency PRs | Deps | Code | 🔲 |

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

## Done log
- **2026-07-06 A1** — migration 20260722 (supplier onboarding wizard) folded into `supabase/schema.sql`, file deleted. Register #1 cleared.
- **2026-07-06 B1** — `lib/workflow.test.ts`: exhaustive status × action × role matrix for `resolveTransition()`, explicit `individual` allow/deny pins (the BLOCKER-1 regression class), supplier-exclusive actions, terminal/unknown-input guards, and table invariants. +277 tests → **295 passing**.
- **2026-07-06 B4** — migration `20260706_individual_owner_rls.sql` applied to live + folded into `schema.sql` (helper `app_owns_standalone_ticket()` + owner-read policies on tickets/quotes/signoffs), file deleted. Individual browser reads/realtime unblocked. Register #10 (realtime half) cleared.
- **2026-07-06 A7** — WhatsApp webhook `verifyWebhookSignature()` now fails **closed** in production when `WHATSAPP_APP_SECRET` is unset (was fail-open everywhere); dev keeps fail-open. Audit HIGH 3 closed.
- **2026-07-06 N1** — fixed the production upload outage (all roles). Root cause proven: storage RLS never sees the JWT on this migrated project, so `auth.uid()`/`auth.role()` are null in `storage.objects` policies → every browser upload 403'd. New `POST /api/uploads` route uploads via the service-role client after cookie auth + MIME/size validation, forcing a `<userId>/…` path (also advances B5). `lib/upload.ts` posts to it. Verified end-to-end in preview (login → upload → 200). The applied `auth.uid()` policy migration was folded into schema.sql (correct-in-principle, but not the live write path).
- **2026-07-06 B13** — doc drift fixed: `CLAUDE.md` now lists all 6 roles (+`individual`, +`system_admin`) with correct `/individual` + `/admin` routes and a corrected env list; `PRODUCTION_READINESS.md` storage section rewritten (private buckets + signed URLs), rate-limiting marked Upstash-Redis, verify item corrected to 403; stale `/api/files/sign` reference removed from `schema.sql`; `NEXT_PUBLIC_ADMIN_EMAILS` marked deprecated in `.env.example`. Audit MEDIUM 3 closed.
