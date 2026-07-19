-- ---------------------------------------------------------------------------
-- 20260719_rm_executive_links
-- ---------------------------------------------------------------------------
-- Direct Regional-Manager -> Executive assignment (M2M). Executives are still
-- company-wide by default; this records which executive(s) oversee a given RM so
-- the Hierarchy linking page can express it. Managed by the system_admin via the
-- service-role client (no browser write policy). Read: the RM or exec sees their
-- own links; company-wide roles see their company's.
-- Idempotent.
create table if not exists public.rm_executive_links (
  rm_user_id        uuid not null references public.user_profiles(id) on delete cascade,
  executive_user_id uuid not null references public.user_profiles(id) on delete cascade,
  company_id        uuid references public.companies(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (rm_user_id, executive_user_id)
);
create index if not exists rm_executive_links_exec_idx on public.rm_executive_links (executive_user_id);
create index if not exists rm_executive_links_company_idx on public.rm_executive_links (company_id);

alter table public.rm_executive_links enable row level security;

drop policy if exists "rm_executive_links read" on public.rm_executive_links;
create policy "rm_executive_links read" on public.rm_executive_links for select
  using (
    rm_user_id = auth.uid()
    or executive_user_id = auth.uid()
    or (company_id = public.app_company_id() and public.app_is_company_wide())
  );
