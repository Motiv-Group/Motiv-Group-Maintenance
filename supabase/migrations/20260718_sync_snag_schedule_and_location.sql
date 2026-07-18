-- 2026-07-18 — C9 drift-repair migration. The new live-drift check
-- (npm run drift:check) found a PROD⇄DEV split-brain:
--   • snags.schedule_agreed_at / schedule_declined_at exist on DEV (and in
--     schema.sql) but were never applied to PROD.
--   • tickets.location exists on PROD but was never applied to DEV (and has
--     now been folded into schema.sql).
-- Idempotent — safe to paste into the SQL editor of BOTH projects; each picks
-- up only what it's missing. After applying to both, run `npm run drift:check`
-- against each to confirm zero drift, then move this file to
-- supabase/migrations/_archive/ per standing instruction #4.

alter table public.snags
  add column if not exists schedule_agreed_at   timestamptz,
  add column if not exists schedule_declined_at timestamptz;

-- Optional in-store/site location picked when logging (e.g. "Sales floor").
alter table public.tickets
  add column if not exists location text;
