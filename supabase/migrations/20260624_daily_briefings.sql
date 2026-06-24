-- ============================================================
-- Motiv — AI Morning Briefing cache (Vercel Hobby friendly: no cron)
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- ============================================================
-- Each role dashboard shows a short, AI-written "morning briefing" generated
-- from the live health-engine signals. To stay within the Hobby cron limit the
-- briefing is generated lazily on the first dashboard load of the day and cached
-- here for the rest of the day (one row per scope per date). Written/read via the
-- service-role client only.

CREATE TABLE IF NOT EXISTS public.daily_briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  scope         text NOT NULL,   -- 'store' | 'region' | 'supplier' | 'estate'
  scope_id      text NOT NULL,   -- store-id set / region-id set / supplier-id set / company id
  briefing_date date NOT NULL,
  role          text NOT NULL,
  headline      text,
  body          text NOT NULL,
  source        text NOT NULL DEFAULT 'ai',  -- 'ai' | 'fallback'
  facts         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, scope, scope_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS daily_briefings_lookup_idx
  ON public.daily_briefings (company_id, scope, scope_id, briefing_date);

-- Service-role only (dashboards read/write via the admin client). Enable RLS with
-- no policies so the anon/auth keys cannot read briefings directly.
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;
