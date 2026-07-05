-- Durable log of each COC/POC review "round" — every time the RM sends a completion
-- back (request more evidence) or snags it. Mirrors ticket_quote_requests for quotes.
-- Each COC/POC submission is already a signoffs row; this records the review action
-- against it (kind + reason + round number) so the history survives even if the
-- signoff row is later mutated. Service-role writes; company-scoped read.
create table if not exists public.signoff_rounds (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  signoff_id  uuid references public.signoffs(id) on delete set null,  -- the submission reviewed
  round_no    int  not null,          -- 1-based, per ticket
  kind        text not null,          -- 'evidence' | 'snag'
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists signoff_rounds_ticket_idx on public.signoff_rounds (ticket_id, created_at);

alter table public.signoff_rounds enable row level security;
drop policy if exists "signoff_rounds read" on public.signoff_rounds;
create policy "signoff_rounds read" on public.signoff_rounds for select using (company_id = public.app_company_id());
