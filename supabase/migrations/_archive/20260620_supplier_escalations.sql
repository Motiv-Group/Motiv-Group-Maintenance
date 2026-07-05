-- ============================================================
-- Motiv Migration — Supplier escalations log
--
-- Run in Supabase SQL Editor. Idempotent. Backs the "Recent Supplier
-- Escalations" list on the Suppliers tab and the Supplier detail panel with a
-- real record (who escalated, when, status, action required) instead of only
-- deriving from live ticket SLA state.
-- ============================================================

create table if not exists public.supplier_escalations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  region_id       uuid references public.regions(id) on delete set null,
  issue           text not null,
  action_required text,
  status          text not null default 'open' check (status in ('open','in_progress','resolved')),
  escalated_by    text,
  escalated_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists supplier_escalations_company_idx  on public.supplier_escalations (company_id, escalated_at desc);
create index if not exists supplier_escalations_supplier_idx on public.supplier_escalations (supplier_id);

alter table public.supplier_escalations enable row level security;

drop policy if exists "supplier_escalations read"  on public.supplier_escalations;
drop policy if exists "supplier_escalations admin" on public.supplier_escalations;
create policy "supplier_escalations read"  on public.supplier_escalations for select using (company_id = public.app_company_id());
create policy "supplier_escalations admin" on public.supplier_escalations for all
  using (company_id = public.app_company_id()) with check (company_id = public.app_company_id());

grant select, insert, update, delete on public.supplier_escalations to authenticated;
grant select on public.supplier_escalations to anon;
