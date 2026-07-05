-- WhatsApp tap-to-edit: remember which field the user is editing (title /
-- description) so their next text message is captured as that field's value.
-- Additive + idempotent — safe to paste into the Supabase SQL editor.

alter table if exists public.whatsapp_sessions
  add column if not exists pending_field text;
