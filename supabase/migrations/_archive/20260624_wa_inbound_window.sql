-- ============================================================
-- Motiv — Track last WhatsApp inbound (24h-window guard)
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- ============================================================
-- WhatsApp Cloud API only allows a business to send free-form messages within
-- 24h of the user's last inbound message; sending outside that window risks the
-- number being flagged/banned. We stamp this column on every inbound in the
-- webhook, and business-initiated sends (e.g. the dashboard "Send to WhatsApp"
-- button) refuse to fire unless the stamp is within 24h.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_wa_inbound_at timestamptz;
