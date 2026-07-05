-- Durable audit-trail history that must survive later state mutations.
--
-- 1) ticket_supplier_declines — an append-only record of every time a supplier
--    declined a quote REQUEST themselves. The invite row (ticket_suppliers) is
--    reset to 'invited' when the RM re-assigns the same supplier, which erased the
--    decline; recording it here keeps "Quote request declined by {supplier}" in the
--    trail forever. (RM-declined quotes already persist as declined `quotes` rows.)
--
-- 2) tickets.first_quote_requested_at — set once, so the FIRST "Quote requested"
--    event stays in the trail even though quote_requested_at is overwritten on each
--    re-assignment.
--
-- Idempotent: safe to re-run.

create table if not exists public.ticket_supplier_declines (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  reason       text,
  declined_at  timestamptz not null default now()
);
create index if not exists ticket_supplier_declines_ticket_idx on public.ticket_supplier_declines (ticket_id);

alter table public.ticket_supplier_declines enable row level security;
drop policy if exists "ticket_supplier_declines read" on public.ticket_supplier_declines;
create policy "ticket_supplier_declines read" on public.ticket_supplier_declines for select using (company_id = public.app_company_id());

-- Backfill current supplier self-declines that haven't been re-assigned yet, so
-- existing tickets keep their history. One row per (ticket, supplier); re-runnable.
insert into public.ticket_supplier_declines (company_id, ticket_id, supplier_id, reason, declined_at)
select ts.company_id, ts.ticket_id, ts.supplier_id, ts.decline_reason, coalesce(ts.responded_at, ts.invited_at, now())
from public.ticket_suppliers ts
where ts.declined_by = 'supplier'
  and not exists (
    select 1 from public.ticket_supplier_declines d
    where d.ticket_id = ts.ticket_id and d.supplier_id = ts.supplier_id
  );

alter table public.tickets add column if not exists first_quote_requested_at timestamptz;
update public.tickets set first_quote_requested_at = quote_requested_at
  where first_quote_requested_at is null and quote_requested_at is not null;
