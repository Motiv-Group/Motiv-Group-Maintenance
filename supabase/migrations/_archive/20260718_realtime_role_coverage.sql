-- ---------------------------------------------------------------------------
-- 20260718_realtime_role_coverage
-- ---------------------------------------------------------------------------
-- Live updates for every role. Two role layouts subscribe RealtimeRefresh to a
-- table that is NOT in the supabase_realtime publication, and a postgres_changes
-- channel that binds a non-published table is rejected wholesale (CHANNEL_ERROR
-- "transport failure") — killing realtime for that whole role:
--   * supplier layout → ratings   (not published)
--   * admin layout    → suppliers (not published)
--
-- Fixes:
--   1. Publish ratings + suppliers (replica identity full so RLS can be
--      evaluated on UPDATE/DELETE events).
--   2. ratings is deny-all under RLS, so even once published no events would
--      reach the supplier socket. Add a narrow select policy: a supplier user
--      may read ratings for their OWN supplier org(s) only (app_supplier_ids()
--      — cross-supplier isolation preserved). This is the same information the
--      supplier reviews page already shows them via the service-role client.
--      suppliers already has a scoped read policy (system_admin/RM/executive
--      company-wide + own org), so no policy change is needed there.
--
-- Idempotent — safe to re-run.

alter table public.ratings   replica identity full;
alter table public.suppliers replica identity full;

do $$
declare t text;
begin
  foreach t in array array['ratings', 'suppliers']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Supplier users can read their own org's ratings (delivers realtime rating
-- events to the supplier dashboard; scoped to app_supplier_ids(), never the
-- whole company).
drop policy if exists "ratings supplier read" on public.ratings;
create policy "ratings supplier read" on public.ratings for select
  using (supplier_id in (select app_supplier_ids() as app_supplier_ids));
