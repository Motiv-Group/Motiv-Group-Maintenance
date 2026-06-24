-- ============================================================
-- Motiv — Per-store Job ID (store-traceable ticket reference)
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- Targets the v3 schema (tickets.store_id + tickets.branch_code).
-- ============================================================
-- Every ticket gets a stable reference that is UNIQUE PER STORE and traceable
-- to that store, shown in the UI as e.g. WBP-2026-0007 (branch code + year +
-- per-store sequence). Numbering does NOT continue across stores: each store has
-- its own counter, and the counter resets per calendar year. The formatted
-- string is denormalised into tickets.job_ref so every "select *" reads it
-- without recomputation; store_job_number/store_job_year keep the raw parts.

-- 1. Columns ---------------------------------------------------------------
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS store_job_number integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS store_job_year   integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS job_ref          text;

-- 2. Per-(store, year) counter table --------------------------------------
CREATE TABLE IF NOT EXISTS public.store_ticket_counters (
  store_id    uuid    NOT NULL,
  year        integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, year)
);

-- 3. Assignment trigger (atomic via the counter upsert) -------------------
CREATE OR REPLACE FUNCTION public.assign_store_job_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_year   integer := EXTRACT(year FROM COALESCE(NEW.created_at, now()))::integer;
  v_prefix text    := COALESCE(NULLIF(NEW.branch_code, ''), 'JOB');
  v_seq    integer;
BEGIN
  -- Respect a number that was already supplied (e.g. backfill / data import).
  IF NEW.store_job_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Without a store we cannot scope the counter — leave the ref unset.
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.store_ticket_counters (store_id, year, last_number)
    VALUES (NEW.store_id, v_year, 1)
    ON CONFLICT (store_id, year)
    DO UPDATE SET last_number = public.store_ticket_counters.last_number + 1
    RETURNING last_number INTO v_seq;

  NEW.store_job_number := v_seq;
  NEW.store_job_year   := v_year;
  NEW.job_ref          := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_store_job_ref ON public.tickets;
CREATE TRIGGER trg_assign_store_job_ref
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.assign_store_job_ref();

-- 4. Backfill existing tickets, per store, in creation order --------------
WITH ordered AS (
  SELECT
    id,
    store_id,
    EXTRACT(year FROM created_at)::integer AS yr,
    COALESCE(NULLIF(branch_code, ''), 'JOB') AS prefix,
    row_number() OVER (
      PARTITION BY store_id, EXTRACT(year FROM created_at)
      ORDER BY created_at, id
    ) AS rn
  FROM public.tickets
  WHERE store_job_number IS NULL AND store_id IS NOT NULL
)
UPDATE public.tickets t
SET store_job_number = o.rn,
    store_job_year   = o.yr,
    job_ref          = o.prefix || '-' || o.yr::text || '-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE t.id = o.id;

-- 5. Seed the counter table from the backfilled max per (store, year) ------
INSERT INTO public.store_ticket_counters (store_id, year, last_number)
SELECT store_id, store_job_year, MAX(store_job_number)
FROM public.tickets
WHERE store_job_number IS NOT NULL AND store_id IS NOT NULL
GROUP BY store_id, store_job_year
ON CONFLICT (store_id, year)
DO UPDATE SET last_number = GREATEST(public.store_ticket_counters.last_number, EXCLUDED.last_number);
