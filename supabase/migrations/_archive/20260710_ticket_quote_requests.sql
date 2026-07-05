-- Append-only log of every quote-request round on a ticket, so each (re)assignment
-- adds its own "Quote requested" event to the audit trail. tickets.quote_requested_at
-- only holds the latest request and first_quote_requested_at only the first, so
-- neither can show every round — this log does.
--
-- Written on: RM assigns/re-assigns suppliers, the request_quote transition, and an
-- RM "ask to re-quote". Idempotent: safe to re-run.

create table if not exists public.ticket_quote_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index if not exists ticket_quote_requests_ticket_idx on public.ticket_quote_requests (ticket_id);

alter table public.ticket_quote_requests enable row level security;
drop policy if exists "ticket_quote_requests read" on public.ticket_quote_requests;
create policy "ticket_quote_requests read" on public.ticket_quote_requests for select using (company_id = public.app_company_id());

-- Backfill the first (and, if different, the latest) known request for existing
-- tickets, so they keep at least those rounds. Middle rounds were never stored.
insert into public.ticket_quote_requests (company_id, ticket_id, requested_at)
select t.company_id, t.id, t.first_quote_requested_at
from public.tickets t
where t.first_quote_requested_at is not null
  and not exists (select 1 from public.ticket_quote_requests r where r.ticket_id = t.id and r.requested_at = t.first_quote_requested_at);

insert into public.ticket_quote_requests (company_id, ticket_id, requested_at)
select t.company_id, t.id, t.quote_requested_at
from public.tickets t
where t.quote_requested_at is not null
  and t.quote_requested_at is distinct from t.first_quote_requested_at
  and not exists (select 1 from public.ticket_quote_requests r where r.ticket_id = t.id and r.requested_at = t.quote_requested_at);
