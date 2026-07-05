-- ============================================================
-- Region-scope the approvals write policy (RLS defense-in-depth). Run in Supabase.
--
-- Before: an RM could INSERT/UPDATE/DELETE any approval in their COMPANY, including
-- for tickets in regions they don't manage. After: an RM can only write approvals
-- for tickets in a region they're linked to (regional_users). Company-wide roles
-- (executive/system_admin) are unaffected.
-- ============================================================

drop policy if exists "approvals write" on public.approvals;
create policy "approvals write" on public.approvals for all
  using (
    company_id = public.app_company_id() and (
      public.app_is_company_wide() or (
        public.app_role() = 'regional_manager' and exists (
          select 1 from public.tickets t
          where t.id = approvals.ticket_id
            and t.region_id in (select public.app_region_ids())
        )
      )
    )
  )
  with check (company_id = public.app_company_id());
