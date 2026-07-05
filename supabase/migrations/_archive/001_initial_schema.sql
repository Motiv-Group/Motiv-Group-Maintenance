-- ============================================================
-- Motiv — Initial Schema
-- Run this in Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES  (extends Supabase auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           text not null default 'client' check (role in ('client', 'admin')),
  full_name      text,
  email          text,
  phone          text,
  address        text,
  company_name   text,
  sub_store      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- TICKETS
-- ─────────────────────────────────────────
create table public.tickets (
  id             uuid primary key default uuid_generate_v4(),
  client_id      uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  description    text not null,
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status         text not null default 'open'   check (status  in ('open', 'quoted', 'accepted', 'in_progress', 'completed', 'cancelled')),
  photo_urls     text[] default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- QUOTES
-- ─────────────────────────────────────────
create table public.quotes (
  id             uuid primary key default uuid_generate_v4(),
  ticket_id      uuid not null references public.tickets(id) on delete cascade,
  admin_id       uuid not null references public.profiles(id),
  amount         numeric(10,2) not null,
  description    text not null,
  valid_until    date,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────
create table public.notifications (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null, -- 'new_ticket' | 'new_quote' | 'quote_accepted' | 'quote_declined'
  title          text not null,
  message        text not null,
  link           text,          -- e.g. /client/tickets/abc or /admin/tickets/abc
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- STORAGE BUCKET  (ticket photos)
-- ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('ticket-photos', 'ticket-photos', true)
on conflict do nothing;

-- ─────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────

-- PROFILES
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- TICKETS
alter table public.tickets enable row level security;

create policy "Clients can view their own tickets"
  on public.tickets for select
  using (auth.uid() = client_id);

create policy "Clients can insert their own tickets"
  on public.tickets for insert
  with check (auth.uid() = client_id);

create policy "Admins can view all tickets"
  on public.tickets for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update all tickets"
  on public.tickets for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- QUOTES
alter table public.quotes enable row level security;

create policy "Clients can view quotes on their tickets"
  on public.quotes for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = quotes.ticket_id and t.client_id = auth.uid()
    )
  );

create policy "Admins can view all quotes"
  on public.quotes for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can insert quotes"
  on public.quotes for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update quotes"
  on public.quotes for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Clients can update quote status (accept/decline)"
  on public.quotes for update
  using (
    exists (
      select 1 from public.tickets t
      where t.id = quotes.ticket_id and t.client_id = auth.uid()
    )
  );

-- NOTIFICATIONS
alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update their own notifications (mark read)"
  on public.notifications for update
  using (auth.uid() = user_id);

-- STORAGE
create policy "Authenticated users can upload ticket photos"
  on storage.objects for insert
  with check (bucket_id = 'ticket-photos' and auth.role() = 'authenticated');

create policy "Anyone can view ticket photos"
  on storage.objects for select
  using (bucket_id = 'ticket-photos');

-- ─────────────────────────────────────────
-- INDEXES  (speeds up common queries)
-- ─────────────────────────────────────────
create index tickets_client_id_idx   on public.tickets (client_id);
create index tickets_status_idx      on public.tickets (status);
create index quotes_ticket_id_idx    on public.quotes  (ticket_id);
create index notifications_user_idx  on public.notifications (user_id, read);
