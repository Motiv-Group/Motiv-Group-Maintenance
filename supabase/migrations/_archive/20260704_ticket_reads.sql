-- Per-user "last seen this ticket" watermark. Lets a ticket page tell which supplier
-- updates are NEW since that user last OPENED the ticket. Drives the RM "Updates from
-- the supplier" block: new updates surface just below the ticket detail; once the RM
-- has opened the ticket (seen them), the block moves down to a collapsible history
-- above the audit trail. One row per (user, ticket); last_seen_at is bumped on each
-- open (service-role writes, mirroring ticket_views). Idempotent.
create table if not exists public.ticket_reads (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  user_id      uuid not null references public.user_profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create unique index if not exists ticket_reads_uniq on public.ticket_reads (user_id, ticket_id);
create index if not exists ticket_reads_ticket_idx on public.ticket_reads (ticket_id);

alter table public.ticket_reads enable row level security;
drop policy if exists "ticket_reads read" on public.ticket_reads;
create policy "ticket_reads read" on public.ticket_reads for select using (company_id = public.app_company_id());
