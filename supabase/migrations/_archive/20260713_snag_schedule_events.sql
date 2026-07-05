-- Durable log of the snag-fix schedule lifecycle so the audit trail keeps EVERY
-- round: the supplier proposes a fix date, the RM approves or declines (with a
-- reason), the supplier re-proposes, and so on until it's approved. The snag row
-- itself only holds the latest state; this table keeps the full history.
-- Service-role writes only (createAdminClient bypasses RLS). Idempotent.
create table if not exists public.snag_schedule_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete cascade,
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  snag_id       uuid references public.snags(id) on delete set null,
  kind          text not null,          -- 'proposed' | 'approved' | 'declined'
  scheduled_for timestamptz,            -- the proposed fix date (for 'proposed')
  reason        text,                   -- decline reason (for 'declined')
  actor_role    text,                   -- 'supplier' | 'regional_manager'
  created_at    timestamptz not null default now()
);
create index if not exists sse_ticket_idx on public.snag_schedule_events (ticket_id, created_at);

alter table public.snag_schedule_events enable row level security;
drop policy if exists "snag_schedule_events read" on public.snag_schedule_events;
create policy "snag_schedule_events read" on public.snag_schedule_events for select using (company_id = public.app_company_id());
