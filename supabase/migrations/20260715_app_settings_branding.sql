-- Customization tab: app_settings key/value store + public `branding` storage bucket.
-- Idempotent — safe to re-run.

-- ── app_settings ──────────────────────────────────────────────────────────────
-- Single-row-per-key JSON settings (key 'app' holds the AppSettings blob: app
-- name, colour overrides, branding asset URLs, default theme, support contact).
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- All reads/writes go through the service-role client server-side; the only
-- direct-table access allowed is the master admin (defence in depth).
drop policy if exists "app_settings admin" on public.app_settings;
create policy "app_settings admin" on public.app_settings for all
  using (public.app_role() = 'system_admin')
  with check (public.app_role() = 'system_admin');

-- ── branding storage bucket ───────────────────────────────────────────────────
-- PUBLIC bucket: logos/icons/manifest icons must be fetchable by browsers,
-- installed PWAs and email clients without auth. Writes happen only via the
-- service-role admin routes; no client upload policy is granted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding', 'branding', true, 15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon', 'application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
