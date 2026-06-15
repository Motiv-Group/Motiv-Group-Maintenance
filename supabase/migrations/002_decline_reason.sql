-- ============================================================
-- Motiv Migration 002
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- Add decline_reason to quotes
-- Stores the reason a regional manager or store manager declined a quote
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS decline_reason text;
