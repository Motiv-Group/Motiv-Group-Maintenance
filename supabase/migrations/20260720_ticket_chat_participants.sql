-- ---------------------------------------------------------------------------
-- 20260720_ticket_chat_participants
-- ---------------------------------------------------------------------------
-- Ticket chat grows two participant kinds beyond RM ↔ awarded supplier:
--   • The ticket's Store Manager(s), pulled in per-ticket by the RM. The RM
--     chooses at add-time whether the SM sees the full history or only from
--     that moment (sm_history_from = the cutoff; NULL = full history).
--   • The individual owner of a standalone ticket (no RM exists there) — no
--     schema needed, resolved from tickets.created_by, but author_role must
--     allow 'individual'.
-- Deny-all RLS (service-role only via /api/tickets/[id]/chat), mirroring
-- ticket_chat_messages.
--
-- Idempotent.

create table if not exists public.ticket_chat_settings (
  ticket_id       uuid primary key references public.tickets(id) on delete cascade,
  sm_added_at     timestamptz,
  sm_history_from timestamptz,  -- NULL = SM sees full history; else messages from this instant
  sm_added_by     uuid references public.user_profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.ticket_chat_settings enable row level security;
-- No policies on purpose: deny-all — every access goes through the API route.

-- author_role gains the two new participant kinds.
alter table public.ticket_chat_messages drop constraint if exists ticket_chat_messages_author_role_chk;
alter table public.ticket_chat_messages add constraint ticket_chat_messages_author_role_chk
  check (author_role in ('regional_manager', 'supplier', 'store_manager', 'individual'));
