-- WhatsApp AI ticketing: capture the model's self-reported confidence on the
-- session, and flag low-confidence tickets for regional-manager review.
-- Additive + idempotent — safe to paste into the Supabase SQL editor.

alter table if exists public.whatsapp_sessions
  add column if not exists confidence numeric;

alter table if exists public.tickets
  add column if not exists needs_review boolean not null default false;
