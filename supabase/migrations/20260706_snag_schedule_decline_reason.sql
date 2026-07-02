-- Reason the RM gave when declining a proposed snag-fix date, so it can be shown to
-- the supplier on the ticket (not just in the notification). Idempotent.
alter table public.snags add column if not exists schedule_decline_reason text;
