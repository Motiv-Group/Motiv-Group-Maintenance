# B19 — Workflow Consolidation Design

> **Status: IMPLEMENTED 2026-07-18** (6 sequential commits on `b19-workflow-consolidation`; suite 520→554, e2e 15/15 green vs the dev project).
> **What landed:** the pure engine helpers (`resolveBlockerState`, `computeQuoteDue`, `stampFreshness`) live in `lib/workflow.ts` with 34 unit tests; the side-effect service (`notifyNextActors`, `logQuoteRequest`) lives in `lib/services/ticket-workflow.ts`; the transition route runs fully on both; the four other routes adopted every concern that was byte-identical (freshness everywhere, quote-due + quote-log in assign/quote-decision).
> **Key discovery:** several "duplicates" were actually SILENT BEHAVIORAL DIVERGENCES (bespoke notification copy per route, blocker columns deliberately not stamped on submit-quote/assign/quote-decision/dispute, individual-vs-company quote-due defaults). Per §2's no-behavior-change rule they stay route-local — but each is now annotated in-code with a B19 note, so the divergence is documented instead of accidental. Unifying them would be a deliberate BEHAVIOR-change project, not a refactor.
> **Goal:** stop ticket state-changes drifting into N slightly-different versions across routes.

## 1. Problem

The central engine is `lib/workflow.ts` (`resolveTransition`, `TRANSITIONS`) driven by
`app/api/tickets/[id]/transition/route.ts`. But five other routes mutate ticket / related
state **directly**, re-implementing the same concerns inline:

- `quote-decision` (approve / decline / requote a quote)
- `assign` (invite suppliers to quote)
- `submit-quote`
- `dispute` (`resolveDispute` applies status changes)
- ~~`decline-invite`~~ (deleted 2026-07-16 — had zero callers; the supplier UI posts to `/api/supplier/decline-work`)

The transition route has a clean helper, `lifecycleFields(to, now, tgt)`, that maps a
destination status → blocker/pause columns. **None of the other routes reuse it** — they
hardcode the blocker state, SLA-due stamping, notification fan-out, quote-request logging,
freshness stamps, and commercial-phase validation. Each copy can drift; a bug fixed in one
place stays broken in the others.

## 2. Non-goals (explicitly)

- **Do NOT force every action through `resolveTransition`.** `quote-decision` (multi-quote
  award/auto-close), `dispute` (a parallel concern that pauses a step), and `assign` (fan-out
  invites) are **not** single status transitions. Over-unifying them would be worse than the
  duplication.
- **Do NOT change behaviour during extraction.** Phase 1 moves code verbatim behind helpers;
  de-duplication only after tests pin the current behaviour.
- No new abstractions beyond the six shared concerns identified below.

## 3. Target architecture

Two layers, matching the existing pure-engine style (`lib/health/*` is pure + injected `now`):

**A. Pure engine helpers** → `lib/workflow.ts` (pure, no DB, unit-testable):
- `resolveBlockerState(toStatus, now, sla)` — the current `lifecycleFields`, relocated + renamed.
- `computeQuoteDue(now, sla, isIndividual)` — the `addMins(tgt.quote_due_mins)` sequence.
- `stampFreshness(role, now)` — `{ last_supplier_update_at? | last_internal_update_at? | last_store_update_at? }`.
- `isCommercialPhase(status)` — already exists; make it the single guard.

**B. Side-effect service** → new `lib/services/ticket-workflow.ts` (takes the admin client;
does DB fan-out; no HTTP concerns):
- `notifyNextActors(admin, ticket, action, actor, opts)` — the transition route's `notify()`
  generalised (role→user routing for supplier / RM / store / individual-owner).
- `logQuoteRequest(admin, ticket, supplierId, now, kind)` — the `ticket_quote_requests` insert.

Routes become thin: **auth → validate → mutate via user client → call service for fan-out →
revalidate**. This mirrors the API-route pattern already in `CLAUDE.md`.

## 4. The six duplicated concerns (from the current-state map)

| # | Concern | Today (duplicated in) | Centralise as |
|---|---------|-----------------------|---------------|
| 1 | blocker/pause columns | transition `lifecycleFields`; hardcoded in quote-decision, assign, submit-quote | `resolveBlockerState()` (engine) |
| 2 | SLA-due stamping | transition, assign, quote-decision/requote | `computeQuoteDue()` (engine) |
| 3 | notification dispatch | transition `notify()`; inline in quote-decision, assign, submit-quote, dispute | `notifyNextActors()` (service) |
| 4 | quote-request audit log | transition, assign, quote-decision/requote | `logQuoteRequest()` (service) |
| 5 | commercial-phase validation | `resolveTransition` (implicit); assign explicit; quote-decision implicit | `isCommercialPhase()` guard (engine) |
| 6 | freshness stamps | transition per-role; dispute per actor; submit-quote partial | `stampFreshness()` (engine) |

## 5. Migration plan — one PR per step, lowest-risk first

Each PR: extract/reuse → run tsc + lint + test + build + the `tickets-authz` integration tests →
merge. Behaviour-preserving; the point is that each route ends up calling the same helper.

1. **Extract pure helpers** (`resolveBlockerState`, `computeQuoteDue`, `stampFreshness`) into
   `lib/workflow.ts` **verbatim** from the transition route + **unit tests** (extend
   `lib/workflow.test.ts`). Swap the transition route to the relocated helpers. *Lowest risk —
   pure code, no behaviour change, fully unit-tested.*
2. **Extract the side-effect service** (`notifyNextActors`, `logQuoteRequest`) into
   `lib/services/ticket-workflow.ts`; swap the transition route onto it.
3. **`submit-quote`** → helpers + service (simplest off-engine route: one insert + one status set).
4. **`assign`** → helpers + service (fan-out invites; reuse `computeQuoteDue`, `logQuoteRequest`).
5. **`quote-decision`** → helpers + service (keep the 3-way decline branching route-local; only
   the blocker/notify/log concerns move).
6. **`dispute`** → `resolveDispute` reuses `resolveBlockerState` + `stampFreshness`.

`decline-invite` was deleted 2026-07-16 (dead — superseded by `/api/supplier/decline-work`).

## 6. Test strategy

- **Pure helpers** — unit tests in `lib/workflow.test.ts` (same style as the transition matrix).
  This is where the real regression net lives.
- **Routes** — extend `tests/api/tickets-authz.test.ts` (hoisted Supabase mock) to cover each
  migrated route's authZ + the key state outcome (e.g. approve → `accepted`/`scheduled`,
  supplier awarded, others closed). Guards against the extraction changing observable behaviour.
- CI already runs all four gates + these tests on every PR (B2), so a regression can't merge.

## 7. Risks & mitigations

- **Behavioural drift during extraction** → extract verbatim first, add tests, dedupe second.
- **Over-unification** → keep genuinely route-specific logic (decline branching, dispute origin
  handling) in the route; only the six listed concerns move.
- **Big blast radius if done at once** → strictly one route per PR, each independently verified;
  never a single mega-refactor.
- **Typed Supabase (B20)** should land first so the extracted helpers are type-checked against
  the schema.

## 8. Definition of done

All five state-changing routes derive blocker/pause columns, SLA-due dates, freshness stamps,
notifications, and quote-request logs from the **shared** engine + service — no inline copies.
`grep`-able check: `lifecycleFields`-style blocker literals appear in exactly one place.
