-- ============================================================
-- Motiv — two new real ticket statuses + VO warranty
-- Run in the Supabase SQL Editor. Idempotent.
--
-- 1. suppliers_declined — every invited supplier declined the quote request and
--    none was awarded. The ticket is NO LONGER "open": it awaits the RM to
--    re-assign (or cancel). Previously this was only guessed in the UI, so the
--    dashboards/lists still counted it as Open — now it is a first-class status.
--
-- 2. vo_declined — the RM declined the supplier's variation order. The supplier
--    must re-submit a revised VO or message the RM before marking the job in
--    progress. (VOs are raised in the scheduled phase, before "Mark in progress".)
--
-- Both are ACTIVE (isActive() only treats completed/cancelled/declined as
-- terminal), so they roll into the health engine automatically.
-- ============================================================
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check CHECK (status IN (
  'open','info_requested','assigned','assessment','quote_requested','quoted','quote_revision',
  'accepted','scheduled','in_progress','variation_review','vo_declined',
  'submitted_for_signoff','evidence_requested',
  'snag','snag_assigned','snag_in_progress','snag_resolved','approved_closeout',
  'suppliers_declined','completed','cancelled','declined',
  -- legacy values still present on older rows
  'acknowledged','awaiting_decision','on_hold','monitoring','pending_sign_off','variation_pending','variation_accepted'
));

-- Variation orders carry a warranty / guarantee, mirroring quotes.
ALTER TABLE public.ticket_variations ADD COLUMN IF NOT EXISTS warranty text;
COMMENT ON COLUMN public.ticket_variations.warranty IS 'Warranty / guarantee stated on the variation order (free text, or "N/A").';
