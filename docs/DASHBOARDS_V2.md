# Motiv — Regional & Executive Dashboards (v2)

Decision-driven maintenance dashboards: weighted **Store Health**, **Regional
Portfolio Health** and **Executive Estate Health**, dual **Supplier / Internal
SLA** tracking, blocker ownership, supplier performance, repeat-defect
detection and an auto-generated **Executive Decisions Required** list.

This document is the implementation reference. The engine is pure TypeScript in
**`lib/health/`** (the original `lib/dashboards/` v2 copy was deleted — v3 in
`lib/health/` is the only engine); the DB layer is folded into the canonical
`supabase/schema.sql`.

---

## 1. Strategy

Every panel answers a decision question, not just a count: *What is at risk? What
is overdue? Who owns the next action? What needs approval? What must be
escalated? What is creating cost exposure?* High-value exceptions are shown
first; full lists live behind drill-down pages and the printable report.

Health is a **weighted business-risk score**, never "% completed". A store with
a high average but an open safety risk is forced to **Critical** by override
rules, so good averages can't hide dangerous outliers.

---

## 2. Data model (see `supabase/schema.sql` — canonical)

| Table | Purpose |
|---|---|
| `regions` | A store belongs to a region (`stores.region_id`); RMs map to regions via the `regional_users` join table. Estate rolls up region → estate. |
| `sla_rules` | Per-priority SLA targets. Global default row (`region_id NULL`) seeded with SA-market defaults; override per region as clients onboard. |
| `tickets` (+~50 cols) | Classification (`category`, `severity`, impact flags), supplier link (`supplier_id`), dual-SLA timestamps, quote lifecycle, blocker, evidence flags, repeat-defect group, freshness markers, cached health. All nullable/defaulted — existing tickets keep working. `region_id`/`region_code` are copied from the store by the create-ticket API. |
| `repeat_defect_groups` | Recurring category at a store (+ dominant supplier, root-cause/action). |
| `ticket_sla_events` | Audit-grade SLA event history. |
| `ticket_blockers` | Blocker history (type, owner, started/resolved). |
| `ticket_evidence` | Before/after photos, COC, invoice. |
| `approvals` | Quote/variation/completion/funding approvals with due dates. |
| `store_health_scores` | Daily store snapshot (6 sub-scores + calculated/override/final). |
| `regional_health_scores` | Daily region snapshot (avg, penalty, final, RAG counts). |
| `estate_health_scores` | Daily estate snapshot (weighted, penalty, distribution, trend inputs). |
| `supplier_performance_scores` | Daily supplier snapshot (SLA, first-fix, evidence, score/band). |
| `dashboard_snapshots` | JSON payload per scope (estate/region/store) for fast loads + month-end. |
| `audit_logs` | Generic action log. |

RLS: heavy reads use the service-role client (RLS bypass), so policies are
defence-in-depth — executives read all analytics; regional managers read rows
for regions they manage; suppliers read ticket-scoped rows; service role (cron)
writes.

---

## 3. Store Health logic (`lib/health/storeHealth.ts`)

```
Store Health (0-100) =
  Operational Risk (30) + SLA (20) + Ticket Load (15)
  + Repeat Defect (15) + Commercial Blocker (10) + Data Quality (10)
```

Bands (`lib/health/constants.ts` `statusForScore`): **95–100 Controlled /
80–94 Attention / 51–79 At Risk / 0–50 Critical**.

Sub-scores are deductive (start at the weight, subtract for risk). Then
**override rules** can only *worsen* the band (and the number is capped into the
worse band so score & RAG always agree):

- Unresolved safety risk → **Critical**
- Critical + trading-impact open → **Critical** ("cannot trade")
- Critical issue overdue/breached → **Critical**
- Approval blocker on critical/trading past internal SLA → **Critical**
- >3 repeat defects in 30 days → **Red**
- No update on a critical ticket >48h → **Red**
- Trading-impact issue overdue → **Red**

Stored fields: `calculated_health_score`, `calculated_status`,
`override_applied`, `override_reason`, `final_health_score`, `final_status`.

## 4. Regional Portfolio Health (`regionalHealth.ts`)

```
Portfolio Health = Average(final store health) − Risk Penalty   (capped 0-100)
```
Penalties: any critical store −5; ≥3 red stores −5; critical ticket overdue −5;
internal SLA breach >3d −3; supplier SLA breach >3d −3; repeat defects across
stores −3; quote backlog > threshold −3; missing critical updates −3.

## 5. Executive Estate Health (`estateHealth.ts`)

```
Estate Health = Σ(region portfolio health × active stores) / total stores − Estate Penalty
```
Penalties: any critical region −5; >5% stores critical −5; >10% stores red −5;
supplier/internal SLA trend up −3 each; quote backlog trend up −3; repeat
defects trend up −3; cost exposure over threshold −3; critical ticket overdue −5.
Trend flags compare today's live counts to yesterday's estate snapshot.

## 6. SLA & blocker logic (`sla.ts`)

Two independent clocks per ticket:

- **Supplier SLA** — acknowledge, attend, resolve, upload evidence.
- **Internal SLA** — approve quote, confirm store access, instruct, confirm completion, respond to escalation.

When the ball is internal/store-side the **supplier clock pauses but the
internal clock keeps running**, so delays are never hidden. Outputs per ticket:
`supplier_sla_status`, `internal_sla_status`, `current_blocker`,
`blocker_owner_type`, `days_with_blocker`, `delay_owner`, `next_action`,
`next_action_due_at`, and a visual label (Healthy / At Risk / Breached /
Blocked by Supplier|Internal Action|Approval|Store Access / Completed Within|Late SLA).
Due dates are derived from `sla_rules` when a ticket lacks explicit timestamps,
so legacy tickets still score.

---

## 7. Calculation functions (file map)

| Spec function | Location |
|---|---|
| calculateTicketHealth | `ticketHealth.ts` |
| calculateStoreHealth | `storeHealth.ts` |
| calculateRegionalPortfolioHealth | `regionalHealth.ts` |
| calculateExecutiveEstateHealth | `estateHealth.ts` |
| calculateSupplierSLA / InternalActionSLA | `sla.ts` (`computeTicketSla`) |
| detectRepeatDefects | `repeatDefects.ts` |
| calculateSupplierPerformance | `supplierPerformance.ts` |
| getTopRiskStores / getRegionalRanking | `ranking.ts` |
| getExecutiveDecisionItems | `decisions.ts` |
| updateRegional/ExecutiveDashboard | `data.ts` (`assembleRegionalDashboard`, `assembleEstateDashboard`) |
| snapshot persistence | `snapshots.ts` |
| ticket cache recompute | `recompute.ts` |

Tunable weights/thresholds/penalties live in `constants.ts`.

## 8. Data access

There are no `/api/dashboards/*` endpoints — role pages call the server-only
assemblers in `lib/health/data.ts` directly (`assembleEstateDashboard`,
`assembleRegionalDashboard`, `assembleStoreManagerDashboard`,
`assembleSupplierDashboard`). Each payload contains every sub-list (top-risk,
ranking, suppliers, repeat defects, decisions, backlog).

## 9. Scheduled jobs (`vercel.json`)

- Daily `0 5 * * *` → `/api/cron/v3-snapshots` — repeat-defect recompute +
  health snapshots + morning-briefing push + archived-notification purge,
  bundled into the single cron the Vercel Hobby plan allows.
- `/api/cron/v3-recompute` exists as a **manual/executive trigger only** (not
  scheduled).

Authorised by `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or a signed-in
executive/system_admin. Higher-frequency jobs (15-min urgent SLA) need a paid
Vercel plan — see the deferred backlog in `docs/INFRASTRUCTURE_TIERS.md`.

## 10. UI layout

**Regional** (`/regional`): portfolio gauge + status + penalties → KPI grid →
Recommended Focus Today → Stores Requiring Attention / Performing Well → Ticket
Action List → Internal Action Backlog + Quote/Cost Exposure → Supplier
Performance + Repeat Defects. Drill-down: store pages, ticket pages.

**Executive** (`/executive`): estate gauge + distribution → KPI grid → Regional
Ranking → Top Risk Stores → Decisions (preview). Full tables on
`/executive/regions`, `/executive/stores`, `/executive/suppliers`,
`/executive/decisions`; printable report on `/executive/reports`.

Immediately visible: health %, RAG, the few things needing action today.
Behind drill-down: full ticket lists, full supplier tables, history.

## 11. Reporting

`/executive/reports` renders an exception-based estate report (estate health,
regional ranking, top risk stores, decisions, repeat defects) with Print/Save-as-PDF.
Regional reporting continues through the existing `ReportBuilder`.

## 12. Visual status language

Green = Controlled · Amber = Attention Required · Red = At Risk · Critical =
Immediate Intervention. Ticket labels as in §6. Shared classes in
`lib/health/constants.ts` (`STATUS_COLORS`, `STATUS_STROKE`, `STATUS_RANK`,
`statusForScore`).

---

## 13. Test cases & expected outcomes

| # | Scenario | Expected |
|---|---|---|
| 1 | RM with 3 stores | Portfolio = avg of 3 finals − penalties; all 3 listed; fast. |
| 2 | RM with 50 stores | Same model; attention/healthy lists capped (top N), full lists on drill-down. |
| 3 | Executive, 500 stores | Estate = store-count-weighted avg of regions − penalties; ranking + top-10 risk only. |
| 4 | Region: 1 critical store, many healthy | Portfolio takes −5 (any critical) so it can't read Green; critical store tops attention. |
| 5 | High avg but supplier SLA breaches >3d | −3 penalty; supplier flagged in Supplier Performance; breaches in KPI. |
| 6 | Paused supplier SLA but internal breached | Supplier=Paused, Internal=Breached; ticket label "Blocked by Approval/Internal Action"; appears in Internal Action Backlog; counts as overdue. |
| 7 | Estate: rising repeat defects | `repeatDefectsTrendUp` (when prior snapshot exists) → estate −3; repeat section populated; decisions add Review/Fund. |
| 8 | Estate: rising quote backlog | `quoteBacklogTrendUp` → estate −3; high-value approvals → Approve/Fund decisions. |
| 9 | Store with no tickets | Health ~100 (Data Quality may be 8-10 if `region_id` set); not in attention list. |
| 10 | Store with multiple overdue tickets | Operational Risk + SLA + Load drop; overdue count up; likely Amber/Red. |
| 11 | Store with critical safety ticket | Override → **Critical** regardless of other scores; tops top-risk & decisions (Escalate). |
| 12 | Store with missing evidence | Ticket health −12; Data Quality drops; supplier evidence rate falls. |
| 13 | Store with repeat-defect pattern (>3/30d) | Override → **Red**; repeat section + decision (Review/Fund CAPEX). |

Engine functions are pure and injected with `now`, so each case is unit-testable
by constructing `Ticket` fixtures and asserting the returned scores/labels.

## 14. Developer / operations checklist

**Apply the schema (manual, per repo convention):**
1. The dashboards schema is already part of `supabase/schema.sql` — a fresh
   environment just runs that one file in the Supabase SQL Editor.

**Create an executive user:**
2. Preferred: create execs from the platform-admin Accounts page. Manual SQL
   fallback: `update public.user_profiles set role = 'executive' where email = '<exec email>';`
   (The signup trigger only ever self-assigns `individual`; executive/RM/SM are
   set by the trusted admin invite paths.)

**Configure:**
3. Set `CRON_SECRET` in Vercel env so the cron routes authorise.
4. (Optional) Per-region SLA overrides: insert rows into `sla_rules` with the region's `region_id`. Global defaults already seeded.
5. Assign stores to regions (`stores.region_id`) and link RMs via the
   `regional_users` join table — both managed from the admin Hierarchy tab.
6. Run `/api/cron/v3-snapshots` once (as executive) to seed the first snapshot; trends light up from the next day.

**Verify:** log in as executive → `/executive`; as RM → `/regional`. KPIs and
gauges should populate from live tickets even before snapshots exist.

## 15. Pending / next steps (not in this pass)

- Ticket **intake form** fields for `category`, `severity`, impact flags,
  `supplier_id`, evidence — currently nullable, so Data Quality scores reflect
  missing data until capture is added.
- Writing `ticket_sla_events` / `ticket_blockers` / `ticket_evidence` /
  `approvals` rows from the ticket write routes (history is modelled; emit on events).
- Per-region supplier performance snapshots (estate-wide done).
- 15-minute urgent-SLA cron (needs paid Vercel plan) + event-based recompute hooks.
- Region admin UI (create regions, assign RMs/stores, edit `sla_rules`).
- CSV/XLSX export of supporting detail (libraries `xlsx`/`docx` already present).
