-- ============================================================
-- Motiv Migration 003 — Add decline_reason to quotes
-- Run this in Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS decline_reason text;
