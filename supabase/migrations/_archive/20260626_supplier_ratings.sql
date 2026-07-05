-- ============================================================
-- Motiv — Supplier ratings (v3, keyed to suppliers.id)
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- ============================================================
-- The RM rates a supplier 1–5 (+ optional comment) when accepting the COC/POC.
-- Existing ratings used contractor_id (old profile model); v3 ratings are keyed
-- to suppliers.id via supplier_id.

CREATE TABLE IF NOT EXISTS public.ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid,
  ticket_id     uuid,
  supplier_id   uuid,
  contractor_id uuid,
  rated_by      uuid,
  score         int NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS company_id  uuid;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS supplier_id uuid;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS rated_by    uuid;

CREATE INDEX IF NOT EXISTS ratings_supplier_idx ON public.ratings (supplier_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
