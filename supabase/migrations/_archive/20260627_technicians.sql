-- ============================================================
-- Motiv — Supplier technicians (the people sent out to do jobs)
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- ============================================================
-- A supplier maintains a roster of technicians (name + phone). When scheduling a
-- job the supplier assigns a technician; tickets.technician_id points at the row.
-- Future: WhatsApp dispatch + on-route/arrival status updates hang off this table.

CREATE TABLE IF NOT EXISTS public.technicians (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid,
  supplier_id uuid,                       -- suppliers.id this technician belongs to
  name        text NOT NULL,
  phone       text NOT NULL,              -- E.164 preferred, e.g. +27821234567
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS technicians_supplier_idx ON public.technicians (supplier_id);
CREATE INDEX IF NOT EXISTS technicians_company_idx  ON public.technicians (company_id);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

-- Ticket → assigned technician (set when the supplier schedules the job).
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS technician_id uuid;
