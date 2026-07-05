-- ============================================================
-- Fix infinite recursion in profiles RLS policies
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create a helper function that reads the current user's role
--    WITHOUT triggering RLS (security definer bypasses it)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 2. Drop the old recursive policies
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can view all tickets"  on public.tickets;
drop policy if exists "Admins can update all tickets" on public.tickets;
drop policy if exists "Admins can view all quotes"   on public.quotes;
drop policy if exists "Admins can insert quotes"     on public.quotes;
drop policy if exists "Admins can update quotes"     on public.quotes;

-- 3. Re-create using the safe helper function
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.get_my_role() = 'admin');

create policy "Admins can view all tickets"
  on public.tickets for select
  using (public.get_my_role() = 'admin');

create policy "Admins can update all tickets"
  on public.tickets for update
  using (public.get_my_role() = 'admin');

create policy "Admins can view all quotes"
  on public.quotes for select
  using (public.get_my_role() = 'admin');

create policy "Admins can insert quotes"
  on public.quotes for insert
  with check (public.get_my_role() = 'admin');

create policy "Admins can update quotes"
  on public.quotes for update
  using (public.get_my_role() = 'admin');
