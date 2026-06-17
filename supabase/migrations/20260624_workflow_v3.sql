-- ============================================================
-- Motiv Migration — full ticket workflow (flowchart-aligned)
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- Expands tickets.status to the canonical lifecycle (see lib/workflow.ts), adds
-- the fields the new steps need, introduces a variations entity, and gives the
-- snag table an "assigned" sub-state (Created → Assigned → Resolved).
-- isActive() in the health engine only treats completed/cancelled/declined as
-- terminal, so every new status counts as active automatically.
-- ============================================================

-- ── Tickets: widen the status check to the canonical set (union with old values) ──
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check check (status in (
  -- canonical lifecycle
  'open','info_requested','assigned','assessment',
  'quote_requested','quoted','quote_revision','accepted',
  'scheduled','in_progress','variation_review',
  'submitted_for_signoff','evidence_requested',
  'snag','snag_assigned','snag_resolved',
  'approved_closeout','completed','cancelled','declined',
  -- legacy values kept so existing rows never violate the constraint
  'acknowledged','awaiting_decision','on_hold'
));

-- ── Tickets: new step fields ──
alter table public.tickets
  add column if not exists scheduled_at        timestamptz,
  add column if not exists assessment_required boolean not null default false,
  add column if not exists assessment_at       timestamptz,
  add column if not exists assessment_notes    text,
  add column if not exists info_request_reason text,
  add column if not exists closed_out_at       timestamptz,
  add column if not exists closed_out_by       uuid references public.user_profiles(id) on delete set null;

-- ── Variations entity (submit → review → approve/reject) ──
create table if not exists public.ticket_variations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  supplier_id   uuid references public.suppliers(id) on delete set null,
  description   text not null,
  amount        numeric(12,2),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by  uuid references public.user_profiles(id) on delete set null,
  reviewed_by   uuid references public.user_profiles(id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists ticket_variations_ticket_idx  on public.ticket_variations (ticket_id);
create index if not exists ticket_variations_company_idx on public.ticket_variations (company_id);

alter table public.ticket_variations enable row level security;
drop policy if exists "ticket_variations read"  on public.ticket_variations;
drop policy if exists "ticket_variations admin" on public.ticket_variations;
create policy "ticket_variations read"  on public.ticket_variations for select using (company_id = public.app_company_id());
create policy "ticket_variations admin" on public.ticket_variations for all
  using (company_id = public.app_company_id()) with check (company_id = public.app_company_id());
grant select, insert, update, delete on public.ticket_variations to authenticated;

-- ── Snags: add the "assigned" sub-state + timestamp ──
alter table public.snags drop constraint if exists snags_status_check;
alter table public.snags add constraint snags_status_check check (status in ('open','assigned','in_progress','resolved','rejected'));
alter table public.snags add column if not exists assigned_at timestamptz;
