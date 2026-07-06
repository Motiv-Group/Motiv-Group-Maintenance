-- Fix "Database error saving new user" on Individual signup: the live user_profiles
-- table still carries a role CHECK constraint that predates the 'individual' role,
-- so the signup trigger's insert is rejected. schema.sql already has no such check —
-- drop ANY role CHECK on user_profiles (found by name-agnostic lookup) so every app
-- role (incl. 'individual' and 'system_admin') is accepted. Roles are validated at
-- the app layer + the signup trigger. Idempotent — safe to re-run.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'user_profiles'
      and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.user_profiles drop constraint %I', r.conname);
  end loop;
end $$;

-- Re-assert the signup trigger with 'individual' allowed (in case the live function
-- predates it — e.g. schema.sql was re-applied over migration 20260717).
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text; v_company uuid; v_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role','store_manager');
  if v_role not in ('executive','regional_manager','store_manager','supplier','system_admin','individual') then v_role := 'store_manager'; end if;
  begin v_company := nullif(new.raw_user_meta_data->>'company_id','')::uuid; exception when others then v_company := null; end;
  v_code := nullif(trim(new.raw_user_meta_data->>'requested_region_code'),'');

  insert into public.user_profiles (id, email, role, full_name, phone, company_id, requested_region_code)
  values (
    new.id, new.email, v_role,
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_company,
    case when v_role = 'regional_manager' then upper(v_code) else null end
  )
  on conflict (id) do update set
    role=excluded.role, full_name=excluded.full_name, phone=excluded.phone,
    company_id=coalesce(excluded.company_id, public.user_profiles.company_id),
    requested_region_code=coalesce(excluded.requested_region_code, public.user_profiles.requested_region_code);
  return new;
end $function$;
