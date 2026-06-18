-- WhatsApp AI ticketing: persist the AI-chosen category + operational_impact on
-- the session so they survive until the ticket is created (after photos arrive).
-- Additive + idempotent — safe to paste into the Supabase SQL editor any time.

alter table if exists public.whatsapp_sessions
  add column if not exists category           text not null default 'General',
  add column if not exists operational_impact  text not null default 'none';
