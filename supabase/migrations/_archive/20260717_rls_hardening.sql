-- ============================================================================
-- RLS HARDENING — closes the browser-reachable write-policy bypass class.
-- Addresses audit findings SEC-001, SEC-002, SEC-004, SEC-006, SEC-011,
-- SEC-012, SEC-013, SEC-046, SEC-047 (see MOTIV_SECURITY_AND_PRODUCTION_READINESS.md).
--
-- ROOT CAUSE: the `authenticated` Postgres role holds table-wide INSERT/UPDATE/
-- DELETE grants (migration _archive/20260618_grant_table_privileges.sql), so any
-- browser holding a normal user JWT can call Supabase PostgREST directly and write
-- any table for which a permissive RLS write policy exists — bypassing every
-- route-level authZ check and the workflow engine. Verified (grep) that the app
-- writes ALL of these tables exclusively via the service-role admin client (which
-- bypasses RLS), EXCEPT: tickets INSERT (user client, keep "tickets insert"),
-- and notifications UPDATE (user client, keep "notif update"). So dropping the
-- browser write policies below removes pure attack surface with no app impact.
--
-- IDEMPOTENT — safe to re-run.
-- APPLY: dev first, then prod, via the Supabase SQL Editor. After applying, run
-- the owner audit query at the bottom to detect any already-escalated accounts.
-- ============================================================================

-- ── SEC-001: freeze role / company_id on user_profiles ──────────────────────
-- Primary guard: a BEFORE UPDATE trigger that rejects any change to role or
-- company_id unless the caller is a service-role/internal process. SECURITY
-- INVOKER (default) so current_user reflects the ACTUAL caller ('authenticated'
-- for the browser, 'service_role' for the admin client). This defeats the
-- PATCH /rest/v1/user_profiles?id=eq.<self> {"role":"system_admin"} escalation.
create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.company_id is distinct from old.company_id)
     and current_user not in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
  then
    raise exception 'user_profiles.role/company_id may only be changed by a service-role process (attempted by %)', current_user
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_profile_privileged_columns() from public, anon, authenticated;

drop trigger if exists trg_enforce_profile_privileged on public.user_profiles;
create trigger trg_enforce_profile_privileged
  before update on public.user_profiles
  for each row execute function public.enforce_profile_privileged_columns();

-- Secondary guard: keep the self-update policy but pin the row identity in an
-- explicit WITH CHECK (documents intent; the trigger does the column freezing).
drop policy if exists "own profile update" on public.user_profiles;
create policy "own profile update" on public.user_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── SEC-002: tickets — drop the browser UPDATE policy ───────────────────────
-- Every ticket UPDATE in the app uses the service-role admin client; only the
-- INSERT path (app/api/tickets/route.ts) uses the RLS-bound user client, so the
-- "tickets insert" policy is KEPT and only "tickets update" is removed. This
-- stops an assigned supplier from PATCHing status='completed' / quote_value.
drop policy if exists "tickets update" on public.tickets;

-- ── SEC-004 / SEC-006: quotes / signoffs / ticket_variations write bypass ───
-- All written only via the admin client. Drop every browser write policy; the
-- SELECT ("* read" / "* owner read") policies remain, so reads are unaffected.
drop policy if exists "quotes update" on public.quotes;
drop policy if exists "quotes write"  on public.quotes;          -- INSERT (was open to any see-ticket store user)
drop policy if exists "signoffs write" on public.signoffs;        -- FOR ALL
drop policy if exists "ticket_variations admin" on public.ticket_variations; -- FOR ALL

-- ── SEC-011 / SEC-012 / SEC-013: other browser-writable workflow tables ─────
-- approvals / decision_items / snags: FOR ALL write policies whose WITH CHECK
-- dropped the role/region gate → forgeable by any company member. Admin-written
-- only → drop the write policies (reads kept).
drop policy if exists "approvals write"  on public.approvals;
drop policy if exists "decisions write"  on public.decision_items;
drop policy if exists "snags write"      on public.snags;
-- supplier_escalations / ticket_updates / ticket_evidence: admin-written only.
drop policy if exists "supplier_escalations admin" on public.supplier_escalations;
drop policy if exists "ticket_updates write"  on public.ticket_updates;   -- author_id was unbound → impersonation
drop policy if exists "ticket_evidence write" on public.ticket_evidence;

-- supplier_invites: drop the FOR ALL write policy (admin-written) AND tighten
-- the read policy so the secret invite `token` is not exposed to store managers
-- / suppliers company-wide — only admin-type roles may read invites.
drop policy if exists "supplier_invites admin" on public.supplier_invites;
drop policy if exists "supplier_invites read" on public.supplier_invites;
create policy "supplier_invites read" on public.supplier_invites for select
  using (company_id = app_company_id()
         and app_role() = any (array['system_admin','regional_manager','executive']));

-- ── SEC-013 (belt): bind notifications self-update with an explicit WITH CHECK ─
drop policy if exists "notif update" on public.notifications;
create policy "notif update" on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── SEC-046: sla_rules — do not expose global rows to anonymous callers ─────
drop policy if exists "sla read" on public.sla_rules;
create policy "sla read" on public.sla_rules for select
  using (auth.uid() is not null
         and ((company_id is null) or (company_id = app_company_id())));

-- ── SEC-047: revoke EXECUTE on the remaining trigger functions from clients ──
revoke execute on function public.log_ticket_event()            from anon, authenticated;
revoke execute on function public.archive_ticket_notifications() from anon, authenticated;

-- ============================================================================
-- OWNER POST-APPLY AUDIT (run in the SQL Editor, paste result back — redact emails):
--   select id, email, role, company_id
--   from public.user_profiles
--   where role in ('system_admin','executive')
--   order by role;
-- Any account here that should NOT be privileged was escalated via the SEC-001
-- vector before this fix — investigate + demote via a service-role update.
-- ============================================================================
