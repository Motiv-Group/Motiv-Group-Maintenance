-- Individual (general public) accounts: standalone maintenance tickets owned
-- directly by a person, with NO company / store / region hierarchy above them.
-- They reuse the existing tickets / quotes / signoffs / supplier-invite tables —
-- only the company_id + store_id NOT NULL constraints on tickets have to relax so
-- an individual's ticket can stand alone (ownership is via created_by). Individuals
-- assign from the Motiv-curated supplier pool. Idempotent — safe to re-run.

alter table public.tickets alter column company_id drop not null;
alter table public.tickets alter column store_id   drop not null;

-- Individual dashboards / lists scope tickets by their owner (created_by).
create index if not exists tickets_created_by_idx on public.tickets (created_by);

-- Allow the 'individual' role through the signup trigger (it otherwise downgrades
-- any unknown role to 'store_manager'). Individuals self-register with no company.
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
