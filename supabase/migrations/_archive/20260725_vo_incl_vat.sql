-- ---------------------------------------------------------------------------
-- 20260725_vo_incl_vat
-- ---------------------------------------------------------------------------
-- Variation orders gain an incl-VAT amount (mirrors quotes.amount_incl_vat) so
-- the VO review/declined pop-ups can show both figures without guessing VAT.
-- Nullable — pre-existing VOs simply have no incl figure and the UI omits it.
-- Idempotent.

alter table public.ticket_variations add column if not exists amount_incl_vat numeric;
