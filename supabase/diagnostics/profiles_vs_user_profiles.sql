-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC (READ-ONLY): profiles vs user_profiles
-- Run each block in the Supabase SQL Editor. Nothing here writes data.
-- Goal: determine which of the two profile tables is authoritative in prod, and
-- whether they have drifted, so route consolidation can be planned from facts.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Do both relations exist, and are they TABLE or VIEW?
select table_schema, table_name, table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'user_profiles')
order by table_name;

-- 2. Row counts (only run the lines for relations that exist per query 1).
select 'profiles'      as relation, count(*) from public.profiles
union all
select 'user_profiles' as relation, count(*) from public.user_profiles;

-- 3. Column comparison — what does each hold?
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'user_profiles')
order by table_name, ordinal_position;

-- 4. Is one a view/synonym over the other? (definition of user_profiles if it's a view)
select table_name, view_definition
from information_schema.views
where table_schema = 'public'
  and table_name in ('profiles', 'user_profiles');

-- 5. Drift check — ids present in one but not the other (only if BOTH are tables).
--    Empty results both ways = perfectly in sync.
select 'in profiles, not in user_profiles' as gap, p.id
from public.profiles p
left join public.user_profiles u on u.id = p.id
where u.id is null
limit 50;

select 'in user_profiles, not in profiles' as gap, u.id
from public.user_profiles u
left join public.profiles p on p.id = u.id
where p.id is null
limit 50;

-- 6. Role drift — same id, different role between the two tables (only if both tables).
select p.id, p.role as profiles_role, u.role as user_profiles_role
from public.profiles p
join public.user_profiles u on u.id = p.id
where coalesce(p.role,'') <> coalesce(u.role,'')
limit 50;
