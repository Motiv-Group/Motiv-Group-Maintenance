-- Notifications: link to a ticket + archive when that ticket completes.
-- Idempotent; safe to re-run. Apply in the Supabase SQL editor, then fold into
-- schema.sql and delete this file (per repo convention).

-- 1) New columns -------------------------------------------------------------
alter table public.notifications add column if not exists ticket_id  uuid;
alter table public.notifications add column if not exists archived_at timestamptz;

-- 2) Backfill ticket_id from the existing link (…/tickets/<uuid>) ------------
update public.notifications
set ticket_id = (substring(link from '/tickets/([0-9a-fA-F-]{36})'))::uuid
where ticket_id is null
  and link ~ '/tickets/[0-9a-fA-F-]{36}';

-- Drop any parsed id that doesn't resolve to a real ticket, so the FK is clean.
update public.notifications n
set ticket_id = null
where n.ticket_id is not null
  and not exists (select 1 from public.tickets t where t.id = n.ticket_id);

do $$ begin
  alter table public.notifications
    add constraint notifications_ticket_fk foreign key (ticket_id)
    references public.tickets(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 3) Backfill archive for notifications of already-completed tickets ---------
update public.notifications n
set archived_at = coalesce(t.completed_at, now())
from public.tickets t
where n.ticket_id = t.id
  and t.status = 'completed'
  and n.archived_at is null;

create index if not exists notifications_user_archived_idx
  on public.notifications (user_id, archived_at, created_at desc);

-- 4) Archive a ticket's notifications when it completes ----------------------
create or replace function public.archive_ticket_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'completed' and old.status is distinct from 'completed') then
    update public.notifications
    set archived_at = now()
    where ticket_id = new.id and archived_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_archive_ticket_notifications on public.tickets;
create trigger trg_archive_ticket_notifications
  after update of status on public.tickets
  for each row execute function public.archive_ticket_notifications();
