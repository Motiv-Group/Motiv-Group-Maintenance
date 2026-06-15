-- ============================================================
-- Fix role check constraint to include all valid roles
-- Run this in Supabase SQL Editor if profile saves are failing
-- for regional_manager or store_manager accounts.
-- ============================================================

-- Drop the old constraint that only allowed 'client' and 'admin'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the updated constraint with all valid roles
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'admin', 'store_manager', 'regional_manager'));
