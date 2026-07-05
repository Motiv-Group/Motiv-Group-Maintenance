-- ============================================================
-- Motiv Migration 006 — Add snag_in_progress status
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open', 'quoted', 'accepted', 'in_progress', 'completed',
    'cancelled', 'declined', 'pending_sign_off', 'snag', 'snag_in_progress'
  ));
