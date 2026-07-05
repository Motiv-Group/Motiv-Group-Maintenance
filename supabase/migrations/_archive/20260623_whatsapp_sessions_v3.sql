-- ============================================================
-- Motiv Migration — ensure WhatsApp ticket-intake session table exists
--
-- Run in Supabase SQL Editor. Idempotent. The WhatsApp webhook
-- (app/api/webhooks/whatsapp/route.ts) buffers an in-progress ticket here while
-- the store manager sends photos, then creates the v3 ticket on submit. Only
-- the webhook (service-role admin client) touches it, so RLS is on with no
-- policies (admin bypasses RLS).
-- ============================================================

create table if not exists public.whatsapp_sessions (
  id          uuid primary key default gen_random_uuid(),
  phone       text        not null,
  title       text        not null,
  description text        not null,
  priority    text        not null default 'medium',  -- AI urgency word; mapped to P1–P4 at ticket creation
  photo_urls  text[]      not null default '{}',
  status      text        not null default 'awaiting_photos',
  created_at  timestamptz not null default now()
);

create index if not exists whatsapp_sessions_phone_status_idx on public.whatsapp_sessions (phone, status);

-- Atomic photo append (handles photos arriving simultaneously)
create or replace function public.append_session_photo(session_id uuid, photo_url text)
returns text[] language sql security definer set search_path = public as $$
  update public.whatsapp_sessions
  set photo_urls = array_append(photo_urls, photo_url)
  where id = session_id
  returning photo_urls;
$$;

alter table public.whatsapp_sessions enable row level security;  -- no policies → only service_role (webhook) can touch it
