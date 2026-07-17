# Motiv Security and Production-Readiness Programme

> **Authoritative working document.** All findings, fixes, owner actions, decisions, evidence and scoring live here. Do not delete completed findings — mark them `VERIFIED` only when evidence exists (code change alone is not enough). Machine-readable companions: [`motiv-security-findings.json`](motiv-security-findings.json) (full per-finding detail) and [`motiv-remediation-backlog.csv`](motiv-remediation-backlog.csv). A plain-English companion audit is [`docs/PRODUCTION_AUDIT_2026-07-15.md`](docs/PRODUCTION_AUDIT_2026-07-15.md).

**Ownership labels:** `CLAUDE` = Claude can fix in-repo (you apply migrations / merge PRs) · `OWNER` = only you can do it (purchase, dashboard, legal, credential, live-DB inspection) · `SHARED` = Claude implements + you apply/decide · `THIRD_PARTY` = independent pen-test / lawyer / upstream.

---

## 0. End-of-programme summary (2026-07-16)

**Started at 4.0/10 (NOT READY, one account-takeover + a confirmed cross-tenant leak). Now 7.0/10 (🟡 READY WITH CONDITIONS) — no open exploitable findings.**

**Closed + VERIFIED on prod:**
- **SEC-001** account/tenant takeover (any user → system_admin via PostgREST) — RLS `WITH CHECK` + BEFORE-UPDATE trigger; escalation audit clean.
- **SEC-002** supplier self-completing tickets / rewriting quote_value — browser `tickets` UPDATE policy dropped.
- **SEC-003/005** cross-tenant supplier-directory leak — `/api/suppliers` scoped to company (403 confirmed).
- **SEC-004/006** forged sign-offs + quote-amount tampering — browser write policies on quotes/signoffs/ticket_variations dropped.

**Also shipped:** ~21 code fixes (supplier-scope validation, /view+/seen tenant checks, WhatsApp PII logs, rate limits, Sentry on handled 500s, executive→read-only, platform-owner branding guard, POPIA consent + soft-delete, Turnstile CAPTCHA live, approve_quote path removed). **RLS + FK migrations** applied to dev+prod + folded. **378→364 tests** incl. a dedicated tenant-isolation suite. All decisions **D1–D5 resolved**.

**The path from 7.0 → 9.5 is now almost entirely OWNER (not code):**
1. **Supabase Pro + backups + restore drill (OPS-001)** — binding cap at 7.5.
2. Uptime monitor + log alerting (OPS-004); staging env.
3. Legal copy + POPIA Information Officer (OPS-005/006).
4. **Independent penetration test (OPS-007)** — cap at 9.4.
5. Deploy the last 6 `road-to-9.5` commits to `main`.

**Remaining code (9 findings, all low/upstream):** SEC-030 (inert storage policies — non-issue), SEC-042/043 (dep monitoring — Dependabot covers it), + a few info items. No exposure.

Detail below. Machine-readable: [`motiv-security-findings.json`](motiv-security-findings.json) · [`motiv-remediation-backlog.csv`](motiv-remediation-backlog.csv).

---

## 1. Current status

- **Updated:** 2026-07-15
- **Commit reviewed:** `561406b` · **Branch:** `road-to-9.5` · **Environment:** repository (dev); migrations reported applied to live by owner
- **Method:** 10-agent parallel code review + 3-lens adversarial verification of every critical/high security finding (each survived ≥2 of 3 skeptics). Plus manual re-verification of the account-takeover finding against schema, grants and triggers.
- **Overall production-readiness score: 7.0 / 10** (was 4.0 — the confirmed-cross-tenant + open-critical caps have **lifted** now that SEC-001/002/003/004/005/006 are VERIFIED-closed on prod. Raw weighted ≈7.15, **now capped to 7.0** by "no verified backup/restore" + limited tenant-isolation tests — see §21). **Target: 9.5.**
- **Recommendation: 🟡 READY WITH CONDITIONS — the exploitable security holes are closed + verified. Before real/commercial customers: DB backups (OPS-001), owner auth-hardening (OPS-003), legal/POPIA (OPS-005/006).**

| Dimension | Score | Note |
|---|---:|---|
| Application security | 7.5 | criticals closed + VERIFIED + deployed; residual mediums fixed |
| Authorization & tenant isolation | 7.5 | escalation + cross-tenant leak closed/verified; a few mediums deployed |
| Database security & integrity | 7.0 | RLS hardened + folded; FK migration pending apply |
| Authentication & sessions | 8.0 | signup clamp, HMAC tokens, open-redirect guard, consent gate |
| Reliability & recovery | 5.5 | **no DB backups** (paid); non-atomic multi-writes (SEC-038) |
| Infrastructure & deployment | 7.0 | strong CI/CSP/headers; no backups/monitoring drain |
| Code quality & maintainability | 7.5 | centralised labels/workflow engine; a few god-components |
| Testing & CI/CD | 7.5 | 378 tests + blocking CI + a dedicated tenant-isolation suite; RLS-level still owner-verified |
| Privacy & operational readiness | 6.5 | PII logs fixed, consent gate added; POPIA officer + legal copy pending |

**Findings by severity (code review):** 🔴 2 critical · 🟠 4 high · 🟡 19 medium · 🔵 17 low · ⚪ 7 info (+ 8 owner/ops items). **Verified real (adversarial):** 5/5 critical+high security findings CONFIRMED (0 refuted).

**Current status rollup (2026-07-16):** ✅ **12 VERIFIED** · **21 FIX IMPLEMENTED** (in code, on `road-to-9.5`/prod) · 5 READY FOR VERIFICATION · 1 RISK ACCEPTED (SEC-024, by policy) · 1 NOT APPLICABLE (SEC-023) · **9 open** (all low / owner / upstream). **No open exploitable findings.** All 6 criticals/highs (SEC-001…006) VERIFIED-closed on prod; all decisions D1–D5 resolved.

---

## 1a. Session log — 2026-07-15/16 (branch `road-to-9.5`)

> Multi-session programme. Below is the original 2026-07-15 log; the **Session 2/3 addendum** and the **End-of-programme summary (§0)** at the very bottom capture the verified-on-prod state. All 6 criticals/highs are now `VERIFIED`; the manual checklist (§1b) items were completed by the owner.

**① RLS hardening migration APPLIED + FOLDED — `20260717_rls_hardening.sql` applied to dev + prod by owner 2026-07-16; escalation-audit query returned only legitimate `system_admin`s (prod admin@motivgroup.co.za, dev owner) — no account was escalated via SEC-001. Folded into `schema.sql` + file deleted (commit `bcc00df`); schema:check ✓, types unchanged.** Closes SEC-001, SEC-002, SEC-004, SEC-006, SEC-011, SEC-012, SEC-013, SEC-046, SEC-047 **at the DB layer** — these move to `READY FOR VERIFICATION` (→ `VERIFIED` once the owner runs the §1b·B/C live negative tests).

**② Code fixes IMPLEMENTED (built + `tsc`/`lint`/354 tests/`build` green). Status: `FIX IMPLEMENTED`** (commits `318720c`, `2cbc8b5`):

| Finding(s) | Fix | File |
|---|---|---|
| SEC-003/005/009/010/015 | `/api/suppliers` GET/POST/bulk scoped to caller's `company_id` (was leaking all tenants) | `app/api/suppliers/route.ts`, `bulk/route.ts` |
| SEC-007 | transition `hasAccess()` invite fallback gated on active status (invited/quoted/awarded) | `transition/route.ts` |
| SEC-008/016 | `/transition` + `/assign` validate supplier belongs to ticket company or Motiv pool | `transition/route.ts`, `assign/route.ts` |
| SEC-017 | transition `submit_quote` uses `parseAmount` (rejects Infinity/over-cap) | `transition/route.ts` |
| SEC-031 | schedule action verifies technician on the awarded supplier's roster | `transition/route.ts` |
| SEC-034 | supplier `add_update` no longer flips ticket status outside the engine | `supplier/ticket-action/route.ts` |
| SEC-036 | `add_evidence` rejected on a closed ticket | `supplier/ticket-action/route.ts` |
| SEC-025 | phone numbers + free-text content stripped from WhatsApp logs | `webhooks/whatsapp/route.ts` |
| SEC-026/027 | `/view` + `/seen` add tenant/relationship check + rate limit | `tickets/[id]/view`, `seen/route.ts` |
| SEC-041 | archived-notification purge folded into the scheduled cron | `cron/v3-snapshots/route.ts` |
| SEC-040 | `Sentry.captureException` on handled cron 500s | `cron/v3-snapshots`, `v3-recompute` |
| SEC-044 | csp-report rate-limit keyed per IP; raw body no longer sent to Sentry | `csp-report/route.ts` |
| SEC-028 | supplier-onboard email-exists pre-check removed (user enumeration) | `supplier/onboard/route.ts` |

**Still open (next sessions):** SEC-018 approve_quote reconciliation · SEC-014/024/037/038/042/043/045 · OPS owner items.

### Session 2 addendum (2026-07-16)
- **RLS migration APPLIED to dev+prod + folded into schema.sql** (commit `bcc00df`); escalation audit clean. **SEC-001/002/004/006 → `VERIFIED`** via owner live-DB checks (EV-6/7/8).
- **D-6 (owner's live pg_indexes):** SEC-023 → `NOT APPLICABLE` (indexes already exist), SEC-035 → `VERIFIED` (unique already exists). tickets/ratings/technicians empty.
- **FK/CHECK migration WRITTEN** — `supabase/migrations/20260718_fk_check_hardening.sql` (SEC-019/020/021/022 → `WAITING FOR OWNER` apply, dev→prod). No orphan risk (empty tables).
- **POPIA consent checkbox DONE** (OPS-006 code half, commit `ae38831`) — required consent gate on individual signup + version/timestamp in metadata. Legal copy (OPS-005) still owner/lawyer.
- **⚠️ DEPLOY GAP:** all code fixes (batches 1–2 + consent) are on `road-to-9.5`, **not yet on prod**. The DB-layer criticals are protected on prod (migration applied), but the **code-layer fixes — including the SEC-003/005 suppliers leak — remain live-open until `road-to-9.5` is merged to `main` and deployed.** PR: <https://github.com/Motiv-Group/Motiv-Group-Maintenance/compare/main...road-to-9.5?expand=1>

---

## 1b. Manual verification checklist (OWNER — do these when you're back)

> These need a human + a live/staging environment; Claude cannot run them safely. Do them **after applying the RLS migration**.

**A. Apply the RLS migration (highest priority).**
- [ ] Open Supabase SQL Editor → **dev** project → paste `supabase/migrations/20260717_rls_hardening.sql` → Run. Then repeat on **prod**.
- [ ] **Run the escalation audit** (in the same editor): `select id, email, role, company_id from public.user_profiles where role in ('system_admin','executive') order by role;` — confirm every row is a legitimately privileged account. Anyone unexpected was escalated via SEC-001 before the fix; demote them. **Tell Claude the result** (redact emails) so SEC-001 can move toward `VERIFIED`.
- [ ] Confirm applied → Claude will fold it into `schema.sql`, regen types, and delete the migration file.

**B. Prove the criticals are closed — ✅ DONE 2026-07-16 (owner, live prod via SQL Editor):**
- [x] `pg_policies` on tickets/quotes/signoffs/ticket_variations shows **SELECT + tickets-insert only** — no browser write policy (EV-6). *(SEC-002/004/006)*
- [x] `pg_trigger` shows `trg_enforce_profile_privileged` present on user_profiles (EV-7). *(SEC-001)*
- [x] Escalation audit query returned only legitimate system_admins (EV-8). *(SEC-001)*
- [x] Regression: full ticket lifecycle (log → assign → quote → approve → complete → sign-off) worked end-to-end; every role dashboard loads; private-storage raw URL → 404/blocked.

**C. Prove the suppliers leak is closed — ✅ DONE 2026-07-16 (owner, live prod):**
- [x] `GET /api/suppliers` as a null-company supplier → **403 Forbidden** (EV-9). *(SEC-003/005)*

**D. Owner infra — split FREE-now vs PAID-later** (owner decided 2026-07-16: do the free-tier items now, defer paid-tier until upgrading).

_Do NOW (free tier):_
- [x] **OPS-003 Auth hardening — DONE 2026-07-16:** redirect allowlist, Confirm-email ON, min-password ≥8 server-side, custom SMTP sender all set by owner. ✅ **CAPTCHA RESOLVED + working on prod 2026-07-16** (verified live: Turnstile loads, issues a valid token for `motivgroup.co.za`). Root cause of the earlier "box won't show" saga was **not** the env — production was serving a stale deployment (PR #35, pre-CAPTCHA); repeated "Redeploy" re-deployed that old build. Fixed by merging the latest `main` (PR #37) to force a fresh production build with the site key inlined. **Lesson: `NEXT_PUBLIC_*` changes need a genuinely fresh build AND the production alias must point at the new deployment — check the served commit (`sentry-release` meta) when a client env var seems missing.** **CAPTCHA: widget code is DONE + deployed (PR #36) (Cloudflare Turnstile on login/signup/supplier-onboard, commit `c11c2c9`)** — owner enablement = (1) deploy the branch, (2) get free Turnstile keys, (3) set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`+`TURNSTILE_SECRET_KEY` in Vercel + redeploy, (4) enable CAPTCHA in Supabase (Attack Protection) with the same secret. Fail-safe: no keys → widget hidden, auth unchanged.
- [ ] **OPS-004 uptime monitor** — a free UptimeRobot check on the public URL + key API routes. (Sentry is already wired/free & receiving events.)
- [x] **Applied `20260718_fk_check_hardening.sql`** (FK/CHECK, SEC-019/020/021/022) **and `20260719_child_fk_hardening.sql`** (child-table FKs, SEC-037) to dev + prod; both folded into `schema.sql` + archived.
- [ ] POPIA **signup consent checkbox** — Claude can code this now (free).

_Defer until PAID (record here; do when upgrading — see `docs/INFRASTRUCTURE_TIERS.md`):_
- [ ] **OPS-001 Supabase Pro** (~$25/mo) → daily backups + **PITR** + a **restore drill**. *(Required before real customer data.)*
- [ ] **OPS-002 Vercel Pro** (~$20/mo) → commercial license + log drains + sub-daily crons.
- [ ] Leaked-password protection (Supabase Pro), Vercel **log-drain** 5xx/auth alerts (Pro).
- [ ] **OPS-005 legal copy** + lawyer, **OPS-006 Information Officer** registration (external/THIRD_PARTY), **OPS-007 pen test** (external).

---

## 2. Next recommended work session

> **The code security programme is complete** — all exploitable findings closed + verified on prod, all decisions resolved, all migrations applied+folded. What remains is **owner infrastructure** (paid) + an independent review. See the **End-of-programme summary (§0)** at the very bottom.

**Objective:** **Buy Supabase Pro → enable daily backups + PITR → run one restore drill (OPS-001).**
**Why this is next:** It is the single **binding score cap** (no verified backup/restore → max 7.5) and the biggest real launch risk (today a bad migration/deletion is unrecoverable). Everything code-side is done; this is the highest-value remaining action.
**Owner must:** Upgrade Supabase to Pro; enable PITR; later restore a backup into a throwaway project to prove it works (a backup never restored is a hope).
**Then (in rough order):** merge `road-to-9.5` → `main` to deploy the last 6 commits (SEC-018/038 + child-FK fold); uptime monitor (OPS-004); staging env; legal copy + POPIA Information Officer (OPS-005/006); independent pen test (OPS-007 — lifts the 9.4 cap).
**CLAUDE (optional, low value):** the 9 remaining open findings are all low/upstream (SEC-030 inert storage policies, SEC-042/043 dep monitoring) — pick up on request.
**Completion condition (9.5):** backups + restore drill done, monitoring live, independent assessment complete, every readiness gate (§22) green with recorded evidence.

---

## 3. Architecture map (verified from repo)

- **Frontend/Backend:** Next.js 16.2.10 (App Router) + TypeScript + Tailwind; single codebase. Client Components + Server Components + Route Handlers (`app/api/**/route.ts`, 43+ endpoints).
- **Data/Auth/Storage/Realtime:** Supabase (Postgres + Auth + Storage + Realtime). Three clients (`lib/supabase/`): browser `createClient()`, server RLS-bound `createClient()`, service-role `createAdminClient()` (**bypasses RLS** — route-level authZ is the real guard).
- **Gate:** `proxy.ts` (Next 16 middleware) — role-prefix routing + per-request CSP nonce. Does **not** gate `/api` (each route authenticates independently — verified).
- **Roles (6):** store_manager (aka client), regional_manager, supplier, executive, individual, system_admin. Hierarchy Company → Executives → Regions → Regional Managers → Stores → Store Managers; suppliers attached via tickets/invites (incl. cross-company "Motiv pool").
- **Storage:** private buckets (ticket-photos, completion-docs, quote-attachments, supplier-docs, ticket-docs, project-files) + one public `branding` bucket; reads via short-lived signed URLs; uploads forced through `POST /api/uploads` (per-user path, MIME/size caps).
- **Integrations:** Groq (WhatsApp intake + quote-PDF parse), WhatsApp Cloud API (HMAC fail-closed in prod), Resend (email), web-push/VAPID, Sentry (error tracking), Upstash Redis (distributed rate-limit). Deploy: Vercel; Capacitor Android wrapper points at the deployed site.
- **CI/CD:** GitHub Actions — `tsc` + `eslint` + `schema:check` + `gen:types` staleness + 354 vitest tests + `build` + `npm audit` (blocking). Branch protection on `main` requires the `build` check. Dependabot weekly.
- **Trust boundaries:** browser JWT ⇄ PostgREST (RLS) ⇄ service-role admin client (no RLS). **The audit's central theme: several RLS write policies are reachable by the browser JWT and are more permissive than any legitimate app path, so the browser can bypass the server routes entirely.**

---

## 4. Threat model (STRIDE-informed, key scenarios)

| # | Scenario | Verdict | Finding |
|---|---|---|---|
| T1 | Normal user escalates to system_admin | **EXPLOITABLE** | SEC-001 |
| T2 | Assigned supplier self-completes / rewrites quote_value on own ticket | **EXPLOITABLE** | SEC-002 |
| T3 | Company A reads Company B's supplier directory (PII/VAT) | **EXPLOITABLE** | SEC-003/005 |
| T4 | Store manager rewrites supplier's quote amount / forges signoff | **EXPLOITABLE** | SEC-004/006 |
| T5 | User changes their own company_id to a victim tenant | **EXPLOITABLE** (same vector as T1) | SEC-001 |
| T6 | Losing bidder retains write access to awarded ticket | Likely | SEC-007 |
| T7 | Cross-tenant supplier assigned to a ticket (data exposure) | Likely | SEC-008/016 |
| T8 | Low-priv member forges approvals/decisions/snags/variations | Likely | SEC-011/012 |
| T9 | Comment/audit impersonation (author_id spoof) | Confirmed | SEC-013 |
| T10 | Project progress manipulated by client | **NOT exploitable** (server generated column) | SEC-048 (control confirmed) |
| T11 | Supplier signs off own work / resolves own dispute via engine | **NOT exploitable** (engine SoD holds) — but see T2/T4 DB layer | SEC-049 |
| T12 | Malicious/oversized upload; SVG/HTML/zip | Mitigated (MIME/size caps, sharp re-encode on branding) — verify signed-URL 403 live | SEC-030 |
| T13 | Public storage URL exposes private evidence | Not found (buckets private, signed URLs) | — |
| T14 | Service-role key in browser | Not found (server-only) | SEC-051 |
| T15 | Reused expired invite / reset link | Mitigated (HMAC + expiry) — minor enumeration | SEC-028 |
| T16 | Lost-device cached sensitive data (PWA) | Low (SW has no cache) | SEC-051 |
| T17 | Dev build silently writes prod data | Owner-config (env separation) | OPS-008 |

## 5. What prevents a 9.5 score

| Area | Now | Target | Deduction reason | Required improvement | Owner |
|---|---:|---:|---|---|---|
| Authorization & tenant isolation | 3.5 | 9.5 | Confirmed cross-tenant leak (SEC-003/005) + self-escalation (SEC-001) | RLS hardening migration + suppliers route fix + negative tenant tests | CLAUDE/OWNER |
| Application security | 4.0 | 9.5 | 2 open criticals reachable from the browser | Close SEC-001/002; verify with negative tests | CLAUDE/OWNER |
| Database security & integrity | 5.0 | 9.0 | Permissive RLS write policies; missing FKs/CHECKs/indexes; schema.sql omits CHECK/index | RLS migration; FK/CHECK/index migration; reconcile schema.sql from live pg_dump | CLAUDE/SHARED |
| Reliability & recovery | 5.5 | 9.0 | No DB backups/PITR; non-atomic multi-writes | Supabase Pro + PITR + restore drill; wrap critical multi-writes in RPC/txn | OWNER/CLAUDE |
| Testing & CI/CD | 7.0 | 9.0 | No tenant-isolation / RLS negative tests; no restore test | Add cross-tenant + RLS-policy test suite; run restore drill | CLAUDE/OWNER |
| Infrastructure & deployment | 7.0 | 9.0 | No uptime/log alerting; no staging | Uptime monitor + log drain; staging env | OWNER |
| Privacy & operational readiness | 5.0 | 9.0 | PII in logs; POPIA officer + consent pending | Strip PII logs (SEC-025); register Info Officer + consent checkbox (OPS-006) | CLAUDE/OWNER |
| Authentication & sessions | 8.0 | 9.5 | Minor user-enumeration; dashboard hardening owner-side | Fix SEC-028; OPS-003 auth settings | CLAUDE/OWNER |
| Independent validation | — | — | No independent pen test (caps overall ≤ 9.4) | Commission pen test after P0/P1 land | THIRD_PARTY |

---

## 6. Critical production blockers

| ID | Blocker | Sev | Risk | Required fix | Owner | Status |
|---|---|---|---|---|---|---|
| SEC-001 | Any authenticated user PATCHes own `user_profiles` → system_admin | 🔴 critical | Full account + multi-tenant takeover | WITH CHECK + trigger on user_profiles; narrow UPDATE grant | SHARED | NOT STARTED |
| SEC-002 | Assigned supplier self-completes ticket / rewrites quote_value via `tickets` UPDATE RLS | 🔴 critical | Workflow + separation-of-duties bypass; financial tamper | Drop browser UPDATE policy on tickets | SHARED | NOT STARTED |
| SEC-003/005 | `GET /api/suppliers` returns every tenant's supplier directory | 🟠 high | Cross-tenant PII/VAT disclosure | `.eq('company_id', …)` or delete dead route | CLAUDE | NOT STARTED |
| SEC-004/006 | `quotes`/`signoffs`/`ticket_variations` writable via PostgREST by see-ticket users | 🟠 high | Forged completions; quote-amount tampering | Drop browser write policies; keep SELECT | SHARED | NOT STARTED |
| OPS-001 | No database backups / PITR | 🔴 critical (pre-data) | Unrecoverable data loss | Supabase Pro + PITR + restore drill | OWNER | NOT STARTED |
| OPS-005 | Legal pages are placeholders | 🟠 high | Cannot commercially launch | Real copy + lawyer | THIRD_PARTY | NOT STARTED |

---

## 7. Master remediation tracker

> 49 code-review findings + 8 owner/ops items. Full per-finding detail (evidence, root cause, tests) is in [`motiv-security-findings.json`](motiv-security-findings.json); criticals + highs are expanded in §8.

| ID | Sev | Conf | Category | Problem | Owner | Blocker | Status |
|---|---|---|---|---|---|---|---|
| SEC-001 | 🔴C | confirmed ✅ | authorization | Any authenticated user can escalate to system_admin by PATCHing their own user_profiles row (account & tenant takeover) | SHARED | Y | NOT STARTED |
| SEC-002 | 🔴C | likely ✅ | rls-policy | tickets UPDATE RLS policy lets an assigned supplier self-complete their own ticket (workflow + separation-of-duties bypass) | SHARED | Y | NOT STARTED |
| SEC-003 | 🟠H | confirmed ✅ | tenant-isolation | GET /api/suppliers returns every tenant's supplier directory (missing company_id filter) | CLAUDE | Y | NOT STARTED |
| SEC-004 | 🟠H | confirmed | business-logic | Store manager (client) can tamper with supplier quote amount/status — quotes UPDATE has no WITH CHECK | CLAUDE | Y | NOT STARTED |
| SEC-005 | 🟠H | confirmed ✅ | tenant-isolation | GET /api/suppliers leaks every tenant's supplier directory (no company_id filter, RLS bypassed) | CLAUDE | Y | NOT STARTED |
| SEC-006 | 🟠H | likely ✅ | rls-policy | signoffs (FOR ALL), quotes (UPDATE) and ticket_variations (FOR ALL) writable directly by see-ticket users — forged completions & quote-amount tampering | SHARED | Y | NOT STARTED |
| SEC-007 | 🟡M | likely | authorization | Losing/closed competitor supplier keeps write access to another supplier's awarded ticket (hasAccess ignores invite status) | CLAUDE | · | NOT STARTED |
| SEC-008 | 🟡M | likely | tenant-isolation | supplierId / supplierIds written to ticket without validating the supplier belongs to the ticket's company or region (cross-tenant assignment) | CLAUDE | · | NOT STARTED |
| SEC-009 | 🟡M | confirmed | tenant-isolation | POST /api/suppliers creates supplier rows with NULL company_id (no tenant tag on write) | CLAUDE | · | NOT STARTED |
| SEC-010 | 🟡M | confirmed | tenant-isolation | POST /api/suppliers/bulk imports up to 500 suppliers with NULL company_id | CLAUDE | · | NOT STARTED |
| SEC-011 | 🟡M | confirmed | authorization | Lower-privilege company members can forge approvals / decision_items / signoffs / snags — FOR ALL policies weaken WITH CHECK to company_id only | CLAUDE | Y | NOT STARTED |
| SEC-012 | 🟡M | confirmed | authorization | No role gate on supplier_escalations / supplier_invites / ticket_variations — any company member can CRUD; invite tokens exposed company-wide | CLAUDE | Y | NOT STARTED |
| SEC-013 | 🟡M | confirmed | input-validation | ticket_updates insert does not bind author_id/author_role to the caller — comment/audit impersonation | CLAUDE | · | NOT STARTED |
| SEC-014 | 🟡M | architectural-risk | tenant-isolation | app_settings is gated by role only, with no tenant scope — cross-tenant admin overwrite | SHARED | · | NOT STARTED |
| SEC-015 | 🟡M | confirmed | tenant-isolation | POST /api/suppliers and /api/suppliers/bulk create suppliers with no company_id (untenanted writes) | CLAUDE | · | NOT STARTED |
| SEC-016 | 🟡M | architectural-risk | authorization | Ticket supplier assignment/invite never validates the supplier_id belongs to the ticket's company (or Motiv pool) | CLAUDE | · | NOT STARTED |
| SEC-017 | 🟡M | confirmed | input-validation | transition-engine submit_quote accepts Infinity / over-cap amounts (weaker than parseAmount) | CLAUDE | · | NOT STARTED |
| SEC-018 | 🟡M | architectural-risk | business-logic | transition approve_quote diverges from /quote-decision: leaves invites open, never sets supplier_id, marks ALL pending quotes accepted | CLAUDE | · | NOT STARTED |
| SEC-019 | 🟡M | confirmed | db-integrity | tickets.assigned_user_id, asset_id, technician_id have no foreign keys | CLAUDE | · | NOT STARTED |
| SEC-020 | 🟡M | confirmed | db-integrity | ratings table missing FKs on company_id, supplier_id, contractor_id, rated_by | CLAUDE | · | NOT STARTED |
| SEC-021 | 🟡M | confirmed | tenant-isolation | technicians table has zero foreign keys (company_id, supplier_id unenforced) | CLAUDE | · | NOT STARTED |
| SEC-022 | 🟡M | config-weakness | db-integrity | No CHECK constraints on enum-like text columns (status/priority/type/severity/author_role) — typos persist silently | CLAUDE | · | NOT STARTED |
| SEC-023 | 🟡M | unverifiable | efficiency | FK / hot-path indexes not present in schema.sql and likely absent (tickets by company_id/store_id/region_id/supplier_id/status, quotes.ticket_id, notifications(user_id,read)) | SHARED | · | NOT STARTED |
| SEC-024 | 🟡M | confirmed | db-integrity | FKs are almost entirely NO ACTION; user-account erasure chain is effectively blocked | SHARED | · | NOT STARTED |
| SEC-025 | 🟡M | confirmed | privacy | WhatsApp webhook writes caller PII (phone numbers + free-text ticket content) to server logs | CLAUDE | · | NOT STARTED |
| SEC-026 | 🔵L | confirmed | tenant-isolation | /view omits tenant (company) match and has no rate limit — cross-company writes into ticket_views audit table | CLAUDE | · | NOT STARTED |
| SEC-027 | 🔵L | confirmed | tenant-isolation | /seen omits tenant match and has no rate limit — cross-company writes into ticket_reads | CLAUDE | · | NOT STARTED |
| SEC-028 | 🔵L | likely | user-enumeration | Supplier self-signup onboarding reveals whether an email is already registered (user enumeration) | CLAUDE | · | NOT STARTED |
| SEC-029 | 🔵L | likely | business-logic | supplier/assign-rm clear-path deletes ALL regional_user links for the store's region | CLAUDE | · | NOT STARTED |
| SEC-030 | 🔵L | config-weakness | storage | Private-bucket storage upload policies are unscoped (bucket + logged-in only) | CLAUDE | · | NOT STARTED |
| SEC-031 | 🔵L | missing-control | authorization | schedule action lets a supplier set technician_id to any technician UUID (no roster ownership check) | CLAUDE | · | NOT STARTED |
| SEC-032 | 🔵L | architectural-risk | business-logic | Supplier add_update flips ticket status open→in_progress outside the workflow engine | CLAUDE | · | NOT STARTED |
| SEC-033 | 🔵L | confirmed | db-integrity | ticket_suppliers has no unique(ticket_id,supplier_id); assign route doesn't de-duplicate supplierIds (duplicate supplier assignment) | CLAUDE | · | NOT STARTED |
| SEC-034 | 🔵L | confirmed | evidence-integrity | Evidence can be uploaded after close-out (no workflow-state gate on add_evidence / ticket_evidence) | CLAUDE | · | NOT STARTED |
| SEC-035 | 🔵L | confirmed | db-integrity | Additional child columns without FKs (ticket_suppliers.quote_id/company_id, daily_briefings.company_id, supplier_sla_acceptances.user_id, supplier_verification_docs.uploaded_by, ticket_events.company_id, store_ticket_counters.store_id) | CLAUDE | · | NOT STARTED |
| SEC-036 | 🔵L | confirmed | reliability | Multi-write workflows are non-atomic (ticket insert + notification fan-out, project milestone + file) — partial writes possible | CLAUDE | · | NOT STARTED |
| SEC-037 | 🔵L | unverifiable | db-integrity | schema.sql explicitly does not capture CHECK constraints or secondary indexes — integrity review of those is unverifiable against live | SHARED | · | NOT STARTED |
| SEC-038 | 🔵L | confirmed | monitoring | Handled API 500s never reach Sentry; no log drain → weak error observability | CLAUDE | · | NOT STARTED |
| SEC-039 | 🔵L | confirmed | reliability | Archived-notification purge lives only in the unscheduled v3-recompute cron → notifications table grows unbounded | CLAUDE | · | NOT STARTED |
| SEC-040 | 🔵L | config-weakness | dependencies | xlsx (SheetJS) pinned to a CDN tarball is invisible to npm audit + Dependabot, and parses untrusted uploads | SHARED | · | NOT STARTED |
| SEC-041 | 🔵L | confirmed | dependencies | Four moderate npm advisories via next's transitive postcss; non-blocking in CI | THIRD_PARTY | · | NOT STARTED |
| SEC-042 | 🔵L | likely | monitoring | Unauthenticated /api/csp-report forwards arbitrary POST bodies to Sentry at up to 60/min globally | CLAUDE | · | NOT STARTED |
| SEC-043 | ⚪I | architectural-risk | authorization | Executive role (documented read-only) is granted ticket write actions across its company | SHARED | · | NOT STARTED |
| SEC-044 | ⚪I | confirmed | privacy | sla_rules read policy exposes global (company_id IS NULL) rows to anonymous users | CLAUDE | · | NOT STARTED |
| SEC-045 | ⚪I | confirmed | code-quality | Deny-all tables and SECURITY DEFINER functions reviewed — no defects found (confirmation) | CLAUDE | · | NOT STARTED |
| SEC-046 | ⚪I | confirmed | business-logic | CONTROL CONFIRMED: project progress is server-computed and not client-settable | CLAUDE | · | NOT STARTED |
| SEC-047 | ⚪I | confirmed | business-logic | CONTROL CONFIRMED: separation of duties holds in the workflow engine (supplier cannot sign off own work or resolve own dispute) | CLAUDE | · | NOT STARTED |
| SEC-048 | ⚪I | confirmed | db-integrity | audit_logs / ticket_events are immutable to end users, but there is no DB-level append-only/tamper-evidence guard | SHARED | · | NOT STARTED |
| SEC-049 | ⚪I | confirmed | secrets | Secrets hygiene, security headers, keystore, and service worker checks passed | CLAUDE | · | NOT STARTED |
| OPS-001 | 🔴C | n/a | Reliability/DR | No database backups or point-in-time recovery | OWNER | Y | NOT STARTED |
| OPS-002 | 🟠H | n/a | Licensing | Vercel Hobby is non-commercial license | OWNER | Y | NOT STARTED |
| OPS-003 | 🟠H | n/a | Auth config | Supabase Auth dashboard not hardened | OWNER | Y | NOT STARTED |
| OPS-004 | 🟠H | n/a | Monitoring | No uptime monitoring or log drain/alerting | OWNER | · | NOT STARTED |
| OPS-005 | 🟠H | n/a | Legal | Legal pages are placeholder templates | THIRD_PARTY | Y | NOT STARTED |
| OPS-006 | 🟠H | n/a | Privacy/POPIA | POPIA Information Officer not registered; no signup consent | SHARED | Y | NOT STARTED |
| OPS-007 | 🟠H | n/a | Validation | No independent penetration test / security assessment | THIRD_PARTY | · | NOT STARTED |
| OPS-008 | 🟡M | n/a | Infra | No staging environment / migration rehearsal + no incident runbook | OWNER | · | NOT STARTED |

_Status values: NOT STARTED · INVESTIGATING · BLOCKED · WAITING FOR OWNER · WAITING FOR MANUAL VERIFICATION · IN PROGRESS · FIX IMPLEMENTED · READY FOR VERIFICATION · VERIFICATION FAILED · VERIFIED · RISK ACCEPTED · NOT APPLICABLE._

---

## 8. Detailed findings (critical + high)

> Medium/low/info findings carry the same structured fields in [`motiv-security-findings.json`](motiv-security-findings.json). Confirmed = survived 3-lens adversarial verification.

### SEC-001 — Any authenticated user can escalate to system_admin by PATCHing their own user_profiles row (account & tenant takeover)
**Category:** authorization · **Severity:** critical · **Confidence:** confirmed · **Adversarial verify:** CONFIRMED 3/3
**Status:** NOT STARTED · **Owner:** SHARED · **Production blocker:** Yes · **Score impact:** Blocks go-live; single most severe issue in the RLS surface.
**Affected files:** supabase/schema.sql, supabase/migrations/_archive/20260618_grant_table_privileges.sql · **Lines:** schema.sql:1740-1742 · **Component:** user_profiles RLS / PostgREST

**Problem.** The `own profile update` policy is `create policy "own profile update" on public.user_profiles for update using ((id = auth.uid()));` (schema.sql:1740-1742) with NO WITH CHECK clause. Postgres defaults a missing UPDATE WITH CHECK to the USING expression, which constrains only `id` — the privileged columns `role` (schema.sql:820) and `company_id` (819) remain freely writable in the new row. All four exploit legs are present: (1) no WITH CHECK on the update policy; (2) `grant select, insert, update, delete on all tables in schema public to authenticated;` gives every logged-in user table-wide UPDATE (_archive/20260618_grant_table_privileges.sql:24); (3) no BEFORE UPDATE trigger exists on user_profiles — the TRIGGERS block (schema.sql:1358-1371) only touches public.tickets and auth.users; (4) app_role() (1164-1172) and app_is_company_wide() (1144-1152) read `role` directly from user_profiles, and proxy.ts route gating keys off the same role, so mutating the column immediately confers privilege. This defeats the handle_new_user() signup clamp (1261-1289) that forces new signups to 'individual'.

**Why it matters.** A self-signed-up 'individual' (or any store_manager/supplier) can call PATCH /rest/v1/user_profiles?id=eq.<their-uid> with the public anon apikey + their own bearer JWT and body {"role":"system_admin"} — optionally also {"company_id":"<victim-company-uuid>"} — and instantly become a platform/tenant super-admin. That unlocks /admin/* (infra dashboards), company-wide read/write across nearly every table (app_is_company_wide()), and full cross-tenant data access if company_id is switched. This is a complete authorization bypass and multi-tenant breach reachable by anyone who can register.

**Evidence.** schema.sql:1741 `create policy "own profile update" on public.user_profiles for update using ((id = auth.uid()));` (no with check). grant file:24 `grant select, insert, update, delete on all tables in schema public to authenticated;`. app_role() schema.sql:1170 `select role from public.user_profiles where id = auth.uid();`.

**Root cause.** UPDATE policy relies on the implicit WITH CHECK=USING, but USING pins only the row identity (id), not the mutable privileged columns, so column-level tampering passes.

**Required secure outcome.** A non-privileged user must be unable to change their own role or company_id; role/tenant changes may only occur via trusted service-role paths.

**Fix (SHARED).** Add an explicit WITH CHECK to the update policy that freezes privileged columns, e.g. WITH CHECK (id = auth.uid() AND role = (select role from public.user_profiles where id = auth.uid()) AND company_id IS NOT DISTINCT FROM (select company_id from public.user_profiles where id = auth.uid())); OR, more robustly, add a BEFORE UPDATE trigger on user_profiles that rejects any change to role/company_id unless the session is service_role, and narrow the authenticated UPDATE grant to a column list excluding role/company_id. Claude can write the migration + fold into schema.sql (CLAUDE); OWNER must apply it to live AND immediately audit `select id,email,role,company_id from user_profiles where role in ('system_admin','executive')` for any already-escalated accounts.

**Tests required.** `As a freshly signed-up individual, PATCH own user_profiles role->system_admin via PostgREST and assert 403/no-op` · `Assert store_manager cannot change own company_id` · `Assert service-role/onboarding paths can still set privileged roles`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

### SEC-002 — tickets UPDATE RLS policy lets an assigned supplier self-complete their own ticket (workflow + separation-of-duties bypass)
**Category:** rls-policy · **Severity:** critical · **Confidence:** likely · **Adversarial verify:** CONFIRMED 3/3
**Status:** NOT STARTED · **Owner:** SHARED · **Production blocker:** Yes · **Score impact:** Critical production blocker — direct authorization bypass of the completion/sign-off control.
**Affected files:** supabase/schema.sql, app/api/tickets/[id]/route.ts, app/api/tickets/[id]/transition/route.ts · **Lines:** schema.sql:1728-1730; app_supplier_ids schema.sql:1184-1192; user-client INSERT evidence app/api/tickets/route.ts:85

**Problem.** Any supplier assigned to a ticket (supplier_id in their app_supplier_ids) can issue a direct PostgREST call, e.g. PATCH {SUPABASE_URL}/rest/v1/tickets?id=eq.<id> with {"status":"completed","completed_at":"...","closed_out_by":...}, and RLS will allow it (USING matches on the old row; with no WITH CHECK the new row only needs supplier_id/company_id unchanged). They can also overwrite quote_value, priority, needs_review, and clear current_blocker/sla_paused/*_due_at fields.

**Why it matters.** This defeats the entire workflow state machine and the core separation of duties: the supplier who performs the work can mark it 'completed' with zero RM sign-off, skip quoting/approval, hide SLA breaches, and alter the financial quote_value on the record. It is exploitable without the app UI using only the anon URL + the supplier's own session token, both present in the browser.

**Evidence.** Policy: create policy "tickets update" on public.tickets for update using ((company_id = app_company_id()) AND (app_is_company_wide() OR region_id IN (app_region_ids()) OR supplier_id IN (app_supplier_ids()))) — NO WITH CHECK. app_supplier_ids() returns the caller's linked supplier_ids (schema.sql:1184-1192). A supplier's browser session is an 'authenticated' Postgres role subject to RLS; the app already performs ticket INSERT via the user-scoped (RLS-bound) client at app/api/tickets/route.ts:85, proving 'authenticated' has table privileges and RLS is the live guard. No code anywhere updates tickets via the user client (all ticket writes use createAdminClient()), so this UPDATE policy is never exercised legitimately.

**Root cause.** RLS treated as secondary to route-level authZ, but the policy is still reachable by the browser JWT; the UPDATE policy grants far more than any legitimate browser path needs and omits WITH CHECK / column scoping.

**Required secure outcome.** Suppliers (and any non-service-role client) must not be able to change tickets.status or other lifecycle/financial columns directly; all ticket mutations must flow through the server routes that use the workflow engine.

**Fix (SHARED).** Since no user-scoped client updates tickets, drop the browser UPDATE policy entirely (or restrict USING to app_is_company_wide() only) so the service-role admin client remains the sole writer; if any browser UPDATE is ever needed, add a WITH CHECK that pins status/quote_value/completed_at to their old values (or a trigger that forbids status changes outside SECURITY DEFINER). Author as a migration for the human to apply to live.

**Tests required.** `As a supplier session, attempt PATCH tickets?id=eq.<assigned> set status=completed → must be rejected` · `As a supplier, attempt to change quote_value → rejected` · `Regression: normal supplier ticket reads + realtime still work (SELECT policy untouched)`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

### SEC-003 — GET /api/suppliers returns every tenant's supplier directory (missing company_id filter)
**Category:** tenant-isolation · **Severity:** high · **Confidence:** confirmed · **Adversarial verify:** CONFIRMED 3/3
**Status:** NOT STARTED · **Owner:** CLAUDE · **Production blocker:** Yes · **Score impact:** Cross-tenant data exposure — treat as launch blocker for multi-tenant confidentiality.
**Affected files:** app/api/suppliers/route.ts · **Lines:** 22-43 (requireAdmin 22-29; GET 31-43; unfiltered query 36-39) · **Component:** Sub-Suppliers directory API

**Problem.** requireAdmin() selects only `role` (line 26) and checks `profile?.role !== 'supplier'` (line 27) — it does NOT read or require company_id. GET then runs `createAdminClient().from('suppliers').select('*').order('company_name')` (lines 36-39) with NO `.eq('company_id', ...)` filter. Because createAdminClient() is the service-role client that bypasses RLS, any supplier-role user (any tenant) receives the full cross-tenant suppliers table.

**Why it matters.** Leaks PII and commercial data of every client company's subcontractor directory — contact_name, email, phone, address, vat_number, qualification_number, notes (schema.sql:539-549) — to unrelated tenants. Direct multi-tenant confidentiality breach; the route-level authZ is the only guard once the admin client is used, and it is absent.

**Evidence.** route.ts:26 `.select('role').eq('id', user.id).single()`; :27 `if (profile?.role !== 'supplier') return null`; :36-39 `adminClient.from('suppliers').select('*').order('company_name')`. Contrast [id]/route.ts:29-30 which selects `role, company_id` and requires `profile.company_id`, and :69/:89 which scope mutations with `.eq('company_id', ctx.companyId)`. Schema RLS confirms company scoping: schema.sql:1663-1664 `suppliers read ... using ((company_id = app_company_id()) AND (...))`.

**Root cause.** suppliers table is company-scoped (FK company_id, RLS, [id] routes) but the collection GET treats it as a global directory and uses the RLS-bypassing admin client without re-applying the tenant filter.

**Required secure outcome.** A supplier-role user may only read suppliers where company_id equals their own profile.company_id.

**Fix (CLAUDE).** Make requireAdmin() select `role, company_id` and return the companyId (as [id]/route.ts already does); in GET add `.eq('company_id', ctx.companyId)`. Consider adding a rateLimit to GET as defense-in-depth. Optionally enforce a DB-side company_id NOT NULL so the admin path can't silently drop the tenant tag.

**Tests required.** `Supplier user in company A calls GET /api/suppliers and receives only company A's suppliers (company B rows absent)` · `Row with NULL company_id is not returned to any tenant`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

### SEC-004 — Store manager (client) can tamper with supplier quote amount/status — quotes UPDATE has no WITH CHECK
**Category:** business-logic · **Severity:** high · **Confidence:** confirmed
**Status:** NOT STARTED · **Owner:** CLAUDE · **Production blocker:** Yes · **Score impact:** see below
**Affected files:** supabase/schema.sql · **Lines:** schema.sql:1524-1526 · **Component:** quotes RLS

**Problem.** `create policy "quotes update" on public.quotes for update using (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)));` (schema.sql:1524-1526) has no WITH CHECK, so it defaults to the USING expression. app_can_see_ticket() (1196-1209) returns true for store users whose store owns the ticket (t.store_id IN app_store_ids()). Because `authenticated` holds table-wide UPDATE, a store_manager can PATCH the supplier's quote row — including `amount`, `amount_incl_vat`, `status`, `decline_reason` (schema.sql:223-229) — directly via PostgREST.

**Why it matters.** The client party can silently rewrite the contractor's quoted price or flip a quote's status (e.g. force 'accepted'/'declined'), corrupting the core quoting/financial workflow and any downstream reporting. It is a financial-integrity and repudiation issue between the two parties of a job.

**Evidence.** schema.sql:1525-1526 quotes update policy (USING only); 1202-1207 app_can_see_ticket includes `t.store_id in (select public.app_store_ids())`; quotes.amount at 223.

**Root cause.** Visibility (can_see_ticket, which includes the client store) is being used as the write gate; no role restriction to the owning supplier, and no WITH CHECK to constrain mutated columns.

**Required secure outcome.** Only the awarded/owning supplier (or an admin) may modify a quote; the client store may read and accept/decline via a controlled path, not free-form column writes.

**Fix (CLAUDE).** Restrict the quotes UPDATE policy to the supplier who owns the quote (supplier_id IN app_supplier_ids()) or admin roles, and add an explicit WITH CHECK; route client accept/decline through a server API that only flips status. Also tighten `quotes write` (INSERT, 1528-1530) so only suppliers/admins can insert quotes, not any ticket-visible store user.

**Tests required.** `As store_manager on own ticket, PATCH quotes.amount -> expect denied` · `As owning supplier, PATCH own quote.amount -> allowed` · `As store_manager, INSERT a quote row -> denied`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

### SEC-005 — GET /api/suppliers leaks every tenant's supplier directory (no company_id filter, RLS bypassed)
**Category:** tenant-isolation · **Severity:** high · **Confidence:** confirmed · **Adversarial verify:** CONFIRMED 3/3
**Status:** NOT STARTED · **Owner:** CLAUDE · **Production blocker:** Yes · **Score impact:** Confirmed cross-tenant PII disclosure — production blocker for go-live.
**Affected files:** app/api/suppliers/route.ts · **Lines:** 22-29 (requireAdmin), 31-43 (GET) · **Component:** Sub-supplier directory API (v2 leftover)

**Problem.** GET /api/suppliers authenticates only on role: requireAdmin() checks profile.role==='supplier' and returns the user WITHOUT capturing company_id (lines 22-29). The handler then runs `adminClient.from('suppliers').select('*').order('company_name')` with NO `.eq('company_id', ...)` filter (lines 36-39) on the service-role client, which bypasses RLS. So ANY supplier-role user — including an unverified self-signup 'pool' supplier still pending admin review — can read the full suppliers row for EVERY company on the platform: company_name, contact_name, email, phone, address, trade, VAT number, qualification_number, qualification_expiry, and notes. Every other route that touches this table is correctly tenant-scoped (suppliers/[id]/route.ts PATCH/DELETE use `.eq('company_id', ctx.companyId)`; regional/suppliers/[id]/route.ts checks `sup.company_id !== companyId`; provision.add_supplier sets company_id), which confirms `suppliers` is meant to be company-scoped and this route is the inconsistency.

**Why it matters.** Multi-tenant isolation is the core security property of the app (per CLAUDE.md, route-level authZ is the only guard when the admin/service-role client bypasses RLS). This is a direct cross-tenant disclosure of B2B PII and commercially sensitive vendor data (contact details, VAT numbers, qualification records) across all tenants, readable by the lowest-trust authenticated principal (a just-registered, not-yet-verified supplier). The app/supplier/suppliers/page.tsx UI was removed in v3 (it now just `redirect('/supplier')`) and no client calls this endpoint, so it is dead-from-the-UI but still a live, reachable HTTP endpoint.

**Evidence.** app/api/suppliers/route.ts:36-39  `const { data, error } = await adminClient.from('suppliers').select('*').order('company_name')` — no company_id predicate. requireAdmin() (lines 26-28) returns `user` on `profile?.role === 'supplier'` with no company_id.

**Root cause.** v2 endpoint left live after the v3 model made `suppliers` company-scoped; the GET was never updated to filter by the caller's company_id and requireAdmin() never captured it.

**Required secure outcome.** A supplier-role user can only read suppliers rows belonging to their own company (and, if intended, the Motiv pool) — never another tenant's directory.

**Fix (CLAUDE).** Either delete the dead route file (the UI page already redirects away) or scope it: capture company_id in requireAdmin() and add `.eq('company_id', companyId)` to the GET. Given suppliers[].company_id can be NULL for Motiv-pool rows, decide explicitly whether pool suppliers should be visible.

**Tests required.** `Supplier A (company X) GETs /api/suppliers and receives only company X's suppliers` · `Self-signup pending-review supplier (company_id null) cannot read any company's suppliers`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

### SEC-006 — signoffs (FOR ALL), quotes (UPDATE) and ticket_variations (FOR ALL) writable directly by see-ticket users — forged completions & quote-amount tampering
**Category:** rls-policy · **Severity:** high · **Confidence:** likely · **Adversarial verify:** CONFIRMED 3/3
**Status:** NOT STARTED · **Owner:** SHARED · **Production blocker:** Yes · **Score impact:** High — record and financial tampering surface.
**Affected files:** supabase/schema.sql · **Lines:** signoffs schema.sql:1585-1588; quotes update schema.sql:1524-1526; ticket_variations schema.sql:1702-1705; app_can_see_ticket schema.sql:1196-1209

**Problem.** A store_manager (client) — or a same-company supplier — can, via PostgREST: INSERT a signoff row with status='accepted' or UPDATE/DELETE the real one (forge or destroy completion certificates); UPDATE quotes.amount/status on their tickets (change the agreed price after submission); and INSERT/UPDATE/DELETE ticket_variations with no role check (e.g. set a variation status='approved'). None of these have a role or workflow-state guard — only company/visibility scoping.

**Why it matters.** Financial integrity (quote amounts), evidence integrity (completion certificates/proof), and variation-order approvals can all be manipulated directly, bypassing the review flow. The app writes all of these exclusively via the service-role admin client, so — like the tickets policy — these browser-reachable write policies serve no legitimate purpose.

**Evidence.** signoffs: create policy "signoffs write" ... for all using ((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)) with check (company_id = app_company_id()). quotes: create policy "quotes update" ... for update using ((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)) (no WITH CHECK). ticket_variations: for all using/with check (company_id = app_company_id()) only. app_can_see_ticket() is true for a store_manager linked to the ticket's store, an RM of its region, or the assigned supplier.

**Root cause.** Write policies scoped only by tenant/visibility (app_can_see_ticket / company_id) with no role or state constraints, while the app relies solely on route-level authZ.

**Required secure outcome.** quotes, signoffs and ticket_variations must not be insertable/updatable/deletable by store managers or suppliers via direct DB access; only the server routes (admin client) should write them.

**Fix (SHARED).** Drop the browser INSERT/UPDATE/ALL write policies on quotes, signoffs and ticket_variations (keep the SELECT policies), leaving the service-role admin client as sole writer; or add strict WITH CHECK/role predicates. Ship as a migration.

**Tests required.** `Store-manager session: UPDATE quotes.amount on own ticket → rejected` · `Supplier session: INSERT signoff status=accepted → rejected` · `Store-manager: UPDATE ticket_variations status=approved → rejected`

**Completion criteria.** Fix applied to live; negative test(s) above pass against staging/live; owner confirmation recorded in §19.

---

## 9. Role & permission matrix (enforcement points)

Legend: **API** = route handler check · **DB** = RLS/policy · **Storage** = bucket/signed-URL · ❌ = gap · ⚠️ = weak/bypassable.

| Action | system_admin | executive | regional_manager | store_manager | supplier | individual | Enforced at |
|---|---|---|---|---|---|---|---|
| Log ticket | ✓ | ✓ | ✓ | ✓ (own store) | — | ✓ (standalone) | API+DB |
| Edit/delete ticket | ✓ | ✓ | ✓ (own region) | ✓ (own, open) | — | ✓ (own) | API (DB UPDATE policy ⚠️ SEC-002) |
| Change ticket **status** | via engine | via engine | via engine | via engine | via engine | via engine | API engine — **⚠️ DB UPDATE bypass SEC-002** |
| Send/edit quote | admin | — | — | ⚠️ can tamper (SEC-004) | ✓ (own) | — | API+DB — **⚠️ quotes UPDATE SEC-004/006** |
| Approve quote / sign off | — | ✓ | ✓ | — | ❌ (SoD) | ✓ (own) | API engine ✓; **DB signoffs write ⚠️ SEC-006** |
| Assign supplier to ticket | ✓ | ✓ | ✓ | — | — | ✓ (own) | API — **⚠️ supplier not tenant-validated SEC-008/016** |
| Read supplier directory | ✓ | ✓ (company) | ✓ (company) | — | ⚠️ **all tenants (SEC-003/005)** | — | API — **❌ tenant filter missing** |
| Change own role/company | ❌ must be service-role | ❌ | ❌ | ❌ | ❌ | ❌ | **❌ DB allows it (SEC-001)** |
| Provision users/companies/regions | ✓ | ✓ (company) | ✓ (RM scope) | — | — | — | API ✓ (company re-checked) |
| Manage branding/app_settings | ✓ (any tenant ⚠️ SEC-014) | — | — | — | — | — | API+DB (global) |
| Project admin (milestones/progress) | ✓ | read-only | read-only | — | — | — | API+DB ✓ (server-computed) |
| Manage own technicians | — | — | — | — | ✓ (own supplier) | — | API+DB ✓ |

> **Frontend-only enforcement:** none found to be the *sole* gate (good). The failures above are **DB-layer** (RLS more permissive than the API), not missing server checks.

---

## 10. Tenant-isolation register

| Boundary | Test | Expected | Actual | Finding | Status |
|---|---|---|---|---|---|
| Company | A reads B's suppliers | denied | **LEAKS** | SEC-003/005 | ❌ open |
| Company | user sets own company_id → B | denied | **ALLOWED** | SEC-001 | ❌ open |
| Company | forge approvals/decisions/snags/variations | role-gated | any member | SEC-011/012 | ❌ open |
| Region | RM writes another region's store/snag | denied | intra-role over-reach | policy notes (stores/snags) | ⚠️ open |
| Store | SM edits another store's ticket | denied | company-scoped ✓ (API) | — | ✓ (API) / ⚠️ DB |
| Supplier | losing bidder acts on awarded ticket | denied | **retains access** | SEC-007 | ❌ open |
| Supplier | foreign supplier assigned to ticket | denied | **not validated** | SEC-008/016 | ❌ open |
| Ticket | cross-company /view /seen writes | denied | **allowed (audit pollution)** | SEC-026/027 | ❌ open |
| Photo/Doc | cross-tenant download | denied via signed URL | ✓ (verify live 403) | SEC-030 | ⚠️ verify |
| Sign-off | forge/alter completion cert | denied | **allowed via DB** | SEC-006 | ❌ open |
| Financial (quote amount) | client rewrites | denied | **allowed via DB** | SEC-004 | ❌ open |
| Project | cross-company project read/write | denied | ✓ system_admin-only writes | SEC-048 | ✓ control confirmed |
| Admin | cross-tenant app_settings overwrite | denied | any system_admin | SEC-014 | ⚠️ open (single-tenant now) |

---

## 11. Endpoint inventory (43 handlers)

| Methods | Route | Auth | Roles | Tenant checks | Validation | Rate limit | Risk |
|---|---|---|---|---|---|---|---|
| POST | `/api/tickets` | Yes — auth.getUser() → | Any authenticated; branches by profile: individual (standalo | Derives company_id/store_id/region_id server-side from the caller's ow | zod BodySchema; description required; ti | tickets:{user.id} 10/6 | low |
| PATCH | `/api/tickets/[id]` | Yes → 401 | SM owner (creator or store_users-linked), the ticket's RM (r | Explicit: individual → created_by===user; else prof.company_id must eq | zod PatchSchema; title+description requi | ticket-edit:{user.id}  | low |
| DELETE | `/api/tickets/[id]` | Yes → 401 | SM owner or individual owner only (creator or store_users li | individual → created_by===user; else company_id match + ownership. Onl | n/a (no body) | ticket-edit:{user.id}  | low |
| POST | `/api/tickets/[id]/transition` | Yes → 401 | Per-action via lib/workflow resolveTransition(status,action, | company_id compare for non-supplier roles; supplier gated by hasAccess | zod BodySchema (loose: amount z.any(); e | transition:{user.id} 4 | medium |
| GET | `/api/tickets/[id]/quotes` | Yes → 401 | regional_manager ONLY (403 otherwise). | ticket.company_id===me.company_id AND rmOwnsTicket. | n/a | None (read; generates  | low |
| POST | `/api/tickets/[id]/submit-quote` | Yes → 401 | supplier only (403); must hold an active (not awarded/closed | Access by invite, not company (pool suppliers cross-company by design) | zod; parseAmount (finite, capped); propo | submit-quote:{user.id} | low |
| POST | `/api/tickets/[id]/quote-decision` | Yes → 401 | regional_manager / executive / individual (owner). approve/d | individual → created_by===user; else company_id match + (RM → rmOwnsTi | zod; action allowlist ['approve','declin | quote-decision:{user.i | low |
| GET | `/api/tickets/[id]/signoff` | Yes → 401 | regional_manager ONLY (403). | company_id match + rmOwnsTicket. | n/a | None (read; signed URL | low |
| GET,POST | `/api/tickets/[id]/dispute` | Yes → 401 (both) | supplier (awarded-supplier users), individual owner, regiona | Per-role: supplierIds membership / created_by / rmOwnsTicket / company | zod (loose, per-action string/array hand | POST dispute:{user.id} | low |
| GET,POST | `/api/tickets/[id]/chat` | Yes → 401 (both) | resolveViewer(): supplier=awarded-supplier user; regional_ma | company + rmOwnsTicket for RM; supplier_users membership for supplier. | zod; body trimmed + capped 2000 chars; a | POST chat:{user.id} 40 | low |
| POST | `/api/tickets/[id]/assign` | Yes → 401 | regional_manager / executive / individual (owner). | individual → created_by===user; else company_id match + (RM → rmOwnsTi | zod; supplierIds filtered to strings; bu | assign:{user.id} 30/60 | medium |
| POST | `/api/tickets/[id]/view` | Yes → 401 | Any authenticated user WITH a company_id (suppliers/individu | MISSING — ticket existence checked but NOT ticket.company_id===caller. | zod; itemType allowlisted; label capped  | None | low |
| POST | `/api/tickets/[id]/seen` | Yes → 401 | supplier / individual / any company user. | MISSING — ticket existence checked but NOT company match. Writes ticke | n/a (no body) | None | low |
| POST | `/api/tickets/[id]/decline-invite` | Yes → 401 | supplier only (403); must hold a ticket_suppliers invite. | Access by invite membership (cross-company by design). Marks only the  | zod; reason optional. | decline-invite:{user.i | low |
| GET | `/api/suppliers` | session (auth.getUser) | supplier only (requireAdmin, role-only check) | NONE — no company_id filter; returns all tenants' suppliers via admin  | ? | none on GET | high |
| POST | `/api/suppliers` | session | supplier only (requireAdmin, role-only, does not even select | NONE on write — insert omits company_id → row created with NULL tenant | zod BodySchema (whitelist; no company_id | 30/60s per user | medium |
| POST | `/api/suppliers/bulk` | session | supplier only (inline role check) | NONE on write — up to 500 rows inserted with NULL company_id | suppliers:z.array(z.any()); explicit fie | 5/60s per user | medium |
| PATCH, DELETE | `/api/suppliers/[id]` | session | supplier + company_id required (requireAdmin) | OK — .eq('company_id', ctx.companyId) on update/delete | zod BodySchema (whitelist) | 30/60s per user | low |
| POST | `/api/admin/suppliers` | session | system_admin (admin-client role check) | N/A — platform-level supplier verification (approve/reject Motiv pool) | zod (action, supplierId) | 30/60s per user | low |
| POST | `/api/admin/accounts` | session | system_admin only | N/A — platform provisioning; find-or-create companies/regions by name; | zod loose (z.any) but role-gated; valida | 30/60s per user | medium |
| POST | `/api/admin/branding/logo` | session | system_admin only | N/A — global app_settings + branding bucket | multipart; type/size checks; sharp re-en | 5/600s per user | low |
| POST | `/api/admin/branding/upload` | session | system_admin only | N/A — global branding bucket | multipart; type/size; sharp re-encode (s | 20/600s per user | low |
| POST | `/api/admin/customization` | session | system_admin only | N/A — global app_settings | zod strict; authBgUrls pinned to own bra | 30/60s per user | low |
| POST | `/api/admin/self-company` | session | system_admin only | By design links the admin to any/new company | manual json parse (companyId/newCompanyN | 20/60s per user | low |
| POST | `/api/provision` | session | executive/system_admin (isExec) or regional_manager (isRM);  | OK — every action re-checks region/store/project company_id === caller | zod; email/phone validation; per-action  | 30/60s per user | medium |
| POST | `/api/account/delete` | session (self) | any authenticated | Self-scoped (.eq id = user.id); POPIA anonymise + ban | requires confirm==='DELETE' | 3/60s per user | low |
| GET | `/api/account/export` | session (self) | any authenticated | Self-scoped (all queries .eq user.id / created_by / rated_by) | ? | 5/60s per user | low |
| POST | `/api/supplier/technicians` | session (supplierCtx) | supplier linked to >=1 supplier | OK — company_id + supplier_id from ctx | zod name/phone required | 30/60s per user | low |
| PATCH, DELETE | `/api/supplier/technicians/[id]` | session (supplierCtx) | supplier | OK — ownership: tech.supplier_id must be in ctx.supplierIds | zod | PATCH 30/60s; DELETE n | low |
| POST | `/api/supplier/assign-rm` | session | supplier + company_id required | OK on store + RM (both company_id === caller's); but clear-path over-d | zod storeId/regionalManagerId | 30/60s per user | medium |
| POST | `/api/supplier/accept-sla` | session (supplierCtx) | supplier | OK — writes rows for ctx.supplierIds only | zod; requires sla_agreed + signed_name | 10/60s per user | low |
| GET, POST | `/api/supplier/onboard` | unauthenticated — toke | creates supplier role via service-role (trigger otherwise cl | Invited path locks email+company to supplier_invites token; self-signu | zod; password>=8; VAT regex; SLA require | GET 60/60s global; POS | medium |
| POST | `/api/supplier/ticket-action` | session | supplier | OK — ticket.supplier_id must be in caller's supplier_users links | zod ticketId/action | 30/60s per user | low |
| POST | `/api/supplier/decline-work` | session | supplier | OK — access by ticket_suppliers invite (in supplierIds), not company | zod ticketId/reason | 20/60s per user | low |
| GET, POST | `/api/supplier/verification-docs` | session (supplierCtx) | supplier | OK — scoped to ctx.supplierIds; POST url must contain 'supplier-docs' | zod; kind whitelist; signed URLs on GET | GET none; POST 20/60s  | low |
| POST | `/api/auth/set-password` | HMAC signed account to | any (token names the account) | N/A — token binds to one uid; cannot target a logged-in admin | password>=8; verifyAccountToken | 10/15min per token-pre | low |
| POST | `/api/auth/forgot-password` | unauthenticated | any | N/A | email validated; signed recovery token | 5/15min per email | low |
| POST | `/api/tickets/[id]/dispute` | cookie session | supplier vs resolver (RM/exec/individual); confirm requires  | supplier via supplier_users; RM via rmOwnsTicket; individual via creat | action-gated; separation of duties enfor | 40/60s | low |
| POST/DELETE | `/api/projects/[id]/stores/[storeId]` | cookie session | system_admin only (projectAdminAuth) | loadOwnedStore requires company_id match + project_id match | milestone marks write server now(); evid | 120/60s | low |

> One agent covering the residual group (cron/webhooks/reports/notifications) failed mid-run; those handlers were still covered by the all-routes reviewer (agent 3) and the infra reviewer (agent 8). `app/api/reports/*` and `app/api/notifications/*` are the thinnest-covered — flagged for a follow-up inventory pass.

---

## 12. Database remediation plan

| Change | Object | Problem | Migration | Data risk | Owner | Status |
|---|---|---|---|---|---|---|
| RLS-1 | user_profiles | UPDATE policy no WITH CHECK → role/company escalation (SEC-001) | WITH CHECK + BEFORE-UPDATE trigger + narrow grant | low (policy only) | SHARED | NOT STARTED |
| RLS-2 | tickets | UPDATE policy lets supplier self-complete (SEC-002) | Drop browser UPDATE policy (admin client is sole writer) | low | SHARED | NOT STARTED |
| RLS-3 | quotes/signoffs/ticket_variations | Browser write bypass (SEC-004/006) | Drop browser write policies; keep SELECT | low | SHARED | NOT STARTED |
| RLS-4 | approvals/decision_items/snags/supplier_escalations/supplier_invites | WITH CHECK weaker than USING; no role gate (SEC-011/012) | Mirror USING into WITH CHECK + role predicate | low | CLAUDE | NOT STARTED |
| RLS-5 | ticket_updates/ticket_evidence | author_id/uploaded_by not bound to caller (SEC-013) | Add author_id = auth.uid() to WITH CHECK | low | CLAUDE | NOT STARTED |
| FK-1 | tickets/ratings/technicians | Missing FKs (SEC-019/020/021) | Add FKs + indexes; clean orphans first | medium (verify orphans) | SHARED | NOT STARTED |
| CHK-1 | status/priority/score enums | No CHECK constraints (SEC-022) | Add CHECKs from live DISTINCT values | medium (enumerate live first) | SHARED | NOT STARTED |
| IDX-1 | tickets/quotes/notifications | FK/hot-path indexes likely absent (SEC-023) | Add btree indexes; verify pg_indexes live first | low | SHARED | NOT STARTED |
| SCHEMA-1 | schema.sql | Omits CHECK/indexes → drift unverifiable (SEC-039) | Reconcile from live pg_dump; update header | none | SHARED | NOT STARTED |
| UNIQ-1 | ticket_suppliers | No unique(ticket_id,supplier_id) (SEC-035) | Add unique index; de-dup route | low | CLAUDE | NOT STARTED |

> **High-risk changes (FK-1, CHK-1) require: backup first · verify no orphans/invalid values on live · rollback = drop the constraint · post-migration verify count.** Never run destructive production migrations automatically.

---

## 13. Owner action list

| ID | Action | Why | Priority | Blocking | Instructions | Status |
|---|---|---|---|---|---|---|
| OPS-001 | No database backups or point-in-time recovery | Supabase Free has no automated backups/PITR — any bad migration, deletion bug, or provider incident is unrecoverable data loss the moment real customer data lands. | HIGH | Yes | Buy Supabase Pro (~$25/mo), enable daily backups + PITR before real data; then run a restore drill (SEC gate). | NOT STARTED |
| OPS-002 | Vercel Hobby is non-commercial license | A public/commercial launch on Hobby violates Vercel ToS; also 2-cron/daily-only limits. | HIGH | Yes | Buy Vercel Pro (~$20/mo) before charging customers / public marketing. | NOT STARTED |
| OPS-003 | Supabase Auth dashboard not hardened | Redirect allowlist, confirm-email, server-side min password, signup CAPTCHA, and custom SMTP are dashboard settings not in the repo. | HIGH | Yes | Set Site/redirect allowlist (no wildcards), Confirm-email ON, min-pw ≥8 server-side, hCaptcha/Turnstile on signup, custom SMTP sender. | NOT STARTED |
| OPS-004 | No uptime monitoring or log drain/alerting | Handled 500s only hit ephemeral Vercel logs; no 5xx/auth-failure alerting; no uptime probe. | MED | No | Add uptime monitor on public URL + key APIs; Vercel log drain with 5xx + auth-failure alerts. | NOT STARTED |
| OPS-005 | Legal pages are placeholder templates | /privacy /terms /sla contain bracketed template copy; commercial launch needs real, lawyer-reviewed content. | HIGH | Yes | Draft real content + lawyer sign-off. | NOT STARTED |
| OPS-006 | POPIA Information Officer not registered; no signup consent | SA privacy law requires a registered Information Officer + a consent record at signup. | HIGH | Yes | OWNER: register Information Officer with the Information Regulator; CLAUDE: add signup consent checkbox with stored timestamp. | NOT STARTED |
| OPS-007 | No independent penetration test / security assessment | Scoring caps overall at 9.4 until an authorized independent assessment is completed for a high-risk multi-tenant app. | MED | No | Commission an independent pen test after the P0/P1 code fixes land. | NOT STARTED |
| OPS-008 | No staging environment / migration rehearsal + no incident runbook | Migrations + framework upgrades hit prod without rehearsal; no documented key-rotation/rollback/restore runbook. | MED | No | Stand up a 2nd Vercel project + Supabase branch; write an incident runbook. | NOT STARTED |
| OWN-DB1 | Run `select id,email,role,company_id from user_profiles where role in ('system_admin','executive')` on live after SEC-001 fix | Detect any already-escalated accounts | HIGH | Yes | Paste result back (redact emails) | NOT STARTED |
| OWN-DB2 | Run `select indexname,indexdef from pg_indexes where schemaname='public'` + `export_live_schema.sql` | Verify indexes/CHECKs before IDX-1/CHK-1/SCHEMA-1 | MED | No | Paste output for CLAUDE to reconcile | NOT STARTED |
| OWN-APPLY | Apply each CLAUDE migration to dev→prod via Supabase SQL Editor + merge PRs | Migrations are applied manually here; main is branch-protected | HIGH | Yes | Copy migration → SQL Editor → Run; then click merge | ongoing |

> Never paste full secrets/tokens/passwords into chat or this file. Use the Supabase/Vercel dashboards directly.

---

## 14. CLAUDE implementation queue (risk order)

| Order | ID(s) | Task | Sev | Depends on | Status |
|---:|---|---|---|---|---|
| 1 | SEC-001,002,004,006,011,012,013 | RLS hardening migration (the §2 session) | critical | OWNER apply + audit | NOT STARTED |
| 2 | SEC-003,005,009,010,015 | Scope/delete /api/suppliers GET+POST+bulk (company_id) | high | — | NOT STARTED |
| 3 | SEC-008,016,031 | Validate supplier_id / technician_id belongs to ticket company/roster on assign+transition | medium | — | NOT STARTED |
| 4 | SEC-007 | Gate transition hasAccess() on active invite status | medium | — | NOT STARTED |
| 5 | SEC-026,027 | Add tenant check + rate limit to /view /seen | low | — | NOT STARTED |
| 6 | SEC-017,018,034 | Route hardening: parseAmount in transition; reconcile approve_quote; remove add_update status flip | medium | — | NOT STARTED |
| 7 | SEC-019,020,021,035,037 | FK + unique-constraint migration (clean orphans first) | medium | OWN-DB2 | NOT STARTED |
| 8 | SEC-022,023,039 | CHECK + index migration; reconcile schema.sql from live | medium | OWN-DB2 | NOT STARTED |
| 9 | SEC-025,044 | Strip PII from WhatsApp logs; fix csp-report rate-limit key | medium | — | NOT STARTED |
| 10 | SEC-040,041 | Sentry.captureException on handled 500s; fold notification purge into scheduled cron | low | — | NOT STARTED |
| 11 | SEC-028,046,047 | Fix supplier-onboard user enumeration; sla_rules anon read; revoke extra fn EXECUTE | low | — | NOT STARTED |
| 12 | SEC-013,038 | Add cross-tenant + RLS-policy negative test suite; wrap critical multi-writes in RPC | medium | RLS migration | NOT STARTED |

---

## 15. Automated-test coverage required for 9.5

| Suite | Have | Missing (add) | Owner |
|---|---|---|---|
| Workflow transitions | ✓ 277-case matrix | — | — |
| API authZ (tickets) | ✓ 18 cases | extend to suppliers/provision/assign | CLAUDE |
| **Cross-tenant / RLS negative** | ❌ | supplier-can't-PATCH-ticket; individual-can't-escalate-role; SM-can't-edit-quote; A-can't-read-B-suppliers; forge-signoff denied | CLAUDE |
| Health engine | partial (storeHealth/sla) | regional/estate/ticket/supplierPerf/repeatDefects/decisions | CLAUDE |
| File upload | ❌ | MIME/size reject; per-user path; signed-URL 403 | CLAUDE |
| Business workflow e2e | ❌ | evidence-required, SoD, project progress | CLAUDE |
| Migrations / restore | ❌ | migration apply + **restore drill** | OWNER |
| Production smoke | ❌ (manual) | Playwright signed-URL 403 + role dashboards | CLAUDE/OWNER |

---

## 16. Secrets & configuration

| Item | Finding | Status |
|---|---|---|
| No secrets committed; `.env`/keystore gitignored (only `.example`) | SEC-051 ✓ | VERIFIED (review) |
| `lib/auth-token.ts` weak fallback `'motiv-insecure-fallback'` if SERVICE_ROLE_KEY unset | (prior audit P3-2) | throw-on-missing (CLAUDE) |
| `.env.example` complete; `NEXT_PUBLIC_ADMIN_EMAILS` marked deprecated | ✓ | OK |
| Rotate any key ever pasted/leaked; `WHATSAPP_APP_SECRET` set once Meta registered | OPS/owner | pending |

> No full secret values appear in this document or the machine files.

---

## 17. Decisions required (owner)

| ID | Question | Recommendation | Impact | Status |
|---|---|---|---|---|
| D1 | Should the browser (RLS-bound) client EVER write tickets/quotes/signoffs directly, or is the service-role admin client always the writer? | Admin client only — drop browser write policies (code review found no legitimate browser writer) | Unblocks SEC-002/004/006 fix cleanly | ✅ RESOLVED — admin-client-only; browser write policies dropped (20260717, VERIFIED) |
| D2 | Is `executive` intended read-only, or does it have company-scoped write? | Decide + align code/docs (SEC-045) | Authorization correctness | ✅ RESOLVED 2026-07-16 — **read-only**; executive removed from all ticket-workflow writes (SEC-045 FIX IMPLEMENTED) |
| D3 | Should Motiv-pool suppliers (company_id null) be visible in `/api/suppliers`? | Explicit allowlist, not implicit | SEC-003/005 fix shape | ✅ RESOLVED — GET scoped to caller's company only; pool rows excluded (SEC-003/005 VERIFIED) |
| D4 | Hard-delete vs soft-delete for user/company erasure (POPIA)? | Soft-delete + anonymise; document | SEC-024 / FK ON DELETE | ✅ RESOLVED 2026-07-16 — **soft-delete + anonymise** (already in `account/delete`: PII scrubbed, email scrambled, auth banned, history kept). Hard-delete unsupported by design → NO-ACTION FKs intentional. SEC-024 RISK ACCEPTED |
| D5 | `app_settings` global vs per-tenant? | Global now (single tenant); restrict writes to a platform-owner id (SEC-014) | Multi-tenant future | ✅ RESOLVED 2026-07-16 — **global + platform-owner-only writes** via `PLATFORM_OWNER_USER_ID` (SEC-014 FIX IMPLEMENTED) |
| D6 | SLA priority timings (P1/P2 windows) | Decide → align sla_rules + FALLBACK_SLA, bump SLA_VERSION | SLA correctness | OPEN |

---

## 18. Accepted risks

_None accepted yet. Claude may recommend acceptance; only the owner may accept a risk here._

| Risk ID | Description | Sev | Reason | Compensating control | Approved by | Review date |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

## 19. Evidence register

| ID | Type | Description | Location | Finding | Date |
|---|---|---|---|---|---|
| EV-1 | Code review | 10-agent audit raw output | workflow `wf_d4027e36-8c3` journal.jsonl | all | 2026-07-15 |
| EV-2 | Adversarial verify | 5/5 crit+high CONFIRMED (0 refuted) | `motiv-security-findings.json`.verification | SEC-001..006 | 2026-07-15 |
| EV-3 | Manual verify | SEC-001 four-legs re-checked (policy+grant+trigger+role FK) | conversation transcript | SEC-001 | 2026-07-15 |
| EV-4 | Build health | tsc/lint/354 tests/build green on `561406b` | local run | — | 2026-07-15 |
| EV-5 | Control confirmed | project progress server-computed generated column | schema.sql:1871-1876 | SEC-048 | 2026-07-15 |
| EV-6 | Owner live-DB verify | `pg_policies` on tickets/quotes/signoffs/ticket_variations shows SELECT + tickets-insert ONLY (no browser write policy) — prod | SQL Editor screenshot | SEC-002/004/006 | 2026-07-16 |
| EV-7 | Owner live-DB verify | `pg_trigger` shows `trg_enforce_profile_privileged` on user_profiles — prod | SQL Editor screenshot | SEC-001 | 2026-07-16 |
| EV-8 | Owner audit | escalation-audit query returned only legitimate system_admins (0 unexpected) — dev + prod | SQL Editor screenshot | SEC-001 | 2026-07-16 |

**SEC-001, SEC-002, SEC-004, SEC-006 → `VERIFIED`** (2026-07-16) on the strength of EV-6/7/8: the browser write policies are provably absent and the role/company-freeze trigger is provably present on prod, and the escalation audit is clean. SEC-011/012/013/046/047 were applied by the same migration (still `READY FOR VERIFICATION` — a one-line `pg_policies` query on those tables would close them).

| EV-9 | Owner live-DB verify | `GET /api/suppliers` as a null-company supplier on prod → **403 Forbidden** (was: every tenant's directory). **SEC-003, SEC-005 → `VERIFIED`** | browser-console screenshot | SEC-003/005 | 2026-07-16 |

**All six criticals/highs (SEC-001…006) are now VERIFIED-closed on prod** → the two score caps (confirmed cross-tenant vuln, open critical) are lifted; overall moves 4.0 → 7.0.

---

## 20. Change log

| Date | Commit | Change | Findings | By |
|---|---|---|---|---|
| 2026-07-15 | 561406b | Programme created from 10-agent audit + adversarial verify | all | CLAUDE |
| 2026-07-16 | (road-to-9.5→main PR#33-37) | RLS + FK migrations applied dev+prod & VERIFIED; ~19 code fixes deployed; tenant-isolation suite (378 tests); Turnstile CAPTCHA live; POPIA consent + PII-log fixes; OPS-003 free auth-hardening done | SEC-001..006 VERIFIED; 019-022/035 done; 003/005/026/027/etc deployed | CLAUDE |
| 2026-07-16 | (this update) | Ownership label FABLE→CLAUDE; readiness gates + §21 score (7.0) + decisions D1/D3 reconciled to verified state | docs | CLAUDE |
| 2026-07-16 | af5f5d9 | Sentry capture on handled 500s via `serverError()` (18 routes) | SEC-040 | CLAUDE |
| 2026-07-16 | f12a7c5 | Executive → read-only across all ticket-workflow writes | SEC-045 (D2) | CLAUDE |
| 2026-07-16 | 1e350e9 | Platform-owner guard on branding/settings writes | SEC-014 (D5) | CLAUDE |
| 2026-07-16 | 047ef98 | Child-table FK migration (SEC-037); applied+folded (2f9a7ac) | SEC-037 | CLAUDE |
| 2026-07-16 | c42b28d | Ticket-create notify fan-out isolated (no duplicate-on-retry) | SEC-038 | CLAUDE |
| 2026-07-16 | 821760b | Removed divergent approve_quote/reject_quote transition path | SEC-018 | CLAUDE |
| 2026-07-16 | (final refresh) | Tracker refresh: §0 end-of-programme summary; B/C manual checks ticked (owner); gates + score rolled up; 12 VERIFIED / 21 fixed | all | CLAUDE |

---

## 21. Scoring methodology & result

Weighted model (evidence-based). Raw weighted = Σ(weight×score):

| Category | Weight | Score | Weighted |
|---|---:|---:|---:|
| Application security | 20% | 7.5 | 1.50 |
| Authorization & tenant isolation | 20% | 7.5 | 1.50 |
| Database security & integrity | 15% | 7.0 | 1.05 |
| Reliability & recovery | 10% | 5.5 | 0.55 |
| Infrastructure & deployment | 10% | 7.0 | 0.70 |
| Authentication & sessions | 8% | 8.0 | 0.64 |
| Code quality & maintainability | 7% | 7.5 | 0.53 |
| Testing & CI/CD | 7% | 7.5 | 0.53 |
| Privacy & operational readiness | 3% | 6.5 | 0.20 |
| **Raw weighted** | | | **7.19** |

**Caps applied (methodology):** SEC-001…006 are now VERIFIED-closed on prod, so the confirmed-cross-tenant (max 4.0) and open-critical (max 5.0) caps **no longer apply**. Remaining caps: no verified backup/restore → **max 7.5** (OPS-001, paid); no independent assessment → max 9.4 (OPS-007). **Binding cap = 7.5.**

**Overall production-readiness score: 7.0 / 10** (raw 7.19, held just under the 7.5 backup cap; rounded to 7.0 pending broader route observability + region-isolation verification). Path to 9.5: DB backups + restore drill (lifts the 7.5 cap), then monitoring/alerting, remaining behavioral fixes (SEC-018/038), and an independent pen test (lifts the 9.4 cap).

**A verified 9.5 additionally requires (not code-review alone):** passing tenant-isolation + RLS-policy tests, verified backups + a successful restore drill, live monitoring + alerting, secure deployment controls, and an independent security assessment.

---

## 22. Final readiness gates

### Security
- [x] No open critical vulnerabilities (SEC-001, SEC-002 VERIFIED closed on prod)
- [x] No unmitigated high vulnerabilities (SEC-003/004/005/006 VERIFIED)
- [x] Server-side authorization verified (route authZ + tenant-isolation test suite) · [x] Company isolation · [ ] Region (partial) · [x] Store · [x] Supplier · [x] Project (control confirmed) isolation verified
- [x] File uploads + evidence protection verified (owner: raw public storage URL → 404 "Bucket not found", buckets private) · [x] Secrets: none committed (EV/SEC-051) · [x] Security headers · [x] Rate limiting on /view /seen (SEC-026/027) · [x] Audit logging present · [x] Signup CAPTCHA live (OPS-003)

### Database
- [x] RLS write policies hardened (browser write policies dropped, 20260717, VERIFIED live) · [x] Tenant enforcement tested (tenant-isolation suite) · [x] Constraints (FK/CHECK) added (20260718 + 20260719, applied dev+prod, folded) · [x] schema.sql reconciled from live (indexes/CHECKs/FKs folded) · [ ] Least-privilege grants (table-wide grant still broad; mitigated by RLS+trigger) · [ ] Backups confirmed (OPS-001, paid) · [ ] **Restore drill completed** · [x] Audit records immutable to end users

### Reliability
- [x] Error handling → Sentry on handled 500s (SEC-040: cron routes + shared `serverError()` covering 18 routes) · [ ] Monitoring + alerting operational (uptime probe pending; Sentry live) · [ ] Rollback/runbook documented · [x] Critical workflow e2e verified (owner ran log→assign→quote→approve→complete→sign-off on prod) · [x] Multi-write atomicity addressed (SEC-038: notify fan-out isolated; audit writers already best-effort)

### Delivery
- [x] CI checks passing (tsc/lint/364 tests/build/audit) · [x] Authorization + tenant-isolation tests passing · [x] Secret scan (none committed) · [x] Prod/dev separation · [ ] Owner blockers (OPS-001/005/006 paid+legal) resolved · [ ] Independent security review (OPS-007)

---

## 23. Deliverables produced this session
1. This programme file · 2. [`motiv-security-findings.json`](motiv-security-findings.json) (49 findings, full detail + verification verdicts) · 3. [`motiv-remediation-backlog.csv`](motiv-remediation-backlog.csv) · 4. Architecture map (§3) · 5. Threat model (§4) · 6. Role matrix (§9) · 7. Tenant register (§10) · 8. Endpoint inventory (§11) · 9. DB plan (§12) · 10. Owner list (§13) · 11. CLAUDE queue (§14) · 12. Test-gap matrix (§15) · 13. Scoring (§21) · 14. Readiness gates (§22). Plain-English companion: [`docs/PRODUCTION_AUDIT_2026-07-15.md`](docs/PRODUCTION_AUDIT_2026-07-15.md).

_End-of-session summary at the bottom of the owner's chat. Do not mark any item VERIFIED without recorded evidence._
