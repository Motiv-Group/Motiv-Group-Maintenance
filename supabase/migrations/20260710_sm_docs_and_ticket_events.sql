-- Store-manager "add info" documents + a real ticket status-change audit trail.
-- Idempotent; safe to re-run. Apply in the Supabase SQL editor, then fold into
-- schema.sql and delete this file (per repo convention).

-- 1) SM-uploaded documents on a ticket (separate from image photo_urls) -------
alter table public.tickets
  add column if not exists info_doc_urls text[] default '{}'::text[];

-- 2) Private storage bucket for those documents -------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-docs', 'ticket-docs', false, 15728640,
  array[
    'image/jpeg','image/jpg','image/png','image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;

-- Uploads happen server-side via the service-role client (see /api/uploads),
-- which forces the object path to <userId>/…; this policy mirrors ticket-photos.
drop policy if exists "ticket-docs upload" on storage.objects;
create policy "ticket-docs upload" on storage.objects for insert
  with check (((bucket_id = 'ticket-docs'::text) AND (auth.uid() IS NOT NULL)));

-- 3) Audit trail: one row per ticket status change ----------------------------
create table if not exists public.ticket_events (
  id          uuid not null default gen_random_uuid(),
  ticket_id   uuid not null,
  company_id  uuid,
  from_status text,
  to_status   text not null,
  created_at  timestamptz not null default now()
);
alter table public.ticket_events add primary key (id);
alter table public.ticket_events
  add constraint ticket_events_ticket_fk foreign key (ticket_id)
  references public.tickets(id) on delete cascade;
create index if not exists ticket_events_ticket_idx
  on public.ticket_events (ticket_id, created_at);

alter table public.ticket_events enable row level security;
-- Company-scoped read (defence in depth; the app loads via the service-role
-- client). Writes come only from the SECURITY DEFINER trigger below.
drop policy if exists "ticket_events read" on public.ticket_events;
create policy "ticket_events read" on public.ticket_events for select
  using ((company_id = app_company_id()));

-- Trigger: log creation + every status transition, whichever route made it.
create or replace function public.log_ticket_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.ticket_events (ticket_id, company_id, from_status, to_status)
    values (new.id, new.company_id, null, new.status);
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.ticket_events (ticket_id, company_id, from_status, to_status)
    values (new.id, new.company_id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ticket_events_ins on public.tickets;
create trigger trg_ticket_events_ins
  after insert on public.tickets
  for each row execute function public.log_ticket_event();

drop trigger if exists trg_ticket_events_upd on public.tickets;
create trigger trg_ticket_events_upd
  after update of status on public.tickets
  for each row execute function public.log_ticket_event();
