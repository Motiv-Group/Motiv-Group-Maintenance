-- Optional note attached to a ticket edit, so the audit trail can distinguish an
-- ordinary edit ("Ticket edited") from a scoped one ("Ticket edited — added extra
-- work"). Set on the PATCH that stored the edit; cleared (null) on a plain edit.
-- Idempotent: safe to re-run.
alter table public.tickets add column if not exists edit_note text;
