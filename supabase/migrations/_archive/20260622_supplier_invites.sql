-- ============================================================
-- Motiv Migration — custom supplier invite tokens
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- Replaces Supabase's single-use OTP invite for suppliers with a token WE
-- control: the invite link stays valid until the supplier completes onboarding
-- (accepted_at is set), and the redirect no longer depends on Supabase's
-- generateLink / Site-URL behaviour. The auth user is created at onboarding
-- time with the supplier's own password.
-- ============================================================

create table if not exists public.supplier_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  email       text not null,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,            -- null = never expires
  accepted_at timestamptz             -- set once onboarding completes (consumes the token)
);

create index if not exists supplier_invites_token_idx   on public.supplier_invites (token);
create index if not exists supplier_invites_company_idx on public.supplier_invites (company_id);

alter table public.supplier_invites enable row level security;

drop policy if exists "supplier_invites read"  on public.supplier_invites;
drop policy if exists "supplier_invites admin" on public.supplier_invites;
create policy "supplier_invites read"  on public.supplier_invites for select using (company_id = public.app_company_id());
create policy "supplier_invites admin" on public.supplier_invites for all
  using (company_id = public.app_company_id()) with check (company_id = public.app_company_id());

grant select, insert, update, delete on public.supplier_invites to authenticated;
