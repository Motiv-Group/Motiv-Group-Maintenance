-- The snag's corrective-work date is the supplier's proposal that the RM approves,
-- tracked on the snag itself (separate from the original job's tickets.scheduled_at
-- so the audit trail keeps both "Job scheduled" and "Snag job scheduled").
alter table if exists public.snags
  add column if not exists scheduled_at timestamptz,
  add column if not exists schedule_status text;  -- 'proposed' | 'agreed'
