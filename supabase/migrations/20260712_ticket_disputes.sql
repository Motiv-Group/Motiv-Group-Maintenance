-- Ticket disputes — a supplier can dispute a snag or a "more evidence" request.
-- While a dispute is OPEN the snag/evidence step is paused (the supplier can't
-- accept & schedule / upload more evidence). Supplier and RM exchange messages +
-- evidence in a free-flowing, numbered thread until the RM resolves it as
-- 'upheld' (the requirement stands) or 'withdrawn' (snag/evidence dropped → the
-- ticket moves to close-out). Resolved disputes are kept in the ticket Archive.
-- Idempotent — safe to re-run in the Supabase SQL editor.

create table if not exists public.ticket_disputes (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  origin          text not null,                       -- 'snag' | 'evidence_requested'
  status          text not null default 'open',        -- 'open' | 'resolved'
  outcome         text,                                -- 'upheld' | 'withdrawn' (set on resolve)
  raised_by       uuid references public.profiles(id) on delete set null,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists td_ticket_idx on public.ticket_disputes (ticket_id);

create table if not exists public.ticket_dispute_messages (
  id            uuid primary key default uuid_generate_v4(),
  dispute_id    uuid not null references public.ticket_disputes(id) on delete cascade,
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  author_role   text not null,                          -- 'supplier' | 'regional_manager'
  body          text,
  evidence_urls jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists tdm_dispute_idx on public.ticket_dispute_messages (dispute_id);
create index if not exists tdm_ticket_idx  on public.ticket_dispute_messages (ticket_id);

alter table public.ticket_disputes         enable row level security;
alter table public.ticket_dispute_messages enable row level security;

-- Reads mirror ticket_evidence: executives/suppliers, plus the store manager who
-- logged the ticket and the RM of the ticket's region. All writes go through the
-- service-role dispute API, so no write policies are needed here.
drop policy if exists "Ticket-scoped read disputes" on public.ticket_disputes;
create policy "Ticket-scoped read disputes" on public.ticket_disputes for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_disputes.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );

drop policy if exists "Ticket-scoped read dispute messages" on public.ticket_dispute_messages;
create policy "Ticket-scoped read dispute messages" on public.ticket_dispute_messages for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_dispute_messages.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );
