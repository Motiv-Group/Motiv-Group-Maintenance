-- ============================================================
-- Motiv Migration 002 — Extended signup trigger
-- Run this in Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Update the trigger function to capture all profile fields from
-- signup metadata, including role (store_manager / regional_manager).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role        text;
  v_branch_code text;
BEGIN
  -- Resolve role: allow store_manager or regional_manager from metadata; default store_manager
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'store_manager');
  IF v_role NOT IN ('store_manager', 'regional_manager') THEN
    v_role := 'store_manager';
  END IF;

  v_branch_code := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'branch_code', '')));
  IF v_branch_code = '' THEN v_branch_code := NULL; END IF;

  INSERT INTO public.profiles (id, email, role, full_name, phone, address, company_name, sub_store, branch_code)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'sub_store',
    v_branch_code
  )
  ON CONFLICT (id) DO UPDATE SET
    role         = EXCLUDED.role,
    full_name    = EXCLUDED.full_name,
    phone        = EXCLUDED.phone,
    address      = EXCLUDED.address,
    company_name = EXCLUDED.company_name,
    sub_store    = EXCLUDED.sub_store,
    branch_code  = COALESCE(EXCLUDED.branch_code, public.profiles.branch_code);
  RETURN NEW;
END;
$$;
