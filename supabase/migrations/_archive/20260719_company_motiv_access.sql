-- ---------------------------------------------------------------------------
-- 20260719_company_motiv_access
-- ---------------------------------------------------------------------------
-- Gates the "MOTIV directory" in a company's supplier-assign flow. By default a
-- company sees only its own suppliers; an RM must REQUEST access to the shared
-- Motiv pool and a system_admin must APPROVE it before Motiv suppliers show.
-- One row per company holds the access state. Writes go via the service-role
-- client (RM request endpoint + admin approve); company members read their own.
-- Idempotent.
create table if not exists public.company_motiv_access (
  company_id   uuid primary key references public.companies(id) on delete cascade,
  status       text not null default 'pending',   -- pending | approved | rejected
  requested_by uuid references public.user_profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by   uuid references public.user_profiles(id) on delete set null,
  decided_at   timestamptz
);

alter table public.company_motiv_access enable row level security;

drop policy if exists "company_motiv_access read" on public.company_motiv_access;
create policy "company_motiv_access read" on public.company_motiv_access for select
  using (company_id = public.app_company_id());
