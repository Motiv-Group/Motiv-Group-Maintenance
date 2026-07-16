-- Per-ticket RM ↔ awarded-supplier chat. (Applied to PROD earlier; kept here so it
-- can be applied to the DEV Supabase project, which does not yet have these tables.)
--
-- One implicit thread per ticket (messages reference ticket_id directly). Modelled on
-- ticket_dispute_messages: DENY-ALL RLS, all access via the service-role client in the
-- API route (route-level authZ — RM owns the ticket's region, or the supplier is the
-- awarded supplier's user — is the real guard). Not published to Realtime (deny-all →
-- the browser socket receives no row payloads; the open thread polls for replies).
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL Editor.

create table if not exists public.ticket_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete set null,
  author_id       uuid not null references public.user_profiles(id) on delete cascade,
  author_role     text not null,                       -- 'regional_manager' | 'supplier'
  body            text,
  attachment_urls jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ticket_chat_messages_ticket_idx
  on public.ticket_chat_messages (ticket_id, created_at);

-- Per-user read cursor. Unread = messages after last_read_at authored by the OTHER
-- side. Upserted whenever a user opens (GETs) the thread.
create table if not exists public.ticket_chat_reads (
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  user_id      uuid not null references public.user_profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

-- RLS: deny-all to end users (no policies). Mirrors ticket_disputes / ticket_dispute_messages.
alter table public.ticket_chat_messages enable row level security;
alter table public.ticket_chat_reads    enable row level security;

-- SEC-022: bound author_role to the two valid values.
alter table public.ticket_chat_messages drop constraint if exists ticket_chat_messages_author_role_chk;
alter table public.ticket_chat_messages add  constraint ticket_chat_messages_author_role_chk
  check (author_role in ('regional_manager', 'supplier'));
