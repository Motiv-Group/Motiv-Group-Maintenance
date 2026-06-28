-- Track who last edited a ticket and when, so the detail pages can show
-- "Last edited by {name} · {date}". Idempotent: safe to re-run.
alter table public.tickets add column if not exists edited_at timestamptz;
alter table public.tickets add column if not exists edited_by uuid references public.user_profiles(id) on delete set null;
