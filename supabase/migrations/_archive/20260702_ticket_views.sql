-- Audit-trail view tracking: records the first time a user opens each key item on a
-- ticket (its quote, photos, COC/POC) so the trail can show "X viewed the quote/…".
-- One row per (ticket, viewer, item_type); writes go through the service role.
create table if not exists public.ticket_views (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  viewer_id       uuid references public.user_profiles(id) on delete set null,
  viewer_role     text,
  item_type       text not null,   -- 'quote' | 'photos' | 'coc'
  first_viewed_at timestamptz not null default now()
);
create unique index if not exists ticket_views_uniq on public.ticket_views (ticket_id, viewer_id, item_type);
create index if not exists ticket_views_ticket_idx on public.ticket_views (ticket_id);

alter table public.ticket_views enable row level security;
drop policy if exists "ticket_views read" on public.ticket_views;
create policy "ticket_views read" on public.ticket_views for select using (company_id = public.app_company_id());
