-- ============================================================
-- Motiv Migration — Fix supplier "no tickets" + enable executive signup
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- 1) Dashboards-v2 added assigned_user_id + blocker_owner_id, both FKs to
--    profiles. tickets now had 3 FKs to profiles, making PostgREST embeds
--    (`select('*, profiles(...)')`) AMBIGUOUS — every such query errored and
--    returned no rows (supplier dashboard + /supplier/tickets showed nothing).
--    Drop the extra tickets→profiles FKs (keep the columns); only client_id
--    remains, so embeds resolve again.
--
-- 2) Allow `executive` self-signup: the signup trigger previously forced any
--    role other than store_manager/regional_manager back to store_manager.
-- ============================================================

-- 1. Drop every tickets→profiles FK except the one on client_id ----------
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel  on rel.oid  = con.conrelid
    join pg_class frel on frel.oid = con.confrelid
    where rel.relname = 'tickets'
      and frel.relname = 'profiles'
      and con.contype = 'f'
      and 'client_id' <> all (
        select a.attname from pg_attribute a
        where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      )
  loop
    execute format('alter table public.tickets drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. Allow executive role on self-signup --------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role        text;
  v_branch_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'store_manager');
  if v_role not in ('store_manager', 'regional_manager', 'executive') then
    v_role := 'store_manager';
  end if;

  v_branch_code := upper(trim(coalesce(new.raw_user_meta_data->>'branch_code', '')));
  if v_branch_code = '' then v_branch_code := null; end if;

  insert into public.profiles (id, email, role, full_name, phone, address, company_name, sub_store, branch_code)
  values (
    new.id,
    new.email,
    v_role,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'sub_store',
    v_branch_code
  )
  on conflict (id) do update set
    role         = excluded.role,
    full_name    = excluded.full_name,
    phone        = excluded.phone,
    address      = excluded.address,
    company_name = excluded.company_name,
    sub_store    = excluded.sub_store,
    branch_code  = coalesce(excluded.branch_code, public.profiles.branch_code);
  return new;
end;
$$;
