-- Add VAT-inclusive amount to quotes.
-- `amount` remains the excl-VAT figure (or the sole total for non-VAT-registered
-- suppliers). `amount_incl_vat` is nullable: null when the supplier shows no VAT
-- breakdown. Backward compatible with all existing quotes.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS amount_incl_vat numeric(12,2) NULL;

COMMENT ON COLUMN quotes.amount_incl_vat IS 'Total including VAT in ZAR. NULL when the supplier is not VAT-registered / shows no VAT line.';
