# Motiv — Full Production-Readiness Audit

**Date:** 2026-07-15
**Branch audited:** `project-tracking`
**Method:** 4 parallel deep audits (security, database, code-structure/dead-code, ops/gaps), each reading the real code — plus manual verification of the most severe finding.
**Overall score: 6.5 / 10** → target **9.5 / 10**

> ### How to read this document
> Every finding has **three fields**, exactly as requested:
> - **🟢 In plain words** — what the problem is, no jargon. Read this if you just want to know what's wrong.
> - **🔧 Technical** — the precise, for-the-engineer version (file, line, mechanism).
> - **✅ How to fix** — the concrete steps to close it.
>
> Findings are **ordered by importance** (do #1 first). Each carries a severity and a 1–10 score (10 = perfect, no problem; 1 = on fire).
>
> **Reconciliation note:** the repo already has a self-tracker at [`docs/PATH_TO_9.5.md`](PATH_TO_9.5.md) (self-scored 7.4). This audit is independent and *found things that tracker missed* — most importantly one **critical account-takeover hole** and one **cross-tenant data leak** that are not in it. Where this audit and that doc agree, it's noted. The lower overall score (6.5 vs 7.4) is because a confirmed critical privilege-escalation bug caps readiness regardless of how good everything else is.

---

## Who does what — the split (read this first)

Every task below is tagged with who has to do it:

- **👤 YOU** — only you can do it (buying a plan, legal copy, registering with a regulator, a dashboard setting, moving a file on your machine). I physically can't.
- **🤖 CLAUDE (me)** — I write all the code/SQL myself; you don't touch code.
- **👥 BOTH** — I write it, but **you have to press the button**: for anything touching the database you paste my migration into the Supabase SQL Editor (that's how this project applies migrations), and for anything merging to `main` you approve the pull request (the branch is protected). So "Both" = *I do the work, you apply/approve*.

> **The one recurring "you" action:** every database change in this audit becomes a migration I write, and **you paste it into the Supabase SQL Editor** to apply it (then I fold it into `schema.sql` and delete the file). It's copy-paste-run — no code knowledge needed. Same for merges: I open the PR, you click merge.

### 👤 YOUR list (can't be delegated)

| ID | What you do | Type |
|---|---|---|
| P0-2 | Buy **Supabase Pro** (~$25/mo), turn on PITR/daily backups, later run one restore drill | Purchase |
| P4-3 | Buy **Vercel Pro** (~$20/mo) — legally required for a commercial launch | Purchase |
| P4-1 | Get real **legal copy** for `/privacy` `/terms` `/sla` + a lawyer sign-off | Legal |
| P4-2 | Register a **POPIA Information Officer** with the Information Regulator (I do the signup consent checkbox) | Legal/registration |
| P4-5 | **Supabase Auth dashboard** settings: redirect allowlist, confirm-email ON, min-password server-side, CAPTCHA on signup, custom SMTP | Dashboard |
| P4-4 | Set up **uptime monitoring** + a **Vercel log drain** with 5xx/auth-failure alerts | External service |
| P4-8 | Commission an independent **penetration test** (after P0/P1 land) | Purchase/vendor |
| P4-9 | Set **`WHATSAPP_APP_SECRET`** in Vercel once the business is registered with Meta | Env var |
| P2-2 | **Verify** `UPSTASH_REDIS_*` is actually set in prod Vercel (don't assume) | Env check |
| P2-19 | Move `motiv-release.keystore` **out of the repo folder** onto secure storage | File move |

*Plus, for every 👥 item: paste the migration I write into the Supabase SQL Editor, and/or approve the PR.*

### 🤖 CLAUDE's list (I do it end-to-end; you just apply/merge)

| ID | What I do | You then… |
|---|---|---|
| **P0-1** | Write the RLS-fix migration (WITH CHECK + revoke column grants) + fold into `schema.sql` | Paste migration into SQL Editor |
| P1-1 | Scope the `/api/suppliers` query to `company_id` (or delete the route) | Merge PR |
| P1-2 | Fold `app_settings` + apply chat migration, regen types, get `tsc` green | Paste both migrations, merge PR |
| P1-3 | Bound the `lib/health/data.ts` ticket queries + overflow alert | Merge PR |
| P1-4 | One doc-sync pass on `CLAUDE.md` / `AGENTS.md` / `DASHBOARDS_V2.md` | Merge PR |
| P1-5 | Separate the chat WIP, open `project-tracking` → `main` PR | Approve merge + paste projects migration to prod |
| P2-1,3,4,5 | Supplier `company_id`, notif `WITH CHECK`, transition supplier validation, strip PII from logs | Paste SQL (P2-3), merge PRs |
| P2-6,7 | Add missing FKs + CHECK constraints (migrations) | Paste migrations |
| P2-8,9 | Write index migration + regenerate a complete `schema.sql` | Run the `pg_indexes` check + `export_live_schema.sql`, paste migration |
| P2-10 | Delete the two already-applied migration files | Confirm they're applied to live first |
| P2-11,12,13,14 | Add fetch timeouts, Sentry on handled 500s, schedule the purge, chunk the cron | Merge PRs |
| P2-15,16,17,18,20 | Split the god-component, delete ~1,300 lines of dead code, fix `UserRole` type, dedupe helpers, optimize/delete logo dirs | Merge PRs (+ you pick the winning logo for P2-20) |
| P3-1…P3-11 | All the low-risk polish (role checks, token fallback, rate limits, offline page, engine tests, etc.) | Merge PRs |
| P4-2 (code half) | Signup consent checkbox with stored timestamp | Merge PR |

**Fastest path if you want:** say the word and I'll knock out P0-1, P1-1, P1-3, P1-4 and the P2 code items as PRs right now — you'd only need to paste a couple of migrations and click merge.

---

## Section scores at a glance

| Area | Score | One-line reason |
|---|---:|---|
| Database & row-level security | **5.5 / 10** | One confirmed account-takeover hole; two deploy-blocking schema/code mismatches; missing FKs, CHECKs, indexes. |
| API security & authorisation | **6.5 / 10** | Strong overall pattern, but one cross-tenant supplier leak + the escalation above is reachable via the public API. |
| Infrastructure & operations | **6.0 / 10** | **No database backups at all**; no uptime/log alerting; but CI/Sentry/rate-limiting are genuinely excellent. |
| Documentation integrity | **5.0 / 10** | Instruction files (`CLAUDE.md`) materially contradict the code — high risk in an AI-agent-driven repo. |
| Legal / POPIA | **4.0 / 10** | `/privacy` `/terms` `/sla` are placeholder templates; no Information Officer registered; no signup consent. |
| Code structure & dead code | **7.5 / 10** | Big structural problems already solved; ~1,300 lines of orphan code + one 1,700-line god-component remain. |
| Testing | **7.0 / 10** | 354 tests + blocking CI already exist (the tracker's "no test suite" line is wrong); health engine only half-covered. |
| Error handling & observability | **7.5 / 10** | Sentry live end-to-end with auto route-error capture; handled 500s still only hit ephemeral Vercel logs. |

**Why 6.5 overall:** engineering fundamentals here are strong — blocking CI (typecheck + lint + 354 tests + schema/type gates + `npm audit`), live Sentry, distributed rate limiting, strict nonce CSP, private signed-URL storage. But **a single confirmed critical bug (P0-1 below) lets any logged-in user make themselves platform admin**, and there is **no backup story** for the database. Those two gate the score. Close the P0/P1 list and this jumps to ~8.

---

# PRIORITY 0 — Fix before anyone else uses the app (critical)

## P0-1 · Any logged-in user can make themselves system_admin (account takeover)
**Severity: CRITICAL · Score: 1 / 10 · VERIFIED (I proved all four conditions hold)**

- **🟢 In plain words:** Right now, *anyone* who can log in — even a member of the public who self-signed-up — can send one direct message to the database and promote themselves to **platform master-admin**, taking over every company's data. The app's own screens don't let them do this, but they can skip the app entirely and talk to the database directly using a key that is *public and sitting in every browser*. This is the single most dangerous thing in the codebase and it is real, not theoretical.
- **🔧 Technical:** The RLS policy `own profile update` (`supabase/schema.sql:1741`) is `for update using (id = auth.uid())` with **no `WITH CHECK` and no column-level restriction**. Postgres defaults `WITH CHECK` to the `USING` expression, so the only constraint on the *new* row is `id = auth.uid()` — the `role` and `company_id` columns are freely writable on your own row. The `authenticated` role holds a table-wide `UPDATE` grant (`supabase/migrations/_archive/20260618_grant_table_privileges.sql:24`), there is **no `BEFORE UPDATE` trigger** on `user_profiles` guarding `role` (only `on_auth_user_created`, an AFTER INSERT on `auth.users`), and `role`'s FK to `roles.key` doesn't help because `system_admin` is a valid key. So `PATCH https://<project>.supabase.co/rest/v1/user_profiles?id=eq.<own-uid>` with body `{"role":"system_admin"}`, sent with the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` + the user's own JWT, succeeds — bypassing the app's `/api/profile` guard (which *does* refuse a `role` field, but only protects the app route, not PostgREST). The `handle_new_user` signup clamp only runs at signup; it does nothing post-signup.
- **✅ How to fix:** Two layers, do both. **(1) Tighten the RLS policy** — replace the policy so the user cannot change privileged columns:
  ```sql
  drop policy if exists "own profile update" on public.user_profiles;
  create policy "own profile update" on public.user_profiles for update
    using (id = auth.uid())
    with check (
      id = auth.uid()
      and role = (select role from public.user_profiles where id = auth.uid())
      and company_id is not distinct from (select company_id from public.user_profiles where id = auth.uid())
    );
  ```
  **(2) Revoke column privileges as defence-in-depth** — `revoke update (role, company_id) on public.user_profiles from authenticated;`. The app already writes profile role/company via the service-role client (`app/api/profile/route.ts` uses the admin client), so both changes are safe and won't break the app. Apply to live, fold into `schema.sql`, then re-test that a normal user *cannot* PATCH their role.

## P0-2 · The database has no backups — any data loss is permanent
**Severity: CRITICAL (before real customer data) · Score: 2 / 10**

- **🟢 In plain words:** There is currently **no safety net** for the database. If a bad update wipes or corrupts data, if someone fat-fingers a migration, or if the hosting provider has an incident, the data is gone forever — there is no copy to restore from. Today that's only test data, so it's survivable, but the moment a real customer's tickets and photos are in there, this becomes a business-ending risk.
- **🔧 Technical:** Supabase Free has no automated daily backups and no point-in-time-recovery (PITR). Documented candidly in the repo itself (`docs/INFRASTRUCTURE_TIERS.md:40,63–64` — *"currently we have NO backup story"*) and open as A5/C2 in `PATH_TO_9.5.md`. Free tier also auto-pauses the project after ~7 days idle.
- **✅ How to fix:** Buy **Supabase Pro (~$25/mo)** before real data lands — it enables daily backups + PITR and removes auto-pause. Interim (while still free): schedule a manual `pg_dump` export weekly to offline storage. After PITR is on, do a **restore drill** once (a backup you've never restored is only a hope) — this is item C2 in the existing tracker.

---

# PRIORITY 1 — Fix before public / commercial launch (high)

## P1-1 · One API endpoint leaks every company's suppliers to any supplier user
**Severity: HIGH · Score: 3 / 10**

- **🟢 In plain words:** There's a leftover back-door list endpoint. Any supplier-type user who calls it gets the full supplier contact book of **every company on the platform** — names, emails, phone numbers, VAT numbers, private notes — not just their own. No app screen uses this endpoint, but it's still switched on and anyone with a supplier login can call it.
- **🔧 Technical:** `app/api/suppliers/route.ts:31–43`. `requireAdmin()` (lines 22–29) checks `role === 'supplier'` but **not** `company_id`, and the handler runs `adminClient.from('suppliers').select('*')` with **no `company_id` filter**. The service-role client bypasses RLS, so this route-level omission is the entire guard. The sibling `[id]` route *does* scope by `company_id`, confirming suppliers are meant to be tenant-scoped.
- **✅ How to fix:** Add `.eq('company_id', profile.company_id)` to the query and require a non-null `company_id` in `requireAdmin()` (mirror `app/api/suppliers/[id]/route.ts:25–32`). Given nothing calls it, deleting the route entirely is also acceptable and safer.

## P1-2 · Two features are coded but their database tables aren't deployed (deploy blockers)
**Severity: HIGH · Score: 3 / 10**

- **🟢 In plain words:** Two parts of the app (the branding/customization settings, and the new ticket chat) have code that expects database tables which **don't exist in the live database yet**. If this code deploys as-is, those features throw errors — branding reads fail on page load, the chat endpoint 500s. The tables live in migration files that haven't been "pasted into" the database.
- **🔧 Technical:** (a) `app_settings` is referenced by 6 files (`lib/settings-server.ts`, `app/layout.tsx`, `components/providers/BrandingProvider.tsx`, `app/api/admin/customization/route.ts`, …) but is **absent from `schema.sql`** — it only exists in pending `supabase/migrations/20260715_app_settings_branding.sql`. (b) `ticket_chat_messages`/`ticket_chat_reads` are used by the **untracked** `app/api/tickets/[id]/chat/route.ts` + `lib/chat-unread.ts`, table only in **untracked** `20260716_ticket_chat.sql`. This is also why `npx tsc --noEmit` currently reports 18 errors — all in the untracked chat route, because the types generated from `schema.sql` don't know those tables. (Committed code type-checks clean.)
- **✅ How to fix:** Apply `20260715_app_settings_branding.sql` to the live DB before/with the next deploy. Commit and apply `20260716_ticket_chat.sql` **together** with the chat code as one unit. In both cases: apply → fold into `schema.sql` → `npm run gen:types` → confirm `tsc` is clean → commit. (The chat migration itself is well-formed — RLS deny-all + service-role route with proper authZ — it just isn't applied.)

## P1-3 · Health scores go silently wrong once a company passes 1,000 tickets
**Severity: HIGH (correctness time-bomb) · Score: 4 / 10**

- **🟢 In plain words:** The dashboards that score each store/region/estate load *all* of a company's tickets to do their maths — but the database quietly returns **only the first 1,000**. Below 1,000 tickets everything's fine. The day a busy company crosses 1,000, the scores, SLA-breach counts, and trend snapshots start being calculated on a **partial slice of the data, with no error and no warning** — they'll just be wrong, and nobody will know.
- **🔧 Technical:** `lib/health/data.ts` loads company tickets with no `.limit()`/pagination — lines 119 (`assembleEstateDashboard`), 398 (regional), 602 (store manager), 691 (supplier): `db.from('tickets').select(TICKET_COLS).eq('company_id', companyId)`. Supabase/PostgREST caps responses at 1,000 rows by default, so the engine silently computes on a subset above that threshold.
- **✅ How to fix:** Either paginate with a `.range()` loop until exhausted, or (better) filter server-side to the engine's actual working set — all non-terminal tickets plus terminal ones within the trailing scoring window — and add an explicit `.limit()` with an overflow alert to Sentry so silent truncation becomes a loud signal.

## P1-4 · Instruction docs contradict the code (dangerous in an AI-driven repo)
**Severity: HIGH (for how this repo is built) · Score: 5 / 10**

- **🟢 In plain words:** The `CLAUDE.md` files that steer every AI coding session describe the app *as it used to be*, not as it is. They point future work at a duplicate "dashboards" engine that **was already deleted**, claim there are **no tests** (there are 354), and name files that have been renamed. Because those files are the map every automated session follows, a wrong map sends work into dead ends or reintroduces old bugs.
- **🔧 Technical:** `lib/dashboards/`, `app/api/dashboards/`, and most of `components/dashboards/` were deleted in commit `19fd52a` — but `CLAUDE.md:84`, `.claude/CLAUDE.md:84`, `AGENTS.md:83`, and `docs/DASHBOARDS_V2.md:9,55` still describe "two parallel copies of the scoring engine." `@/lib/dashboards` now has **zero** importers. Also stale: "There is no test suite" (7 vitest files exist, `npm test` runs 354), `public/manifest.json` (now `app/manifest.webmanifest`), "only /settings uses Navbar" (nothing uses `Navbar` — `components/settings/SettingsChrome.tsx` replaced it), and `README.md:41` still documents deprecated `NEXT_PUBLIC_ADMIN_EMAILS`. Root `CLAUDE.md` and `.claude/CLAUDE.md` have also **diverged** (root has a "Brand/CI reference" bullet the other lacks); `AGENTS.md` is a third near-copy missing standing instruction #5.
- **✅ How to fix:** One documentation-sync pass: delete the "two parallel copies" warning from all instruction files and repoint `DASHBOARDS_V2.md` at `lib/health/`; fix the test-suite/manifest/Navbar/ADMIN_EMAILS lines; make `.claude/CLAUDE.md` and `AGENTS.md` either a pointer to the one canonical `CLAUDE.md` or keep them byte-identical.

## P1-5 · A 32-commit unmerged branch with broken WIP in the working tree
**Severity: HIGH · Score: 5 / 10**

- **🟢 In plain words:** The branch you're working on is **32 commits ahead** of the branch that actually deploys, holding ~9,000 lines of changes (projects feature, mobile work, customization, rebrand). On top of that, three half-finished features are stacked in the same working folder at once, and one of them (chat) currently **doesn't compile**. The longer this sits, the harder and riskier the eventual merge, and prod is still missing the projects-feature database migration.
- **🔧 Technical:** `project-tracking` is 32 commits / 196 files / +9,167 −1,595 ahead of protected `main`. Uncommitted on top: modified `app/api/tickets/[id]/quotes/route.ts`, `components/regional/RmTicketActions.tsx`, `RegionalPriorityWorkQueue.tsx`; untracked WIP ticket-chat (`app/api/tickets/[id]/chat/`, `components/chat/`, `20260716_ticket_chat.sql`) which fails `tsc`; two untracked logo asset folders in `public/`. Per memory, the projects migration is applied to DEV only — prod-apply pending.
- **✅ How to fix:** Stash/commit the chat WIP separately (with its migration, per P1-2) so the tree compiles; open a PR from `project-tracking` → `main` soon (CI will gate it green); apply the projects migration to prod as part of that deploy. Don't let the divergence keep growing.

---

# PRIORITY 2 — Hardening (medium — weeks after launch)

> Each of these is real but lower-blast-radius. Grouped by type. Format is the same three fields, kept tighter.

### Security & multi-tenancy

**P2-1 · New suppliers are created with no company owner** — *Severity: MEDIUM · Score: 5/10*
- **🟢** When a supplier user adds a supplier, the new record isn't tagged with which company it belongs to — so it becomes an "orphan" that no tenant check can see or protect, and any leak like P1-1 would expose it.
- **🔧** `app/api/suppliers/route.ts:64–82` and `app/api/suppliers/bulk/route.ts:32–52` insert without setting `company_id`.
- **✅** Set `company_id: profile.company_id` on every inserted row; require the caller to have a company.

**P2-2 · Rate limiting weakens to near-useless if the Redis env vars aren't set in prod** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The system that stops password-guessing and abuse only works properly when a shared counter (Upstash Redis) is configured. If it isn't, each server copy counts separately, so the real limit is multiplied by the number of servers — attackers get many more tries.
- **🔧** `lib/rate-limit.ts:97–114` falls back to per-instance in-memory counters when `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset. Already mitigated by a Sentry fallback alert (B9).
- **✅** Confirm `UPSTASH_REDIS_*` is actually set in the production Vercel env before launch (it's listed as set per A6 — verify it, don't assume).

**P2-3 · Notifications can be re-assigned to another user** — *Severity: MEDIUM · Score: 6/10*
- **🟢** A user editing their own notification could point it at *someone else*.
- **🔧** `notif update` policy (`schema.sql:1501–1503`) is `using (user_id = auth.uid())` with no `WITH CHECK` — same class of bug as P0-1 but far lower impact.
- **✅** Add `with check (user_id = auth.uid())`.

**P2-4 · Ticket assignment doesn't verify the supplier belongs to the tenant** — *Severity: LOW–MEDIUM · Score: 6/10*
- **🟢** When a regional manager assigns a ticket to a supplier, the app trusts the supplier ID it's given without checking that supplier is really one of this company's.
- **🔧** `app/api/tickets/[id]/transition/route.ts:130,145,153,261–262` set `updates.supplier_id = body.supplierId` unvalidated (FK blocks non-suppliers, but a cross-tenant supplier id would bind).
- **✅** Validate `body.supplierId` exists in `suppliers` for `ticket.company_id` (or is a Motiv-pool supplier) before assigning.

**P2-5 · Personal data written to server logs** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The WhatsApp intake writes a sender's phone number and the full ticket contents into the server logs — personal information sitting in logs is a privacy (POPIA) problem.
- **🔧** `app/api/webhooks/whatsapp/route.ts:626` logs the full extracted ticket object; `:644` logs the sender's phone number (8 `console.log`s total, lines 432/519/523/611/626/644/871/986).
- **✅** Log IDs and lengths, not content or phone numbers.

### Database integrity

**P2-6 · Missing foreign keys let ticket data point at deleted/nonexistent records** — *Severity: MEDIUM · Score: 6/10*
- **🟢** Some ticket links (technician, asset, assigned user) and the ratings/technicians tables have no enforced relationship, so they can end up pointing at things that don't exist.
- **🔧** `tickets.technician_id`/`asset_id`/`assigned_user_id` have no FK (`schema.sql:1045–1052`); `ratings.*` and `technicians.supplier_id`/`company_id` likewise.
- **✅** Add the FKs (e.g. `tickets.technician_id → technicians(id) on delete set null`, `ratings.supplier_id → suppliers(id)`, `technicians.supplier_id → suppliers(id) on delete cascade`).

**P2-7 · No CHECK constraints on status/priority columns** — *Severity: MEDIUM · Score: 6/10*
- **🟢** Columns like ticket status and priority are free text with nothing stopping a typo'd value from being saved, which would silently break the ticket state machine.
- **🔧** No CHECK constraints in the canonical schema for `tickets.status`, `quotes.status`, `signoffs.status`, `snags.status`, `whatsapp_sessions.status`, etc. (Some may exist live via an archived migration — see P2-9.)
- **✅** Export the live CHECK set into `schema.sql`, then add CHECKs on every enum-like status/priority column that lacks one.

**P2-8 · Foreign-key columns likely un-indexed (query slowness at scale)** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The columns the app filters on constantly (tickets by company/store/status, quotes by ticket, notifications by user) probably don't have database indexes, so queries get slow as data grows. This needs checking against the *live* database, not the schema file.
- **🔧** Only ~8 secondary indexes are declared (`schema.sql:1341–1356`); Postgres doesn't auto-index FK columns. Hot paths likely missing: `tickets(company_id/store_id/region_id/supplier_id/status)`, `quotes(ticket_id)`, `notifications(user_id, read)`, `snags(ticket_id)`, `signoffs(ticket_id)`.
- **✅** Check `pg_indexes` on live; add btree indexes on the FK/filter columns. (Can't confirm from the file — see P2-9.)

**P2-9 · The "source of truth" schema is incomplete** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The file that's supposed to be the exact picture of the live database openly admits it leaves out two whole categories (indexes and CHECK constraints). That means nobody can tell from the file whether those things are right, and drift can't be detected.
- **🔧** `schema.sql:9–12` header states indexes + CHECKs are not captured, yet CLAUDE.md calls it "the only source of truth."
- **✅** Run `supabase/diagnostics/export_live_schema.sql` with index + constraint capture and regenerate so the mirror is complete; this also unblocks verifying P2-7 and P2-8.

**P2-10 · Two already-applied migrations weren't deleted** — *Severity: LOW–MEDIUM · Score: 7/10*
- **🟢** The project's rule is: once a migration is applied to the database, fold it into the schema file and delete it. Two migration files whose contents are *already* in the schema are still sitting in the pending folder, making it unclear what's actually pending.
- **🔧** `20260714_stores_unique_branch.sql` and `20260714_projects_feature.sql` are both fully mirrored in `schema.sql` already.
- **✅** Confirm they're applied to live, then delete both; the pending folder should then hold only `20260715` and `20260716`.

### Ops & resilience

**P2-11 · External calls in the WhatsApp webhook have no timeout (duplicate tickets)** — *Severity: MEDIUM · Score: 6/10*
- **🟢** When the WhatsApp intake calls out to the AI transcription/extraction services, there's no time limit. If one hangs, WhatsApp thinks the message failed and **re-sends it**, which can create duplicate ticket drafts — and the stuck request ties up a server slot.
- **🔧** No timeout on the 4 fetches in `app/api/webhooks/whatsapp/route.ts` (lines 88/156/171/233 — Meta media, Groq Whisper, Groq LLaMA, Graph send); also `lib/email.ts`, `lib/whatsapp.ts`, `lib/report-groq.ts`.
- **✅** Add `AbortSignal.timeout(~10_000)` to those fetches (and ideally the email/report ones).

**P2-12 · Handled errors never reach Sentry** — *Severity: MEDIUM · Score: 7/10*
- **🟢** Sentry catches *crashes* automatically, but errors the code catches on purpose (and turns into a generic "500") only go to the hosting logs, which are temporary and un-alerted — so you can be silently failing and not know.
- **🔧** ~59 API routes `console.error` + return a generic 500; `Sentry.captureException` is only explicitly called in `lib/rate-limit.ts`. No log drain (C4 open).
- **✅** Add `Sentry.captureException(e)` inside the route catch blocks (or set up a Vercel log drain with a 5xx alert).

**P2-13 · Notification-purge job isn't scheduled — table grows forever** — *Severity: LOW–MEDIUM · Score: 7/10*
- **🟢** The clean-up that deletes old notifications only runs inside a job that is **never actually scheduled**, so notifications pile up indefinitely unless someone triggers it by hand.
- **🔧** Purge lives only in the unscheduled `app/api/cron/v3-recompute/route.ts`; `vercel.json` schedules only `v3-snapshots`. (There's a free Hobby cron slot, but Hobby is daily-only.)
- **✅** Fold the purge into the scheduled `v3-snapshots` cron (same pattern as the briefing fold-in).

**P2-14 · Snapshot cron loops companies one-by-one — timeout risk as you grow** — *Severity: LOW · Score: 7/10*
- **🟢** The nightly stats job processes each company in sequence within a 60-second budget; enough companies and it runs out of time, silently skipping the later ones.
- **🔧** `lib/health/snapshots.ts:18` `runEstateSnapshots` is sequential; `maxDuration = 60` is the ceiling.
- **✅** Chunk the per-company work, or record per-company completion so a timeout resumes next run; revisit past ~10 companies.

### Code structure

**P2-15 · One 1,700-line "god component"** — *Severity: MEDIUM · Score: 6/10*
- **🟢** A single file holds the regional manager's entire ticket-action screen — 1,723 lines — which is too big to review safely, and it currently has uncommitted edits.
- **🔧** `components/regional/RmTicketActions.tsx` (1,723 lines / 110 KB).
- **✅** Split by action group (quote decisions / sign-off / snag / scheduling). Tracked as tech-debt in `PATH_TO_9.5.md` too.

**P2-16 · Orphan routes and ~1,300 lines of dead code** — *Severity: LOW–MEDIUM · Score: 7/10*
- **🟢** Several pages and components exist but nothing links to or imports them — dead weight that confuses future work and inflates the app.
- **🔧** Unreachable routes: `app/regional/supplier-reviews/[id]` (duplicate of `/regional/reviews/[id]`), `app/supplier/stores`, `app/supplier/regional`, `app/supplier/reports` (flag `reports:false` in `ExecChrome.tsx:89`). Orphan components (~560 lines): `Navbar.tsx`, `SlideOver.tsx`, `AuditTrail.tsx`, `CollapsibleCard.tsx`, `MarkAllReadButton.tsx`, `PersistentDetails.tsx`, `TicketFilterTiles.tsx`, `EditTicketForm.tsx`, `RecentTicketsCard.tsx`, `Building.tsx`, `RegionalRecentTickets.tsx`, `workflow/DueDate.tsx`. Remaining `components/dashboards/PrintButton.tsx` duplicates `components/reports/PrintButton.tsx`.
- **✅** Delete the orphans (verify once more with a whole-word grep before each delete); repoint the two `PrintButton` importers to the reports one and remove `components/dashboards/`.

**P2-17 · `UserRole` type omits `system_admin` (the type lies)** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The list of user roles in the code is missing "system_admin," even though the app checks for that role — so the type is wrong and won't catch mistakes.
- **🔧** `lib/types.ts:15` `UserRole` omits `system_admin` while `proxy.ts:93–102` gates on it. Also unused: `isStoreManager`/`isExecutive`/`QuoteType`/`RagStatus`/`SlaRule`/`RepeatDefectGroup` exports.
- **✅** Add `system_admin` to `UserRole`; adopt or delete the unused helpers/types.

**P2-18 · Same helper re-implemented in 5+ places** — *Severity: LOW · Score: 7/10*
- **🟢** A small role-check function is copy-pasted instead of imported, so a fix in one place misses the others.
- **🔧** `isStoreManager` exported at `lib/types.ts:244` but reimplemented inline at `app/settings/profile/page.tsx:61`, `app/settings/layout.tsx:36`, `app/admin/page.tsx:37`, `app/api/webhooks/whatsapp/route.ts:475,650`, `lib/briefing/generate.ts:179`. Also ZAR/date formatting re-derived outside `formatCurrency`/`formatDateTime` in several files (3 date sites omit `Africa/Johannesburg` and render UTC on the server).
- **✅** Import the shared helpers everywhere (grep-replace); route currency through `formatCurrency` and dates through `formatDateTime`.

### Repo hygiene

**P2-19 · Android release signing key sits inside the repo folder** — *Severity: MEDIUM (security-adjacent) · Score: 6/10*
- **🟢** The secret key used to sign the Android app is stored in the project folder. It's not committed to git right now, but it's one careless `git add -f` (or a folder-sync) away from leaking — and that key can't be un-leaked.
- **🔧** `motiv-release.keystore` at repo root; `.gitignore:25` excludes `*.keystore` (verified untracked).
- **✅** Move it outside the repo entirely; reference via `android/keystore.properties`.

**P2-20 · Multi-megabyte logo served on every screen + untracked logo staging dirs in `public/`** — *Severity: MEDIUM · Score: 6/10*
- **🟢** The default logo is a 2 MB image loaded on every branded screen (slow, wasteful), and there are two untracked "new logo" folders (5.6 MB) sitting inside the folder that gets published to the internet.
- **🔧** `public/brand/motiv-symbol.png` is 2.1 MB and is the default (`lib/settings.ts:29`); untracked `public/brand/new logo/` (3.5 MB) + `new new logo/` (2.1 MB), each with 0.8–2.2 MB PNGs.
- **✅** Pick the final logo, re-export at <100 KB, replace `public/brand/*`, delete both staging dirs.

---

# PRIORITY 3 — Polish & lower-risk items (low)

| ID | Plain words | Technical | Fix | Score |
|---|---|---|---|---:|
| P3-1 | Expensive AI quote-parser can be called by any logged-in user, not just suppliers | `app/api/parse-quote-pdf/route.ts:42–49` has no role check (only a 15/min rate limit) | Restrict to `role === 'supplier'` | 7/10 |
| P3-2 | A misconfigured deploy could make password-reset/invite tokens forgeable | `lib/auth-token.ts:8` falls back to literal `'motiv-insecure-fallback'` if `SUPABASE_SERVICE_ROLE_KEY` unset | Throw on missing secret instead of using a constant | 7/10 |
| P3-3 | A few file-signing GET endpoints have no rate limit | `tickets/[id]/quotes|signoff|dispute|chat` GETs sign via admin client, unthrottled | Add a light per-user `rateLimit` | 8/10 |
| P3-4 | One error route sends internal detail to the client | `app/api/admin/branding/logo/route.ts:111` returns raw `e.message` in a 500 | Return a generic message; log detail server-side | 8/10 |
| P3-5 | App shows a blank error page with no internet (incl. Android wrapper) | `public/sw.js` v6 has no fetch handler / offline fallback | Optional: add a minimal cached "You're offline" page — do NOT add asset caching without a versioned strategy | 8/10 |
| P3-6 | Dead image config points at public storage paths, but all buckets are private now | `next.config.mjs` `images.remotePatterns` allows only `/object/public/**` | Update to `/object/sign/**` or delete if `next/image` isn't used on storage images | 8/10 |
| P3-7 | A privileged DB function accepts an unvalidated URL | `append_session_photo` (`schema.sql:1211`) appends caller-supplied `photo_url` unchecked (mitigated: service-role-only) | Keep the revoke; optionally validate URL shape before calling | 8/10 |
| P3-8 | Half the scoring engine has no tests | `regionalHealth`/`estateHealth`/`ticketHealth`/`supplierPerformance`/`repeatDefects`/`decisions` untested (pure functions — easy targets) | Add vitest coverage for the 6 modules (no mocks needed) | 7/10 |
| P3-9 | No end-to-end/smoke automation | Launch smoke test (A8) is manual | Post-launch: scripted Playwright smoke against preview deploys | 7/10 |
| P3-10 | No unique guard on one-sign-off-per-ticket | `signoffs` (`schema.sql:340`) has no unique on `ticket_id` (may be intended — multi-round via `signoff_rounds`) | If one-open-signoff is the rule, add a partial unique index; else document | 8/10 |
| P3-11 | `SendQuoteForm` still lives under the old `admin` folder name | `components/admin/SendQuoteForm.tsx` used only by supplier surface (admin→supplier rename remnant) | Move to `components/supplier/`; leave DB `admin_id` columns as documented | 8/10 |

---

# PRIORITY 4 — Owner / non-code items (must-do for a real launch, but not Claude's to write)

These need *you* (purchase, legal, external registration) — they're the bulk of what stands between "works" and "9.5." Most are already tracked in `PATH_TO_9.5.md`; listed here so the picture is complete.

| ID | Plain words | What it is | Score |
|---|---|---|---:|
| P4-1 | The legal pages are fill-in-the-blank templates | `/privacy`, `/terms`, `/sla` still have bracketed placeholder copy; need real content + a lawyer sign-off (A3) | 3/10 |
| P4-2 | POPIA (SA privacy law) isn't satisfied | Must appoint + register an Information Officer with the Information Regulator; add a signup consent checkbox with stored timestamp (C11 — the checkbox is Claude-doable) | 3/10 |
| P4-3 | Vercel Hobby isn't licensed for commercial use | A public/commercial launch legally requires Vercel Pro (~$20/mo) (A5) | 4/10 |
| P4-4 | No uptime or error alerting | Set up uptime monitoring on the public URL + key APIs (C3) and a Vercel log drain alerting on auth failures / 5xx spikes (C4) | 4/10 |
| P4-5 | Supabase Auth dashboard not hardened | Set Site/redirect allowlist (no wildcards), Confirm-email ON, server-side min password length, **CAPTCHA on signup**, custom SMTP (Appendix A) | 5/10 |
| P4-6 | No staging environment | A 2nd Vercel project + Supabase branch to rehearse migrations + the next framework upgrade before they hit prod (C1) | 5/10 |
| P4-7 | No incident runbook | Written steps for key rotation, deploy rollback, DB restore (C6) | 5/10 |
| P4-8 | No independent security validation | Commission a penetration test after the P0/P1 fixes land (C12) | 4/10 |
| P4-9 | `WHATSAPP_APP_SECRET` unset | Set once the business is registered with Meta (the webhook already fail-closes in prod until then, so this is safe) (A6) | 7/10 |

---

# The recommended order of attack (do this, in this order)

1. **P0-1** — patch the profile-update RLS policy + revoke column grants. *One SQL migration. Nothing ships until this is done.*
2. **P0-2** — buy Supabase Pro, turn on PITR/backups. *Before any real data.*
3. **P1-1** — close/scope the `/api/suppliers` leak. *One-line query fix.*
4. **P1-2** — apply the `app_settings` + `ticket_chat` migrations; get `tsc` green. *Unblocks the deploy.*
5. **P1-5** — commit/separate the WIP, PR `project-tracking` → `main`, apply projects migration to prod.
6. **P1-3** — bound the `lib/health/data.ts` ticket queries. *Before any company gets busy.*
7. **P1-4** — one doc-sync pass on `CLAUDE.md`/`AGENTS.md`/`DASHBOARDS_V2.md`. *Cheap; protects every future session.*
8. **P4-1 / P4-2 / P4-3 / P4-5** — legal copy, POPIA, Vercel Pro, Auth dashboard hardening. *Owner track — start these in parallel now; they have lead time.*
9. **All P2 items** — the medium hardening list, in roughly the order above.
10. **P3 + remaining P4** — polish and validation (pen test, staging, runbook).

**Bottom line:** the app is *well-built* — the CI, observability, and security patterns are better than most pre-launch products. It is **not launch-ready today** because of one critical account-takeover bug (P0-1) and no backups (P0-2). Fix the P0 + P1 list (mostly small, mostly code) and address the owner track (P4), and this is a genuine 9+ /10 platform.

---
*Generated by a 4-agent parallel audit (security · database · code-structure · ops) on 2026-07-15. P0-1 was manually re-verified against the schema, grants, and triggers. Cross-referenced against the repo's own [`docs/PATH_TO_9.5.md`](PATH_TO_9.5.md).*
