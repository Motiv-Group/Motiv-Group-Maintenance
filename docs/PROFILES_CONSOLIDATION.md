# Profiles → v3 consolidation (executed)

## Root cause
`public.profiles` (the v1 mega-table) **does not exist** in the live DB. In v3 it was split into `user_profiles` (identity/role) + `stores` (branch/budget/region link) + `regions` + `regional_users` (RM↔region link). 35 files still queried the dead `profiles` table — a mix of dead legacy code and live-but-broken v3 pages.

> ⚠️ The initial automated reachability map had several false "dead" calls (routes fetched by live components were marked dead). Every classification below was hand-verified against actual fetch/href/router.push call chains before acting. **Result: zero `from('profiles')` references remain; build + tsc pass.**

## What was done

### Repointed → `user_profiles` (live, pure-profile columns)
Simple table swap; columns (role/full_name/company_name/sub_store/id/email/phone/address) all exist on `user_profiles`:
`app/api/quotes/[id]/respond`, `app/api/reports/supplier`, `app/api/suppliers`, `app/api/suppliers/[id]`, `app/api/suppliers/bulk`, `app/regional/reviews/[id]/page`, `app/regional/suppliers/[id]/page`, `app/settings/layout`, `app/supplier/reports/view/page`.

### Rewritten → v3 schema (live, store/region columns)
Store data → `stores`; RM lookups → `regional_users.select('user_id').eq('region_id', …)` (0/1/many RMs); `capex_budget` → `stores`:
- `app/api/quotes/route.ts`, `app/api/quotes/[id]/route.ts` — RM-notify now via `ticket.region_id` → `regional_users` (notifies all RMs, `sendPushToMany`).
- `app/api/supplier/assign-rm/route.ts` — store→RM assignment now upserts/deletes `regional_users` for the store's region (**semantic change: region-level, not per-store** — the only faithful v3 mapping).
- `app/api/regional/store-budget/route.ts` — `capex_budget` on `stores`; ownership via `regional_users`.
- `app/api/reports/regional/route.ts`, `app/regional/reports/view/page.tsx` — store list from `stores` in the RM's regions (`name`→`company_name`).
- `app/regional/stores/[id]/page.tsx`, `app/regional/stores/[id]/budget/page.tsx` — store detail from `stores`; SM contact via `store_users`→`user_profiles`.
- `app/supplier/stores/page.tsx`, `app/supplier/stores/[id]/page.tsx`, `app/supplier/regional/page.tsx`, `app/supplier/regional/[id]/page.tsx` — store/RM lists from `stores`/`user_profiles`; per-store RM via region map.

### Deleted (confirmed dead — orphaned-component-backed or unreferenced)
Routes: `completions`, `completions/[id]/review`, `cron/recompute`, `cron/snapshots`, `dashboards/executive`, `dashboards/regional`, `regional/add-store`, `regional/close-store`, `regional/decline-ticket`, `regional/invite-store`, `regional/invite-store/bulk`.
Lib: entire `lib/dashboards/` (the legacy duplicate engine), `lib/provision-store.ts`.
Components: `components/dashboards/{decisionChip,primitives,ResponsiveTable}`.
Config: removed the dead `/api/cron/snapshots` cron from `vercel.json` (superseded by `/api/cron/v3-snapshots`; it had been failing nightly against the dead table).

## ⚠️ Needs runtime verification
The rewrites were verified by `tsc`/`build` only — Supabase is untyped, so a wrong table/column compiles but fails at runtime. Before relying on these in production, exercise against real data:
- RM receives quote notifications (quotes routes).
- Assign/unassign RM on a store (region-level semantics — confirm this matches intended UX; a store's RM assignment now affects the whole region).
- Store budget set/read; regional + supplier reports; regional & supplier store/RM detail pages.

## Orphaned components still present (harmless dead code, optional cleanup)
`components/regional/{CompletionReviewCard,AddStoreForm,StoreCloseControls,StaleTicketActions}`, `components/admin/SubmitCompletionForm` (the live one is `components/supplier/SubmitCompletionForm`), plus the other orphans from the structure audit. They no longer have working endpoints; safe to delete in a follow-up.
