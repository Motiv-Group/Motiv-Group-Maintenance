-- ============================================================
-- Motiv — revert the "suppliers_declined" ticket status
-- Run in the Supabase SQL Editor. Idempotent.
--
-- All invited suppliers declining no longer parks the ticket in its own status.
-- The ticket simply returns to 'open' so the RM can assign new suppliers (each
-- supplier's decline is still visible in "Suppliers requested" + the audit trail).
-- Flip any tickets currently sitting at 'suppliers_declined' back to 'open'.
--
-- The status CHECK constraint keeps allowing 'suppliers_declined' (harmless) so
-- this migration never conflicts with the earlier one.
-- ============================================================
UPDATE public.tickets
   SET status          = 'open',
       supplier_id     = NULL,
       quote_required  = false,
       current_blocker = NULL,
       blocker_owner_type = NULL,
       blocker_started_at = NULL,
       sla_paused      = false,
       updated_at      = now()
 WHERE status = 'suppliers_declined';
