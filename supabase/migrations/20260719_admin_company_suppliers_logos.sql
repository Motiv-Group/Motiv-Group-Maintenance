-- ---------------------------------------------------------------------------
-- 20260719_admin_company_suppliers_logos
-- ---------------------------------------------------------------------------
-- System-admin Accounts redesign: per-company grouping with logos + a persistent
-- company<->supplier membership.
--
--   1. companies.logo_url — optional uploaded company logo (public `branding`
--      bucket, path company-logos/…). Monogram fallback rendered when null.
--
--   2. company_suppliers — MANY-TO-MANY link: one supplier org can belong to
--      several companies (a supplier invited by company A stays a distinct org;
--      if company B invites the same supplier, a second link row is added — the
--      supplier is NOT duplicated). Populated when:
--        · a system-admin invites a supplier under a company (source 'admin_invite')
--        · an RM invites a supplier to one of that company's tickets (source 'rm_ticket')
--      Self-signup ("Motiv") suppliers have source 'self' on the supplier row and
--      need no company link until a company invites them.
--
-- Cross-supplier isolation is preserved: the link only records membership; a
-- supplier still sees only their own rows everywhere else. RLS below lets a
-- company read its own supplier links and a supplier read its own company links,
-- nothing wider. All WRITES go through the service-role client in API routes
-- (no browser write policy) — route-level authZ is the guard.
--
-- Idempotent — safe to re-run.

-- 1. Company logo -----------------------------------------------------------
alter table public.companies add column if not exists logo_url text;

-- 2. Company <-> supplier membership ---------------------------------------
create table if not exists public.company_suppliers (
  company_id  uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  source      text not null default 'admin_invite',  -- admin_invite | rm_ticket | self
  invited_by  uuid references public.user_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (company_id, supplier_id)
);

-- "which companies does this supplier serve" lookups (company_id is PK-leading).
create index if not exists company_suppliers_supplier_idx on public.company_suppliers (supplier_id);

alter table public.company_suppliers enable row level security;

-- Read: a company sees its own supplier links; a supplier sees its own company
-- links. Nothing cross-company / cross-supplier.
drop policy if exists "company_suppliers read" on public.company_suppliers;
create policy "company_suppliers read" on public.company_suppliers for select
  using (
    company_id = public.app_company_id()
    or supplier_id in (select public.app_supplier_ids() as app_supplier_ids)
  );

-- No browser write policy — links are written only via the service-role client
-- (admin invite route + the RM ticket-invite route).

-- 3. Backfill existing memberships -----------------------------------------
-- (a) Every supplier row that already carries a company_id (created by the
--     exec/RM "invite supplier" flow, one row per company) becomes a link.
insert into public.company_suppliers (company_id, supplier_id, source)
select s.id_company, s.id_supplier, 'admin_invite'
from (select company_id as id_company, id as id_supplier from public.suppliers where company_id is not null) s
on conflict (company_id, supplier_id) do nothing;

-- (b) Every distinct (company_id, supplier_id) an RM has already invited to quote.
insert into public.company_suppliers (company_id, supplier_id, source)
select distinct ts.company_id, ts.supplier_id, 'rm_ticket'
from public.ticket_suppliers ts
where ts.company_id is not null and ts.supplier_id is not null
on conflict (company_id, supplier_id) do nothing;
