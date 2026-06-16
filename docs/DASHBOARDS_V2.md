# Motiv — Regional & Executive Dashboards (v2)

Decision-driven maintenance dashboards: weighted **Store Health**, **Regional
Portfolio Health** and **Executive Estate Health**, dual **Supplier / Internal
SLA** tracking, blocker ownership, supplier performance, repeat-defect
detection and an auto-generated **Executive Decisions Required** list.

This document is the implementation reference. The engine is pure TypeScript in
`lib/dashboards/`; the DB layer is the migration `supabase/migrations/20260616_dashboards_v2.sql`.

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

## 2. Data model (migration `20260616_dashboards_v2.sql`)

New / changed:

| Table | Purpose |
|---|---|
| `regions` | A store belongs to a region; a region has an assigned regional manager. Estate rolls up region → estate. |
| `profiles.region_id` | Store → region link (new column). `role` enum gains `executive`. |
| `sla_rules` | Per-priority SLA targets. Global default row (`region_id NULL`) seeded with SA-market defaults; override per region as clients onboard. |
| `tickets` (+~50 cols) | Classification (`category`, `severity`, impact flags), supplier link (`supplier_id`), dual-SLA timestamps, quote lifecycle, blocker, evidence flags, repeat-defect group, freshness markers, cached health. All nullable/defaulted — existing tickets keep working. `region_id` auto-filled from the store by trigger. |
| `repeat_defect_groups` | Recurring category at a store (+ dominant supplier, root-cause/action). |
| `ticket_sla_events` | Audit-grade SLA event history. |
| `ticket_blockers` | Blocker history (type, owner, started/resolved). |
| `ticket_evidence` | Before/after photos, COC, invoice. |
| `approvals` | Quote/variation/completion/funding approvals with due dates. |
| `store_health_scores` | Daily store snapshot (6 sub-scores + calculated/override/final). |
| `regional_health_scores` | Daily region snapshot (avg, penalty, final, RAG counts). |
| `executive_estate_health_scores` | Daily estate snapshot (weighted, penalty, distribution, trend inputs). |
| `supplier_performance_scores` | Daily supplier snapshot (SLA, first-fix, evidence, score/band). |
| `dashboard_snapshots` | JSON payload per scope (estate/region/store) for fast loads + month-end. |
| `audit_logs` | Generic action log. |

RLS: heavy reads use the service-role client (RLS bypass), so policies are
defence-in-depth — executives read all analytics; regional managers read rows
for regions they manage; suppliers read ticket-scoped rows; service role (cron)
writes.

---

## 3. Store Health logic (`lib/dashboards/storeHealth.ts`)

```
Store Health (0-100) =
  Operational Risk (30) + SLA (20) + Ticket Load (15)
  + Repeat Defect (15) + Commercial Blocker (10) + Data Quality (10)
```

Bands: **85-100 Green / 70-84 Amber / 50-69 Red / 0-49 Critical**.

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

Stored fields: `calculated_health_score`, `calculated_rag_status`,
`override_applied`, `override_reason`, `final_health_score`, `final_rag_status`.

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

## 8. API endpoints

- `GET /api/dashboards/regional` — full regional payload (regional_manager only)
- `GET /api/dashboards/executive` — full estate payload (executive only)
- `GET /api/cron/recompute` — refresh active-ticket caches (cron/exec)
- `GET /api/cron/snapshots` — daily health snapshots (cron/exec)

The dashboard payloads contain every sub-list (top-risk, ranking, suppliers,
repeat defects, decisions, backlog), so additional read endpoints can slice the
same payload if needed.

## 9. Scheduled jobs (`vercel.json`)

- Hourly `0 * * * *` → `/api/cron/recompute`
- Daily `30 0 * * *` → `/api/cron/snapshots`

Authorised by `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or a signed-in
executive. Higher-frequency jobs (15-min urgent SLA) can be added on a paid
Vercel plan. Event-based recompute can call `recomputeActiveTickets()` from the
relevant write route handlers.

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
`constants.ts` (`RAG_COLORS`, `RAG_STROKE`, `RAG_LABELS`, `PORTFOLIO_LABELS`).

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
1. Open Supabase → SQL Editor. Paste & run `supabase/migrations/20260616_dashboards_v2.sql`. Idempotent; safe to re-run. It backfills one region per existing RM and links stores + tickets.

**Create an executive user:**
2. Create the auth user (Supabase Auth or signup), then in SQL:
   `update public.profiles set role = 'executive' where email = '<exec email>';`
   (The signup trigger only self-assigns store_manager/regional_manager; executive is set by an admin.)

**Configure:**
3. Set `CRON_SECRET` in Vercel env so the cron routes authorise.
4. (Optional) Per-region SLA overrides: insert rows into `sla_rules` with the region's `region_id`. Global defaults already seeded.
5. Assign stores to regions / set a region's RM via `regions.regional_manager_id` and `profiles.region_id` as you onboard.
6. Run `/api/cron/snapshots` once (as executive) to seed the first snapshot; trends light up from the next day.

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
