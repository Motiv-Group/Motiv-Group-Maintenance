-- ============================================================
-- Motiv Migration — Restore table/function GRANTs for anon + authenticated
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- Problem: schema_v3.sql created every table with RLS ENABLED + policies, but
-- never GRANTed table privileges to the anon / authenticated roles, and this
-- project did not inherit Supabase's default schema grants. RLS only filters
-- rows AFTER a role has table-level privilege — so with no GRANT, every
-- user-context query failed with:
--     ERROR: 42501: permission denied for table user_profiles
-- Middleware getRole() / requireExecutiveV3() therefore read NULL, and a
-- logged-in user bounced /auth/login <-> /client forever (ERR_TOO_MANY_REDIRECTS).
-- The SQL Editor (service_role) was unaffected, which masked it.
--
-- Fix: apply the standard Supabase baseline grants. RLS remains the row-level
-- gate (every public table has RLS enabled in schema_v3.sql §10), so granting
-- table privileges here is safe — rows are still restricted by policy.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

-- Tables: authenticated gets full DML (RLS-gated); anon gets read (RLS-gated).
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

-- Sequences (for default ids / serials used by inserts).
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Functions: needed so RLS policy quals that call app_company_id(),
-- app_is_company_wide(), app_can_see_ticket(), etc. can execute under the
-- calling role.
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Future objects created by the migration/owner role inherit the same grants,
-- so the next table/function doesn't reintroduce the loop.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
