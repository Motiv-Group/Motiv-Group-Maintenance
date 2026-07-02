-- Timestamps for the snag-fix schedule lifecycle, so the RM's approve / decline show
-- on the audit trail at the right moment. Idempotent.
alter table public.snags add column if not exists schedule_agreed_at   timestamptz;
alter table public.snags add column if not exists schedule_declined_at timestamptz;
