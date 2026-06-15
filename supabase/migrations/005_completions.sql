-- ============================================================
-- Motiv Migration 005 — COC/POC Sign-off Workflow
-- Run this in the Supabase SQL editor (Database → SQL Editor)
-- ============================================================

-- 1. Add pending_sign_off and snag to ticket status constraint
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN (
    'open','quoted','accepted','in_progress','completed',
    'cancelled','declined','pending_sign_off','snag'
  ));

-- 2. Completions table (COC + POC submissions)
CREATE TABLE IF NOT EXISTS public.completions (
  id            uuid primary key default uuid_generate_v4(),
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  admin_id      uuid not null references public.profiles(id),
  coc_url       text,
  poc_urls      text[] default '{}',
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  reject_reason text,
  notes         text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3. RLS
ALTER TABLE public.completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage completions"
  ON public.completions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Regional managers can view completions"
  ON public.completions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'regional_manager')
  );

CREATE POLICY "Regional managers can update completions"
  ON public.completions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'regional_manager')
  );

-- 4. Storage bucket for completion docs
INSERT INTO storage.buckets (id, name, public)
  VALUES ('completion-docs', 'completion-docs', true)
  ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated users can upload completion docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'completion-docs' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view completion docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'completion-docs');

-- 5. Index
CREATE INDEX IF NOT EXISTS completions_ticket_idx ON public.completions (ticket_id);
