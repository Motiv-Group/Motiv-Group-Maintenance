-- ============================================================
-- Motiv Migration 004 — Add declined to ticket status
-- Run this in Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Drop the old check constraint and recreate with declined included
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open', 'quoted', 'accepted', 'in_progress', 'completed', 'cancelled', 'declined'));
