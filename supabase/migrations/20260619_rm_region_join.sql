-- ============================================================
-- Motiv Migration — Regional Manager self-signup → region join request
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- Flow: an RM signs up via /auth/signup and enters the REGION CODE their
-- executive gave them. We store it on their profile as `requested_region_code`
-- (company_id stays null = "pending"). The executive then sees the pending RM
-- in the Regions tab (matched against their own regions' codes) and approves,
-- which sets company_id + links the RM to that region.
-- ============================================================

alter table public.user_profiles
  add column if not exists requested_region_code text;

create index if not exists user_profiles_pending_rm_idx
  on public.user_profiles (requested_region_code)
  where company_id is null and role = 'regional_manager';

-- new-user trigger → also carry the requested region code from signup metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_company uuid; v_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role','store_manager');
  if v_role not in ('executive','regional_manager','store_manager','supplier','system_admin') then v_role := 'store_manager'; end if;
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
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
