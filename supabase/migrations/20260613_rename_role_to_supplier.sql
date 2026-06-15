-- ============================================================
-- Motiv — Rename the contractor-side role to 'supplier'
-- Run this in the Supabase SQL editor.
--
-- ⚠ DEPLOY IN LOCKSTEP with the code release that renames /contractor → /supplier
-- and switches the role checks to 'supplier'. Until BOTH the code and this
-- migration are live, those users lose access (RLS + middleware gate on the role).
--
-- Idempotent on the source value: converts whatever the role currently is
-- ('admin' from the original schema, or 'contractor' if an interim rename was
-- applied) straight to 'supplier'. Safe to run regardless of prior state.
--
-- Internal FK columns (quotes.admin_id, completions.admin_id) and the
-- service-role client keep their names — they are not user-facing.
-- The `suppliers` table (sub-supplier / trade directory) is unrelated and
-- unchanged.
-- ============================================================

-- 1. Migrate existing rows, then tighten the role constraint -----------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles SET role = 'supplier' WHERE role IN ('admin', 'contractor');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'supplier', 'store_manager', 'regional_manager'));

-- 2. Recreate every RLS policy that gated on the old role --------------------
--    get_my_role() is unchanged — it simply returns the current role value.
--    Drops cover both the original 'Admins…' names and any interim 'Contractors…'.

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Contractors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Suppliers can view all profiles"   ON public.profiles;
CREATE POLICY "Suppliers can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'supplier');

-- tickets
DROP POLICY IF EXISTS "Admins can view all tickets"         ON public.tickets;
DROP POLICY IF EXISTS "Admins can update all tickets"       ON public.tickets;
DROP POLICY IF EXISTS "Contractors can view all tickets"    ON public.tickets;
DROP POLICY IF EXISTS "Contractors can update all tickets"  ON public.tickets;
DROP POLICY IF EXISTS "Suppliers can view all tickets"      ON public.tickets;
DROP POLICY IF EXISTS "Suppliers can update all tickets"    ON public.tickets;
CREATE POLICY "Suppliers can view all tickets"
  ON public.tickets FOR SELECT
  USING (public.get_my_role() = 'supplier');
CREATE POLICY "Suppliers can update all tickets"
  ON public.tickets FOR UPDATE
  USING (public.get_my_role() = 'supplier');

-- quotes
DROP POLICY IF EXISTS "Admins can view all quotes"      ON public.quotes;
DROP POLICY IF EXISTS "Admins can insert quotes"        ON public.quotes;
DROP POLICY IF EXISTS "Admins can update quotes"        ON public.quotes;
DROP POLICY IF EXISTS "Contractors can view all quotes" ON public.quotes;
DROP POLICY IF EXISTS "Contractors can insert quotes"   ON public.quotes;
DROP POLICY IF EXISTS "Contractors can update quotes"   ON public.quotes;
DROP POLICY IF EXISTS "Suppliers can view all quotes"   ON public.quotes;
DROP POLICY IF EXISTS "Suppliers can insert quotes"     ON public.quotes;
DROP POLICY IF EXISTS "Suppliers can update quotes"     ON public.quotes;
CREATE POLICY "Suppliers can view all quotes"
  ON public.quotes FOR SELECT
  USING (public.get_my_role() = 'supplier');
CREATE POLICY "Suppliers can insert quotes"
  ON public.quotes FOR INSERT
  WITH CHECK (public.get_my_role() = 'supplier');
CREATE POLICY "Suppliers can update quotes"
  ON public.quotes FOR UPDATE
  USING (public.get_my_role() = 'supplier');

-- completions
DROP POLICY IF EXISTS "Admins can manage completions"       ON public.completions;
DROP POLICY IF EXISTS "Contractors can manage completions"  ON public.completions;
DROP POLICY IF EXISTS "Suppliers can manage completions"    ON public.completions;
CREATE POLICY "Suppliers can manage completions"
  ON public.completions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'supplier')
  );
