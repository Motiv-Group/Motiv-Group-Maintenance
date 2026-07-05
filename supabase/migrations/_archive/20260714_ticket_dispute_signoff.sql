-- Link each dispute to the COC/POC submission it concerns (the signoff that was
-- snagged / had more evidence requested), so the Dispute block can show WHICH
-- "Submission #N" the dispute is about. Idempotent.
alter table public.ticket_disputes add column if not exists signoff_id uuid references public.signoffs(id) on delete set null;
