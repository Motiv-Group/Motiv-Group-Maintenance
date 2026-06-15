-- ============================================================
-- Motiv Migration
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- 1. Add new roles to the profiles role constraint
--    (Drop the old check and recreate it with all four roles)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'store_manager', 'admin', 'regional_manager'));

-- 2. Rename existing 'client' accounts to 'store_manager'
UPDATE profiles SET role = 'store_manager' WHERE role = 'client';

-- 3. Add regional_manager_id to profiles
--    (every store_manager can be linked to one regional_manager)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS regional_manager_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Add file_url column to quotes (for admin attachments)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS file_url text;

-- 5. Add branch_code — unique identifier entered by store during signup
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS branch_code text UNIQUE;

-- ============================================================
-- How to create a Regional Manager account:
-- 1. Sign up normally (or use Supabase Auth → Add user)
-- 2. In the profiles table, set role = 'regional_manager'
-- 3. Link stores to an RM via the Stores tab in the admin panel
--    using the store's branch code
-- ============================================================
