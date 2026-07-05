-- ============================================================
-- Motiv — Variation Orders
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================
-- A variation order is a quote-like document a contractor raises mid-job when
-- extra materials/work are needed. It reuses the `quotes` table (so it inherits
-- the existing regional-manager approval flow) and is distinguished by `type`.
-- While one is awaiting approval the ticket sits in 'variation_pending'.

-- 1. Discriminate quotes vs variation orders
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'quote';

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_type_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_type_check
  CHECK (type IN ('quote', 'variation'));

-- 2. New ticket status: variation awaiting RM approval
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open', 'quoted', 'accepted', 'in_progress', 'completed',
    'cancelled', 'declined', 'pending_sign_off', 'snag', 'snag_in_progress',
    'variation_pending'
  ));

COMMENT ON COLUMN public.quotes.type IS 'quote = original quote; variation = mid-job variation order (extra materials/work). Both follow the RM approval flow.';
