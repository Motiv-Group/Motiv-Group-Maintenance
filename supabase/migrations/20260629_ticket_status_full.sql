-- Align tickets.status CHECK with the full lib/workflow state machine (earlier
-- status-check migrations were inconsistent — some omitted statuses the app uses,
-- e.g. scheduled / submitted_for_signoff / snag_assigned). Includes snag_in_progress
-- for the supplier snag flow, plus legacy values so no existing row is rejected.
-- Idempotent: safe to re-run.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check CHECK (status IN (
  'open','info_requested','assigned','assessment','quote_requested','quoted','quote_revision',
  'accepted','scheduled','in_progress','variation_review','submitted_for_signoff','evidence_requested',
  'snag','snag_assigned','snag_in_progress','snag_resolved','approved_closeout',
  'completed','cancelled','declined',
  -- legacy values still present on older rows
  'acknowledged','awaiting_decision','on_hold','monitoring','pending_sign_off','variation_pending','variation_accepted'
));
