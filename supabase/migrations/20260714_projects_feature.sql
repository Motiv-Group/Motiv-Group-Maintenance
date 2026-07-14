-- Projects feature — once-off multi-store installation project tracking.
-- Two surfaces: System Admin (/admin/projects) enters/uploads everything; Regional
-- Manager (/regional/projects) is a READ-ONLY client-facing dashboard. Store count is
-- derived from the imported spreadsheet (never hardcoded). Store progress = 4 milestones
-- × 25% (On Site / Before / After / Sign-off), computed from milestone timestamps via a
-- STORED generated column so the percentage can never be manually set. Overall project
-- progress = average of store percentages (computed live in lib/projects/progress.ts).
--
-- Tenancy: every row carries company_id, scoped by RLS to app_company_id(). Reads allowed
-- to system_admin / executive / regional_manager; ALL writes limited to system_admin.
-- Internal notes live in a SEPARATE admin-only table (project_notes) because RLS is
-- row-level, not column-level — a column would leak to an RM via direct REST.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id                uuid not null default gen_random_uuid() primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  name              text not null,
  description       text,
  client_name       text,
  start_date        date,
  end_date          date,
  status            text not null default 'draft',        -- draft|planned|active|complete|archived
  cover_image_path  text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create table if not exists public.project_stores (
  id                          uuid not null default gen_random_uuid() primary key,
  project_id                  uuid not null references public.projects(id) on delete cascade,
  company_id                  uuid not null references public.companies(id) on delete cascade,
  store_id                    uuid references public.stores(id) on delete set null,  -- optional link to an estate store
  branch_code                 text not null,
  store_name                  text,
  town                        text,
  rfid_m2_required            numeric,
  start_date                  date,
  end_date                    date,
  on_site_completed_at        timestamptz,
  before_photos_completed_at  timestamptz,
  after_photos_completed_at   timestamptz,
  signoff_completed_at        timestamptz,
  on_site_note                text,        -- RM-visible milestone context (NOT internal)
  -- Source of truth for progress: derived from the four milestone timestamps, never
  -- writable. 0/25/50/75/100.
  progress_percentage         integer generated always as (
      (case when on_site_completed_at       is not null then 25 else 0 end)
    + (case when before_photos_completed_at is not null then 25 else 0 end)
    + (case when after_photos_completed_at  is not null then 25 else 0 end)
    + (case when signoff_completed_at       is not null then 25 else 0 end)
  ) stored,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (project_id, branch_code)     -- branch code is the per-project business key
);

create table if not exists public.project_files (
  id                 uuid not null default gen_random_uuid() primary key,
  project_id         uuid not null references public.projects(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  project_store_id   uuid references public.project_stores(id) on delete cascade,  -- null = project-level (e.g. cover)
  file_category      text not null,   -- before_photo|after_photo|signoff_photo|signoff_document|project_cover
  storage_path       text not null,   -- stored object URL/ref (re-signed on read via lib/storage)
  original_filename  text,
  mime_type          text,
  file_size          bigint,
  caption            text,            -- RM-visible
  signed_date        date,            -- sign-off documents
  signatory_name     text,            -- sign-off documents
  sort_order         integer not null default 0,
  uploaded_by        uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

create table if not exists public.project_events (
  id                uuid not null default gen_random_uuid() primary key,
  project_id        uuid not null references public.projects(id) on delete cascade,
  company_id        uuid,
  project_store_id  uuid references public.project_stores(id) on delete cascade,
  event_type        text not null,
  previous_value    text,
  new_value         text,
  metadata          jsonb,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

-- Internal admin-only notes (project-level or per-store). Separate table so RLS can
-- deny-all to non-admins at the ROW level — an RM never receives these, even via REST.
create table if not exists public.project_notes (
  id                uuid not null default gen_random_uuid() primary key,
  project_id        uuid not null references public.projects(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  project_store_id  uuid references public.project_stores(id) on delete cascade,
  body              text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

-- Indexes for the store table / filters.
create index if not exists project_stores_project_idx on public.project_stores(project_id);
create index if not exists project_files_store_cat_idx on public.project_files(project_store_id, file_category);
create index if not exists project_events_project_idx  on public.project_events(project_id);
create index if not exists projects_company_idx        on public.projects(company_id);

-- ---------------------------------------------------------------------------
-- RLS — company-scoped; read for admin/exec/RM, write for system_admin only.
-- (App mutations run via the service-role client which bypasses RLS; these policies
--  are the real backstop against a signed-in user hitting REST directly.)
-- ---------------------------------------------------------------------------
alter table public.projects        enable row level security;
alter table public.project_stores  enable row level security;
alter table public.project_files   enable row level security;
alter table public.project_events  enable row level security;
alter table public.project_notes   enable row level security;

-- projects
drop policy if exists "projects read"  on public.projects;
create policy "projects read"  on public.projects for select
  using (company_id = public.app_company_id()
         and public.app_role() = any (array['system_admin','executive','regional_manager']));
drop policy if exists "projects write" on public.projects;
create policy "projects write" on public.projects for all
  using (company_id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (company_id = public.app_company_id() and public.app_role() = 'system_admin');

-- project_stores
drop policy if exists "project_stores read"  on public.project_stores;
create policy "project_stores read"  on public.project_stores for select
  using (company_id = public.app_company_id()
         and public.app_role() = any (array['system_admin','executive','regional_manager']));
drop policy if exists "project_stores write" on public.project_stores;
create policy "project_stores write" on public.project_stores for all
  using (company_id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (company_id = public.app_company_id() and public.app_role() = 'system_admin');

-- project_files
drop policy if exists "project_files read"  on public.project_files;
create policy "project_files read"  on public.project_files for select
  using (company_id = public.app_company_id()
         and public.app_role() = any (array['system_admin','executive','regional_manager']));
drop policy if exists "project_files write" on public.project_files;
create policy "project_files write" on public.project_files for all
  using (company_id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (company_id = public.app_company_id() and public.app_role() = 'system_admin');

-- project_events (read for admin/exec/RM; insert via service-role only → no write policy)
drop policy if exists "project_events read" on public.project_events;
create policy "project_events read" on public.project_events for select
  using (company_id = public.app_company_id()
         and public.app_role() = any (array['system_admin','executive','regional_manager']));

-- project_notes — system_admin only, both directions.
drop policy if exists "project_notes admin" on public.project_notes;
create policy "project_notes admin" on public.project_notes for all
  using (company_id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (company_id = public.app_company_id() and public.app_role() = 'system_admin');

-- ---------------------------------------------------------------------------
-- Storage — new private bucket for project evidence (images + PDF), 15 MB.
-- Read via signed URLs (lib/storage.ts); uploads via POST /api/uploads (service-role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-files','project-files',false, 15728640, array['image/jpeg','image/jpg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project-files upload" on storage.objects;
create policy "project-files upload" on storage.objects for insert
  with check (((bucket_id = 'project-files'::text) AND (auth.uid() IS NOT NULL)));

-- ---------------------------------------------------------------------------
-- Realtime — RM dashboard live-updates when the admin uploads/marks milestones.
-- ---------------------------------------------------------------------------
alter table public.projects        replica identity full;
alter table public.project_stores  replica identity full;
alter table public.project_files   replica identity full;

do $$
declare t text;
begin
  foreach t in array array['projects','project_stores','project_files']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
