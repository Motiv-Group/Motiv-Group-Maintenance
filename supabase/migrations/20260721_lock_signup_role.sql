-- SECURITY: close self-service privilege escalation on signup.
--
-- Public sign-up calls supabase.auth.signUp() with the anon key from the browser,
-- and its `data` becomes raw_user_meta_data. The old trigger honoured
-- raw_user_meta_data->>'role', so anyone could sign up with
-- {"role":"system_admin"} (or executive / regional_manager / supplier) and
-- self-provision a privileged account.
--
-- Fix: the signup trigger may only ever produce the 'individual' role from client
-- metadata. Every privileged role is assigned by a TRUSTED server path
-- (admin invite via lib/invite, supplier onboard, create_store_manager) using the
-- service-role client, which upserts user_profiles.role AFTER the user is created —
-- so those flows are unaffected (the trigger seeds 'individual', the trusted upsert
-- immediately sets the real role in the same request). Idempotent.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text; v_company uuid;
begin
  -- Public self-signup can ONLY create an Individual. Anything else in the client
  -- metadata is ignored (privileged roles are set post-creation by a service-role
  -- path). This is the authoritative guard — the UI only offers Individual anyway.
  v_role := coalesce(new.raw_user_meta_data->>'role','individual');
  if v_role <> 'individual' then v_role := 'individual'; end if;

  -- company_id is only meaningful for the trusted paths (which pass it AND re-upsert
  -- the role); for a self-service individual it's simply null.
  begin v_company := nullif(new.raw_user_meta_data->>'company_id','')::uuid; exception when others then v_company := null; end;

  insert into public.user_profiles (id, email, role, full_name, phone, company_id, requested_region_code)
  values (
    new.id, new.email, v_role,
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_company, null
  )
  on conflict (id) do update set
    role=excluded.role, full_name=excluded.full_name, phone=excluded.phone,
    company_id=coalesce(excluded.company_id, public.user_profiles.company_id);
  return new;
end $function$;
