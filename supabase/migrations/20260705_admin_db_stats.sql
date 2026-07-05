-- admin_db_stats() — one-call snapshot of database + storage size and per-table
-- row/size estimates, for the platform-admin infra dashboard (/admin/supabase).
--
-- Called via the service-role client only (see lib/admin/supabase-stats.ts). It
-- reads pg_stat_user_tables (live row estimates, cheap), pg_database_size,
-- storage.objects and auth.users. SECURITY DEFINER so it can read the storage +
-- auth schemas regardless of the caller; EXECUTE is granted to service_role only
-- (never anon/authenticated) so no tenant user can reach it.
--
-- Idempotent: safe to paste into the Supabase SQL Editor repeatedly.

create or replace function public.admin_db_stats()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'table', relname,
                 'rows',  n_live_tup,
                 'bytes', pg_total_relation_size(relid)
               )
               order by n_live_tup desc
             )
      from pg_stat_user_tables
      where schemaname = 'public'
    ), '[]'::jsonb),
    'storage_bytes',   coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'storage_objects', (select count(*) from storage.objects),
    'auth_users',      (select count(*) from auth.users)
  );
$$;

-- Lock it down: only the service role may execute it.
revoke all on function public.admin_db_stats() from public;
revoke all on function public.admin_db_stats() from anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;
