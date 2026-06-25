-- ============================================================
-- Motiv — Combined pending migrations (paste-once)
-- Run this whole file in the Supabase SQL editor (Database → SQL Editor).
-- Every statement is idempotent, so it is safe to run even if some of these
-- migrations were already applied individually.
--
-- Bundles:
--   1. 20260624_store_job_id          — per-store Job IDs (BRANCH-YEAR-####)
--   2. 20260624_daily_briefings       — AI morning-briefing cache
--   3. 20260624_wa_inbound_window     — 24h WhatsApp send guard
--   4. 20260625_competitive_suppliers — competitive multi-supplier quoting
-- ============================================================


-- ============================================================
-- 1) PER-STORE JOB ID  (BRANCH-YEAR-####, e.g. WBP-2026-0007)
-- ============================================================
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS store_job_number integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS store_job_year   integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS job_ref          text;

CREATE TABLE IF NOT EXISTS public.store_ticket_counters (
  store_id    uuid    NOT NULL,
  year        integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, year)
);

CREATE OR REPLACE FUNCTION public.assign_store_job_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_year   integer := EXTRACT(year FROM COALESCE(NEW.created_at, now()))::integer;
  v_prefix text    := COALESCE(NULLIF(NEW.branch_code, ''), 'JOB');
  v_seq    integer;
BEGIN
  IF NEW.store_job_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
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

-- Backfill any tickets that don't yet have a per-store number.
WITH ordered AS (
  SELECT
    id,
    store_id,
    EXTRACT(year FROM created_at)::integer AS yr,
    COALESCE(NULLIF(branch_code, ''), 'JOB') AS prefix,
    row_number() OVER (PARTITION BY store_id, EXTRACT(year FROM created_at) ORDER BY created_at, id) AS rn
  FROM public.tickets
  WHERE store_job_number IS NULL AND store_id IS NOT NULL
)
UPDATE public.tickets t
SET store_job_number = o.rn,
    store_job_year   = o.yr,
    job_ref          = o.prefix || '-' || o.yr::text || '-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE t.id = o.id;

-- Seed the counters from the backfilled max per (store, year).
INSERT INTO public.store_ticket_counters (store_id, year, last_number)
SELECT store_id, store_job_year, MAX(store_job_number)
FROM public.tickets
WHERE store_job_number IS NOT NULL AND store_id IS NOT NULL
GROUP BY store_id, store_job_year
ON CONFLICT (store_id, year)
DO UPDATE SET last_number = GREATEST(public.store_ticket_counters.last_number, EXCLUDED.last_number);


-- ============================================================
-- 2) AI MORNING-BRIEFING CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  scope         text NOT NULL,   -- 'store' | 'region' | 'supplier' | 'estate'
  scope_id      text NOT NULL,
  briefing_date date NOT NULL,
  role          text NOT NULL,
  headline      text,
  body          text NOT NULL,
  source        text NOT NULL DEFAULT 'ai',
  facts         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, scope, scope_id, briefing_date)
);
CREATE INDEX IF NOT EXISTS daily_briefings_lookup_idx
  ON public.daily_briefings (company_id, scope, scope_id, briefing_date);
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3) 24h WHATSAPP SEND GUARD
-- ============================================================
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_wa_inbound_at timestamptz;


-- ============================================================
-- 4) COMPETITIVE MULTI-SUPPLIER QUOTING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ticket_suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL,
  ticket_id      uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'invited',  -- invited | quoted | declined | awarded | closed
  quote_id       uuid,
  decline_reason text,
  invited_at     timestamptz NOT NULL DEFAULT now(),
  responded_at   timestamptz,
  UNIQUE (ticket_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS ticket_suppliers_ticket_idx   ON public.ticket_suppliers (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_suppliers_supplier_idx ON public.ticket_suppliers (supplier_id);
ALTER TABLE public.ticket_suppliers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS cancellation_reason text;
