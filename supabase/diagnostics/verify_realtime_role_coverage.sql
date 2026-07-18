-- ---------------------------------------------------------------------------
-- verify_realtime_role_coverage.sql
-- ---------------------------------------------------------------------------
-- Run in the Supabase SQL Editor on the PROD project (then DEV) to confirm the
-- 20260718_realtime_role_coverage migration is live. Read-only. Every row of the
-- final result set must show status = 'OK'. Any 'MISSING'/'WRONG' = realtime is
-- still broken for that role.

with checks as (
  -- 1. Publication membership: the supplier layout binds `ratings`, the admin
  --    layout binds `suppliers`. An unpublished bound table errors the WHOLE
  --    postgres_changes channel (CHANNEL_ERROR) → no realtime for that role.
  select 'publication: ratings'  as check_name,
         case when exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='ratings')
           then 'OK' else 'MISSING' end as status
  union all
  select 'publication: suppliers',
         case when exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='suppliers')
           then 'OK' else 'MISSING' end
  -- 2. REPLICA IDENTITY FULL (relreplident='f') so RLS can be evaluated on
  --    UPDATE/DELETE events (default identity carries only the PK → RLS drops it).
  union all
  select 'replica identity full: ratings',
         case when (select relreplident from pg_class where oid='public.ratings'::regclass)='f'
           then 'OK' else 'WRONG' end
  union all
  select 'replica identity full: suppliers',
         case when (select relreplident from pg_class where oid='public.suppliers'::regclass)='f'
           then 'OK' else 'WRONG' end
  -- 3. Supplier-scoped read policy exists (delivers rating events to the supplier
  --    socket; without it ratings is deny-all → published but no rows delivered).
  union all
  select 'policy: ratings supplier read',
         case when exists (select 1 from pg_policies
           where schemaname='public' and tablename='ratings' and policyname='ratings supplier read')
           then 'OK' else 'MISSING' end
  -- 4. Policy is correctly scoped to the caller's OWN supplier orgs (cross-supplier
  --    isolation). The qual must reference app_supplier_ids(), NOT company-wide.
  union all
  select 'policy scoped to app_supplier_ids()',
         case when exists (select 1 from pg_policies
           where schemaname='public' and tablename='ratings' and policyname='ratings supplier read'
             and qual ilike '%app_supplier_ids%')
           then 'OK' else 'WRONG' end
  -- 5. Sanity: the tables the broadened SM/exec/supplier subscriptions now bind
  --    (signoffs, snags, ticket_updates) must also be published (they were,
  --    pre-existing) — a regression here would break those roles too.
  union all
  select 'publication: signoffs',
         case when exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='signoffs')
           then 'OK' else 'MISSING' end
  union all
  select 'publication: snags',
         case when exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='snags')
           then 'OK' else 'MISSING' end
  union all
  select 'publication: ticket_updates',
         case when exists (select 1 from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='ticket_updates')
           then 'OK' else 'MISSING' end
)
select check_name, status from checks order by (status='OK'), check_name;
