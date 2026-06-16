-- ============================================================
-- Motiv Migration — Executive self-signup provisions its tenant company
--
-- Run in Supabase SQL Editor. Idempotent (CREATE OR REPLACE).
--
-- Problem: the v3 new-user trigger (schema_v3.sql) only set user_profiles.company_id
-- from a `company_id` value in the signup metadata. Executive self-signup
-- (app/auth/signup) sends `company_name` (a free-text string), never a
-- `company_id`, and nothing created a companies row — so executives landed with
-- company_id = NULL. requireExecutiveV3() redirects NULL-company users to
-- /auth/login, and middleware bounces them straight back → infinite redirect
-- loop ("loads and loads") right after email verification.
--
-- Fix: when an executive / system_admin signs up without a company_id but with a
-- company_name, create the tenant company here and own it. Invited roles
-- (RM/store/supplier) still arrive with an explicit company_id and are unchanged.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role         text;
  v_company      uuid;
  v_company_name text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role','store_manager');
  if v_role not in ('executive','regional_manager','store_manager','supplier','system_admin') then
    v_role := 'store_manager';
  end if;

  -- Invited users carry an explicit company_id in metadata.
  begin
    v_company := nullif(new.raw_user_meta_data->>'company_id','')::uuid;
  exception when others then
    v_company := null;
  end;

  -- Executive / system_admin self-signup: no company_id, but a company_name.
  -- Provision the tenant company now so the profile gets a valid company_id.
  if v_company is null and v_role in ('executive','system_admin') then
    v_company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name','')), '');
    if v_company_name is not null then
      insert into public.companies (name) values (v_company_name) returning id into v_company;
    end if;
  end if;

  insert into public.user_profiles (id, email, role, full_name, phone, company_id)
  values (
    new.id,
    new.email,
    v_role,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    v_company
  )
  on conflict (id) do update set
    role       = excluded.role,
    full_name  = excluded.full_name,
    phone      = excluded.phone,
    company_id = coalesce(excluded.company_id, public.user_profiles.company_id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
