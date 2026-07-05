-- ============================================================
-- LIVE SCHEMA EXPORT (read-only). Run each block in the Supabase SQL Editor and
-- paste the results back. This is the fallback if you can't run pg_dump (pg_dump
-- is better — see the plan/answer). Nothing here writes data.
-- ============================================================

-- 1. All tables + columns + types + nullability (public schema).
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2. Primary keys + foreign keys (what references what).
select tc.table_name, tc.constraint_type, kcu.column_name,
       ccu.table_name  as ref_table, ccu.column_name as ref_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
left join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'public' and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY')
order by tc.table_name, tc.constraint_type;

-- 3. Which tables have RLS ENABLED (relrowsecurity) vs not.
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

-- 4. EVERY RLS policy (public) — the actual USING / WITH CHECK expressions.
select schemaname, tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. Custom functions (RLS helpers: app_company_id, app_role, etc.) + definitions.
select p.proname as function_name, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by p.proname;

-- 6. Triggers (region_id backfill, job_number, handle_new_user, etc.).
select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 7. STORAGE — buckets (public flag + limits) and their RLS policies.
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

select policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
