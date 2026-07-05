-- ============================================================
-- Close RLS gaps on 7 tables that shipped with RLS DISABLED.
-- Run in the Supabase SQL Editor. Idempotent.
--
-- Live audit (2026-07-06) found these tables with rowsecurity = false, so any
-- authenticated user could read/write them directly via PostgREST:
--   assets, asset_categories, asset_health_scores, asset_service_history,
--   preventative_maintenance_plans, preventative_maintenance_tasks,
--   store_ticket_counters
--
-- IMPORTANT ORDER: store_ticket_counters is written by the assign_store_job_ref
-- trigger on ticket INSERT. That trigger is NOT security-definer, so it runs as
-- the inserting user — enabling RLS on the counter table WITHOUT first making the
-- trigger definer would make every ticket insert fail. So step 1 fixes the trigger.
-- ============================================================

-- 1. Make the job-ref trigger run with the function owner's rights so it can keep
--    writing store_ticket_counters after we lock that table down.
alter function public.assign_store_job_ref() security definer;
alter function public.assign_store_job_ref() set search_path = public;

-- 2. Enable RLS on all 7.
alter table public.assets                          enable row level security;
alter table public.asset_categories                enable row level security;
alter table public.asset_health_scores             enable row level security;
alter table public.asset_service_history           enable row level security;
alter table public.preventative_maintenance_plans  enable row level security;
alter table public.preventative_maintenance_tasks  enable row level security;
alter table public.store_ticket_counters           enable row level security;

-- 3. Company-scoped READ policies where the table carries company_id.
--    Writes stay service-role only (these are not user-written today).
drop policy if exists "assets read" on public.assets;
create policy "assets read" on public.assets for select
  using (company_id = public.app_company_id());

drop policy if exists "asset_categories read" on public.asset_categories;
create policy "asset_categories read" on public.asset_categories for select
  using (company_id = public.app_company_id());

drop policy if exists "pm_plans read" on public.preventative_maintenance_plans;
create policy "pm_plans read" on public.preventative_maintenance_plans for select
  using (company_id = public.app_company_id());

-- 4. Child tables have no company_id — scope through the parent's company.
drop policy if exists "asset_health read" on public.asset_health_scores;
create policy "asset_health read" on public.asset_health_scores for select
  using (exists (select 1 from public.assets a
                 where a.id = asset_health_scores.asset_id
                   and a.company_id = public.app_company_id()));

drop policy if exists "asset_service read" on public.asset_service_history;
create policy "asset_service read" on public.asset_service_history for select
  using (exists (select 1 from public.assets a
                 where a.id = asset_service_history.asset_id
                   and a.company_id = public.app_company_id()));

drop policy if exists "pm_tasks read" on public.preventative_maintenance_tasks;
create policy "pm_tasks read" on public.preventative_maintenance_tasks for select
  using (exists (select 1 from public.preventative_maintenance_plans p
                 where p.id = preventative_maintenance_tasks.plan_id
                   and p.company_id = public.app_company_id()));

-- 5. store_ticket_counters: NO policy on purpose → default-deny to every user.
--    Only the (now security-definer) trigger + the service role touch it.
