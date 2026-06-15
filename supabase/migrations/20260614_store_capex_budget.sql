-- ============================================================
-- Motiv — Monthly Capex budget per store
-- Run this in the Supabase SQL editor.
-- ============================================================
-- A single recurring monthly capital-expenditure allowance per store,
-- editable by the store's regional manager. NULL = not set.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS capex_budget numeric(12,2) NULL;

COMMENT ON COLUMN public.profiles.capex_budget IS 'Recurring monthly Capex budget allowance for a store (ZAR). Set by the regional manager. NULL = not set.';
