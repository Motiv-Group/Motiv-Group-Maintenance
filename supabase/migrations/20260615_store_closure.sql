-- ============================================================
-- Motiv — Store closure (archive) support
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================
-- A regional manager can "close" a store they manage. Nothing is deleted — the
-- store profile and all its tickets stay. A closed store is hidden from the RM's
-- active views (dashboard, tickets, sign-off, snag, active stores list) and the
-- store manager can no longer submit new tickets. The RM can reopen it later.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS closed_at      timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS closure_reason text;

CREATE INDEX IF NOT EXISTS profiles_closed_at_idx ON public.profiles (closed_at);
