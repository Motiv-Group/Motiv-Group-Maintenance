-- ============================================================
-- Motiv Migration — add the profile fields the Settings form edits
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- The Settings page has always shown Address / Company Name / Branch / Branch
-- Code inputs, but these columns never existed on user_profiles — the old
-- /api/profile PATCH silently ignored them. Now that PATCH persists them,
-- saving failed with: "Could not find the 'address' column of 'user_profiles'".
-- Add the columns (nullable) so Settings saves for every role.
-- (Table-level grants from 20260618 cover new columns automatically.)
-- ============================================================

alter table public.user_profiles
  add column if not exists address      text,
  add column if not exists company_name text,
  add column if not exists sub_store    text,
  add column if not exists branch_code  text;
