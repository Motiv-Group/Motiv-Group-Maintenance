-- Phase 2 of Individual accounts: let an individual's standalone ticket flow through
-- the full lifecycle (assign supplier, quote, sign-off, variation, snag) on the same
-- child tables. Those tables require company_id NOT NULL, but an individual ticket has
-- no company — relax the constraint so their child rows can carry a null company_id.
-- (FKs to companies already allow null.) Idempotent — safe to re-run.

alter table public.quotes            alter column company_id drop not null;
alter table public.signoffs          alter column company_id drop not null;
alter table public.snags             alter column company_id drop not null;
alter table public.ticket_disputes   alter column company_id drop not null;
alter table public.ticket_suppliers  alter column company_id drop not null;
alter table public.ticket_variations alter column company_id drop not null;
