-- ============================================================================
-- FK + CHECK hardening — audit findings SEC-019, SEC-020, SEC-021, SEC-022.
--
-- tickets / ratings / technicians are EMPTY (0 rows, verified against live on
-- 2026-07-16), so these foreign keys add with zero orphan risk. All FK columns
-- are nullable → ON DELETE SET NULL (preserve history, never cascade-delete work).
--
-- NOTE (verified via pg_indexes on live 2026-07-16): the tickets/quotes/
-- notifications/snags/signoffs hot-path indexes AND ticket_suppliers'
-- unique(ticket_id,supplier_id) ALREADY EXIST in the live DB — they were just
-- absent from schema.sql (per its CHECK/index disclaimer). So SEC-023 (missing
-- indexes) and SEC-035 (missing unique) needed no migration; only the new FK
-- columns below get supporting indexes.
--
-- IDEMPOTENT — safe to re-run. APPLY: dev first, then prod, via the SQL Editor.
-- ============================================================================

-- ── tickets: technician_id / asset_id / assigned_user_id (SEC-019) ──────────
alter table public.tickets drop constraint if exists tickets_technician_id_fkey;
alter table public.tickets add  constraint tickets_technician_id_fkey
  foreign key (technician_id) references public.technicians(id) on delete set null;
alter table public.tickets drop constraint if exists tickets_asset_id_fkey;
alter table public.tickets add  constraint tickets_asset_id_fkey
  foreign key (asset_id) references public.assets(id) on delete set null;
alter table public.tickets drop constraint if exists tickets_assigned_user_id_fkey;
alter table public.tickets add  constraint tickets_assigned_user_id_fkey
  foreign key (assigned_user_id) references public.user_profiles(id) on delete set null;
create index if not exists tickets_technician_idx     on public.tickets (technician_id);
create index if not exists tickets_asset_idx          on public.tickets (asset_id);
create index if not exists tickets_assigned_user_idx  on public.tickets (assigned_user_id);

-- ── ratings: company_id / supplier_id / rated_by (SEC-020) ──────────────────
-- (ticket_id already has a FK; contractor_id's referent is undecided → deferred,
--  see decision "D-ratings" in the tracker.)
alter table public.ratings drop constraint if exists ratings_company_id_fkey;
alter table public.ratings add  constraint ratings_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;
alter table public.ratings drop constraint if exists ratings_supplier_id_fkey;
alter table public.ratings add  constraint ratings_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id) on delete set null;
alter table public.ratings drop constraint if exists ratings_rated_by_fkey;
alter table public.ratings add  constraint ratings_rated_by_fkey
  foreign key (rated_by) references public.user_profiles(id) on delete set null;
create index if not exists ratings_supplier_idx on public.ratings (supplier_id);
create index if not exists ratings_company_idx  on public.ratings (company_id);

-- ── technicians: supplier_id / company_id (SEC-021) ─────────────────────────
alter table public.technicians drop constraint if exists technicians_supplier_id_fkey;
alter table public.technicians add  constraint technicians_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id) on delete set null;
alter table public.technicians drop constraint if exists technicians_company_id_fkey;
alter table public.technicians add  constraint technicians_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;
create index if not exists technicians_supplier_idx on public.technicians (supplier_id);
create index if not exists technicians_company_idx  on public.technicians (company_id);

-- ── Safe CHECK constraints (SEC-022) — bounded, well-defined value sets only ─
-- (Broad status/priority columns are intentionally NOT constrained here: their
--  live value sets are wide and drift; those belong on lookup-table FKs later.)
alter table public.ratings drop constraint if exists ratings_score_chk;
alter table public.ratings add  constraint ratings_score_chk check (score between 1 and 5);
alter table public.ticket_chat_messages drop constraint if exists ticket_chat_messages_author_role_chk;
alter table public.ticket_chat_messages add  constraint ticket_chat_messages_author_role_chk
  check (author_role in ('regional_manager', 'supplier'));
