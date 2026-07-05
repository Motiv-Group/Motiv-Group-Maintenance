-- ============================================================
-- Motiv — Competitive multi-supplier quoting + cancellation reason
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- ============================================================
-- A ticket can be sent to several suppliers at once; each is invited, may submit
-- a quote or decline, and the RM awards ONE (the others auto-close). Per-supplier
-- state lives in ticket_suppliers; the awarded supplier is mirrored onto
-- tickets.supplier_id (kept for the existing health/SLA/notification code).

-- 1. Per-(ticket, supplier) invite + response state -----------------------
CREATE TABLE IF NOT EXISTS public.ticket_suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL,
  ticket_id      uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'invited',  -- invited | quoted | declined | awarded | closed
  quote_id       uuid,
  decline_reason text,
  invited_at     timestamptz NOT NULL DEFAULT now(),
  responded_at   timestamptz,
  UNIQUE (ticket_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS ticket_suppliers_ticket_idx   ON public.ticket_suppliers (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_suppliers_supplier_idx ON public.ticket_suppliers (supplier_id);

-- Service-role only (all reads/writes go through the admin client).
ALTER TABLE public.ticket_suppliers ENABLE ROW LEVEL SECURITY;

-- 2. Cancellation reason on tickets --------------------------------------
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS cancellation_reason text;
