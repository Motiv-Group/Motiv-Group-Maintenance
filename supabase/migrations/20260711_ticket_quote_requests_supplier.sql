-- Quote-request rounds log + per-supplier attribution for re-quotes.
--
-- Self-contained and idempotent: creates public.ticket_quote_requests if the earlier
-- 20260710 migration was never applied, and adds supplier_id if the table already
-- exists without it. supplier_id attributes a re-quote round to the supplier the RM
-- asked, so that supplier's audit trail shows a durable "Revised quote requested"
-- event per round (surviving re-assignment). Initial requests keep supplier_id null.

create table if not exists public.ticket_quote_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  requested_at timestamptz not null default now()
);
-- If the table pre-existed (from 20260710) without supplier_id, add it.
alter table public.ticket_quote_requests add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists ticket_quote_requests_ticket_idx on public.ticket_quote_requests (ticket_id);

alter table public.ticket_quote_requests enable row level security;
drop policy if exists "ticket_quote_requests read" on public.ticket_quote_requests;
create policy "ticket_quote_requests read" on public.ticket_quote_requests for select using (company_id = public.app_company_id());

-- Backfill the latest known request per ticket so existing tickets show at least one
-- "Quote requested" event. Going forward every round is logged as it happens.
insert into public.ticket_quote_requests (company_id, ticket_id, requested_at)
select t.company_id, t.id, t.quote_requested_at
from public.tickets t
where t.quote_requested_at is not null
  and not exists (select 1 from public.ticket_quote_requests r where r.ticket_id = t.id);
