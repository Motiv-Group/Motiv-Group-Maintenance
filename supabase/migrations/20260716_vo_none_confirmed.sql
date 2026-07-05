-- The supplier confirms there are no further variation orders on a job at the
-- close-out stage. The RM's "Final close-out" is blocked (UI greyed + server-side)
-- until this is set. Idempotent.
alter table public.tickets add column if not exists vo_none_confirmed_at timestamptz;
