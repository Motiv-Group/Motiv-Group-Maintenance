-- ---------------------------------------------------------------------------
-- 20260721_ticket_edits_dispute_supplier
-- ---------------------------------------------------------------------------
-- Two additions for the timeline + quote-decline dispute work:
--
-- 1) ticket_edits — durable per-edit log. tickets.edited_at/edit_note are a
--    SINGLE slot (each PATCH overwrites the previous edit), so the timeline
--    could only ever show the latest edit. Every successful ticket PATCH now
--    also appends a row here; the timeline shows them all ("edited the ticket",
--    "added extra work"). Deny-all RLS — written/read via the API routes only.
--
-- 2) ticket_disputes.supplier_id — binds a dispute to the supplier org that
--    raised it. Needed for the new 'quote_declined' origin: an RM decline nulls
--    tickets.supplier_id, so the raising org can no longer be derived from the
--    ticket (and several declined suppliers must not see each other's disputes).
--    Backfilled from tickets.supplier_id for existing rows.
--
-- Idempotent.

create table if not exists public.ticket_edits (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  editor_id   uuid references public.user_profiles(id) on delete set null,
  editor_role text,
  note        text,           -- e.g. 'added extra work'; null = plain edit
  created_at  timestamptz not null default now()
);
create index if not exists ticket_edits_ticket_idx on public.ticket_edits (ticket_id, created_at);
alter table public.ticket_edits enable row level security;
-- No policies on purpose: deny-all — all access via the API routes.

alter table public.ticket_disputes add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
update public.ticket_disputes d
  set supplier_id = t.supplier_id
  from public.tickets t
  where d.ticket_id = t.id and d.supplier_id is null and t.supplier_id is not null;
