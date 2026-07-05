-- Why the RM asked for more evidence on a submitted COC/POC, shown back to the
-- supplier (and on the RM ticket) the same way info-request reasons are.
alter table if exists public.tickets
  add column if not exists evidence_request_reason text;
