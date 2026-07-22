-- ---------------------------------------------------------------------------
-- 20260726_project_rm_access
-- ---------------------------------------------------------------------------
-- Per-RM project visibility. Each regional manager sees only the projects
-- they're explicitly assigned to (none, one, or many) — the system admin
-- manages the list from Accounts. Same locked-join-table pattern as
-- rm_executive_links; writes go through the service-role client only.
--
-- Backfill preserves current behaviour: every existing RM is granted every
-- EXISTING project in their company, so nothing disappears until an admin
-- edits a list. New projects start with NO RMs (the admin assigns them).
-- Idempotent.

create table if not exists public.project_regional_users (
  project_id  uuid not null references public.projects(id) on delete cascade,
  rm_user_id  uuid not null references public.user_profiles(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, rm_user_id)
);
create index if not exists project_regional_users_rm_idx      on public.project_regional_users (rm_user_id);
create index if not exists project_regional_users_company_idx on public.project_regional_users (company_id);

alter table public.project_regional_users enable row level security;

drop policy if exists "project_regional_users read" on public.project_regional_users;
create policy "project_regional_users read" on public.project_regional_users for select
  using (
    rm_user_id = auth.uid()
    or (company_id = public.app_company_id() and public.app_is_company_wide())
  );

-- Backfill: grant every existing RM access to every existing project in their company.
insert into public.project_regional_users (project_id, rm_user_id, company_id)
select p.id, u.id, p.company_id
from public.projects p
join public.user_profiles u on u.company_id = p.company_id and u.role = 'regional_manager'
on conflict (project_id, rm_user_id) do nothing;
