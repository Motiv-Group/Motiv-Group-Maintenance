-- ============================================================
-- Motiv — Ticket Job ID (sequential reference)
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================
-- Every ticket gets a stable, human-quotable sequential number, shown in the UI
-- as JOB-00042. Existing rows are backfilled in creation order; new rows get the
-- next value automatically.

-- 1. Sequence
CREATE SEQUENCE IF NOT EXISTS public.tickets_job_number_seq;

-- 2. Column
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS job_number bigint;

-- 3. Backfill existing tickets in creation order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.tickets
  WHERE job_number IS NULL
)
UPDATE public.tickets t
SET job_number = o.rn
FROM ordered o
WHERE t.id = o.id;

-- 4. Advance the sequence past the highest existing number
SELECT setval(
  'public.tickets_job_number_seq',
  GREATEST((SELECT COALESCE(MAX(job_number), 0) FROM public.tickets), 1),
  (SELECT COUNT(*) > 0 FROM public.tickets)
);

-- 5. Default for new rows + ownership
ALTER TABLE public.tickets ALTER COLUMN job_number SET DEFAULT nextval('public.tickets_job_number_seq');
ALTER SEQUENCE public.tickets_job_number_seq OWNED BY public.tickets.job_number;
