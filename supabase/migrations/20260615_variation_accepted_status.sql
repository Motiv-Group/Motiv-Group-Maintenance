-- ============================================================
-- Motiv — Variation Accepted status
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================
-- When a regional manager approves a variation order, the ticket now moves to
-- 'variation_accepted' (instead of straight back to 'in_progress') so the badge
-- clearly reads "Variation Accepted". It behaves like in-progress: the
-- contractor can submit COC/POC for sign-off from this state.

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open', 'quoted', 'accepted', 'in_progress', 'completed',
    'cancelled', 'declined', 'pending_sign_off', 'snag', 'snag_in_progress',
    'variation_pending', 'variation_accepted'
  ));
