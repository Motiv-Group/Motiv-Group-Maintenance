-- Individual (general-public) realtime fix — audit MEDIUM 1 / tracker B4. Idempotent.
--
-- Problem: Individual users have user_profiles.company_id = NULL and their tickets
-- have company_id = NULL. The browser-side Supabase client (which RealtimeRefresh
-- subscriptions run through) reads under RLS, and the company-scoped read policies
-- fail for them (NULL = NULL is not TRUE, and app_can_see_ticket() also requires a
-- company match). So live updates on /individual never fire — server-rendered pages
-- work only because they use the service-role client.
--
-- Fix: add READ-ONLY, owner-scoped SELECT policies for standalone (company-less)
-- tickets and their quotes/signoffs. Postgres RLS ORs permissive policies together,
-- so these ADD visibility for `created_by = auth.uid() AND company_id IS NULL` rows
-- without widening any company-scoped access and without touching any write path.

-- Definer helper (mirrors app_can_see_ticket): true iff the caller owns t_id AND it
-- is a standalone/company-less ticket. SECURITY DEFINER so the child-table policies
-- don't recurse through tickets RLS.
create or replace function public.app_owns_standalone_ticket(t_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.tickets t
    where t.id = t_id
      and t.created_by = auth.uid()
      and t.company_id is null
  );
$function$;

-- Tickets: owner can read their own standalone ticket (no cross-table ref needed).
drop policy if exists "tickets owner read" on public.tickets;
create policy "tickets owner read" on public.tickets for select
  using ((created_by = auth.uid()) AND (company_id IS NULL));

-- Quotes on an owner's standalone ticket.
drop policy if exists "quotes owner read" on public.quotes;
create policy "quotes owner read" on public.quotes for select
  using (public.app_owns_standalone_ticket(ticket_id));

-- Signoffs on an owner's standalone ticket.
drop policy if exists "signoffs owner read" on public.signoffs;
create policy "signoffs owner read" on public.signoffs for select
  using (public.app_owns_standalone_ticket(ticket_id));
