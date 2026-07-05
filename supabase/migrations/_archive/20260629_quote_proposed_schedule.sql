-- Supplier can propose a job start date/time when submitting a quote. On approval
-- the ticket is scheduled to this date (skipping the separate "schedule" step).
-- Idempotent: safe to re-run.
alter table public.quotes add column if not exists proposed_schedule_at timestamptz;
