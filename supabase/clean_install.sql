-- ============================================================
-- Motiv — CLEAN INSTALL (full schema, no data)
-- Paste this whole file into the Supabase SQL Editor of a fresh project.
-- Builds every table, function, trigger, RLS policy, storage bucket and the
-- one real seed (SLA rules). Idempotent where practical. No tickets/stores/users.
--
-- After running: create your first executive (see bottom), set Auth + env
-- (see docs/MIGRATE_TO_NEW_SUPABASE.md §7–§8), then deploy.
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Sequence for human ticket numbers (JOB-00042). Must exist before `tickets`.
create sequence if not exists public.tickets_job_number_seq;

-- ─────────────────────────────────────────
-- PROFILES (extends auth.users). region_id FK added after `regions` exists.
-- ─────────────────────────────────────────
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'client'
                        check (role in ('client','supplier','store_manager','regional_manager','executive')),
  full_name           text,
  email               text,
  phone               text,
  address             text,
  company_name        text,
  sub_store           text,
  branch_code         text,
  regional_manager_id uuid references public.profiles(id) on delete set null,
  region_id           uuid,            -- FK to regions added below
  capex_budget        numeric(12,2),
  closed_at           timestamptz,
  closure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_rm_idx        on public.profiles (regional_manager_id);
create index profiles_closed_at_idx on public.profiles (closed_at);

-- ─────────────────────────────────────────
-- SUPPLIERS (sub-supplier / trade directory) — service-role managed
-- ─────────────────────────────────────────
create table public.suppliers (
  id                    uuid primary key default uuid_generate_v4(),
  company_name          text not null,
  contact_name          text,
  email                 text,
  phone                 text,
  address               text,
  trade                 text,
  qualified             boolean not null default false,
  qualification_number  text,
  qualification_expiry  date,
  vat_number            text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- REGIONS (store → region; region has an assigned RM)
-- ─────────────────────────────────────────
create table public.regions (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  code                 text unique,
  regional_manager_id  uuid references public.profiles(id) on delete set null,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index regions_rm_idx on public.regions (regional_manager_id);

alter table public.profiles
  add constraint profiles_region_fk foreign key (region_id) references public.regions(id) on delete set null;
create index profiles_region_idx on public.profiles (region_id);

-- ─────────────────────────────────────────
-- SLA RULES (per priority; global default row = region_id NULL)
-- ─────────────────────────────────────────
create table public.sla_rules (
  id                        uuid primary key default uuid_generate_v4(),
  region_id                 uuid references public.regions(id) on delete cascade,
  priority                  text not null check (priority in ('low','medium','high','urgent')),
  first_response_mins       int not null,
  attendance_mins           int not null,
  resolution_mins           int not null,
  quote_review_mins         int not null default 1440,
  quote_approval_mins       int not null default 2880,
  instruction_mins          int not null default 1440,
  store_access_mins         int not null default 1440,
  escalation_response_mins  int not null default 480,
  completion_confirm_mins   int not null default 2880,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index sla_rules_global_priority on public.sla_rules (priority)           where region_id is null;
create unique index sla_rules_region_priority on public.sla_rules (region_id, priority) where region_id is not null;

-- ─────────────────────────────────────────
-- REPEAT DEFECT GROUPS (referenced by tickets)
-- ─────────────────────────────────────────
create table public.repeat_defect_groups (
  id                uuid primary key default uuid_generate_v4(),
  store_id          uuid references public.profiles(id) on delete cascade,
  region_id         uuid references public.regions(id)  on delete set null,
  category          text,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  occurrence_count  int not null default 0,
  window_days       int not null default 30,
  first_seen_at     timestamptz,
  last_seen_at      timestamptz,
  root_cause        text,
  suggested_action  text,
  status            text not null default 'open' check (status in ('open','monitoring','resolved')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index rdg_store_idx  on public.repeat_defect_groups (store_id);
create index rdg_region_idx on public.repeat_defect_groups (region_id);

-- ─────────────────────────────────────────
-- TICKETS (full final shape). assigned_user_id / blocker_owner_id are plain
-- uuids on purpose — extra FKs to profiles make PostgREST `profiles(...)` embeds
-- ambiguous and break ticket queries.
-- ─────────────────────────────────────────
create table public.tickets (
  id             uuid primary key default uuid_generate_v4(),
  job_number     bigint default nextval('public.tickets_job_number_seq'),
  client_id      uuid not null references public.profiles(id) on delete cascade,  -- the store
  region_id      uuid references public.regions(id) on delete set null,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  assigned_user_id uuid,
  title          text not null,
  description    text not null,
  priority       text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status         text not null default 'open' check (status in (
                   'open','quoted','accepted','in_progress','completed','cancelled','declined',
                   'pending_sign_off','snag','snag_in_progress','variation_pending','variation_accepted')),
  photo_urls     text[] default '{}',
  -- classification & impact
  category               text,
  subcategory            text,
  asset_id               text,
  severity               text default 'medium' check (severity in ('low','medium','high','critical')),
  operational_impact     text,
  safety_risk_flag       boolean not null default false,
  trading_impact_flag    boolean not null default false,
  customer_visible_flag  boolean not null default false,
  staff_impact_flag      boolean not null default false,
  closed_at              timestamptz,
  -- supplier SLA timestamps
  first_response_due_at  timestamptz,
  first_response_at      timestamptz,
  attendance_due_at      timestamptz,
  attended_at            timestamptz,
  -- quote lifecycle
  quote_required          boolean not null default false,
  quote_requested_at      timestamptz,
  quote_due_at            timestamptz,
  quote_submitted_at      timestamptz,
  quote_value             numeric(12,2),
  quote_approval_required boolean not null default false,
  quote_approval_status   text check (quote_approval_status in ('pending','approved','rejected')),
  quote_approved_at       timestamptz,
  quote_rejected_at       timestamptz,
  -- resolution
  resolution_due_at           timestamptz,
  adjusted_resolution_due_at  timestamptz,
  completed_at                timestamptz,
  -- dual SLA cache
  supplier_sla_status   text,
  internal_sla_status   text,
  sla_paused            boolean not null default false,
  pause_reason          text,
  pause_started_at      timestamptz,
  pause_ended_at        timestamptz,
  total_paused_minutes  int not null default 0,
  -- blocker
  current_blocker        text,
  blocker_owner_type     text,
  blocker_owner_id       uuid,
  blocker_started_at     timestamptz,
  internal_action_due_at timestamptz,
  delay_owner            text,
  -- repeat defects
  repeat_defect_flag     boolean not null default false,
  repeat_defect_group_id uuid references public.repeat_defect_groups(id) on delete set null,
  -- evidence
  evidence_required               boolean not null default false,
  before_photo_uploaded           boolean not null default false,
  after_photo_uploaded            boolean not null default false,
  completion_certificate_uploaded boolean not null default false,
  invoice_uploaded                boolean not null default false,
  -- store confirmation
  store_confirmation_required boolean not null default false,
  store_confirmed_at          timestamptz,
  -- freshness
  last_supplier_update_at timestamptz,
  last_internal_update_at timestamptz,
  last_store_update_at    timestamptz,
  -- cached health
  ticket_health_score   int,
  ticket_health_status  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter sequence public.tickets_job_number_seq owned by public.tickets.job_number;
create index tickets_client_id_idx on public.tickets (client_id);
create index tickets_status_idx    on public.tickets (status);
create index tickets_region_idx    on public.tickets (region_id);
create index tickets_supplier_idx  on public.tickets (supplier_id);
create index tickets_repeat_idx    on public.tickets (repeat_defect_group_id);
create index tickets_severity_idx  on public.tickets (severity);

-- ─────────────────────────────────────────
-- QUOTES
-- ─────────────────────────────────────────
create table public.quotes (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  admin_id        uuid not null references public.profiles(id),   -- the supplier user
  type            text not null default 'quote' check (type in ('quote','variation')),
  amount          numeric(10,2) not null,
  amount_incl_vat numeric(12,2),
  description     text not null,
  valid_until     date,
  file_url        text,
  status          text not null default 'pending' check (status in ('pending','accepted','declined')),
  decline_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index quotes_ticket_id_idx on public.quotes (ticket_id);

-- ─────────────────────────────────────────
-- COMPLETIONS (COC + POC sign-off)
-- ─────────────────────────────────────────
create table public.completions (
  id            uuid primary key default uuid_generate_v4(),
  ticket_id     uuid not null references public.tickets(id) on delete cascade,
  admin_id      uuid not null references public.profiles(id),
  coc_url       text,
  poc_urls      text[] default '{}',
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  notes         text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index completions_ticket_idx on public.completions (ticket_id);

-- ─────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read);

-- ─────────────────────────────────────────
-- RATINGS (client/RM rates the supplier on completion)
-- ─────────────────────────────────────────
create table public.ratings (
  id            uuid primary key default uuid_generate_v4(),
  ticket_id     uuid references public.tickets(id) on delete cascade,
  contractor_id uuid references public.profiles(id) on delete cascade,  -- supplier user
  score         int not null check (score between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);
create index ratings_contractor_idx on public.ratings (contractor_id);

-- ─────────────────────────────────────────
-- PUSH SUBSCRIPTIONS (web-push) — service-role managed
-- ─────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ─────────────────────────────────────────
-- WHATSAPP SESSIONS (intake bot) — service-role/webhook managed
-- ─────────────────────────────────────────
create table public.whatsapp_sessions (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  title       text not null,
  description text not null,
  priority    text not null default 'medium',
  photo_urls  text[] not null default '{}',
  status      text not null default 'awaiting_photos',
  created_at  timestamptz not null default now()
);
create index whatsapp_sessions_phone_status_idx on public.whatsapp_sessions (phone, status);

-- ─────────────────────────────────────────
-- DASHBOARDS v2 — SLA events / blockers / evidence / approvals
-- ─────────────────────────────────────────
create table public.ticket_sla_events (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_type text not null, sla_kind text,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb, created_at timestamptz not null default now()
);
create index tse_ticket_idx on public.ticket_sla_events (ticket_id, created_at);

create table public.ticket_blockers (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  blocker_type text not null, owner_type text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(), resolved_at timestamptz,
  notes text, created_at timestamptz not null default now()
);
create index tb_ticket_idx on public.ticket_blockers (ticket_id);
create index tb_open_idx   on public.ticket_blockers (resolved_at) where resolved_at is null;

create table public.ticket_evidence (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind text not null, url text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index te_ticket_idx on public.ticket_evidence (ticket_id);

create table public.approvals (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid references public.tickets(id) on delete cascade,
  quote_id  uuid references public.quotes(id)  on delete set null,
  approval_type text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  requested_from uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz, due_at timestamptz, amount numeric(12,2), reason text,
  created_at timestamptz not null default now()
);
create index approvals_ticket_idx on public.approvals (ticket_id);
create index approvals_status_idx on public.approvals (status) where status = 'pending';

-- ─────────────────────────────────────────
-- DASHBOARDS v2 — health snapshot tables
-- ─────────────────────────────────────────
create table public.store_health_scores (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  snapshot_date date not null default current_date,
  operational_risk_score numeric, sla_score numeric, ticket_load_score numeric,
  repeat_defect_score numeric, commercial_blocker_score numeric, data_quality_score numeric,
  calculated_health_score numeric, calculated_rag_status text,
  override_applied boolean default false, override_reason text,
  final_health_score numeric, final_rag_status text,
  open_tickets int, overdue_tickets int, main_issue text,
  created_at timestamptz not null default now(),
  unique (store_id, snapshot_date)
);
create index shs_region_date_idx on public.store_health_scores (region_id, snapshot_date);

create table public.regional_health_scores (
  id uuid primary key default uuid_generate_v4(),
  region_id uuid not null references public.regions(id) on delete cascade,
  snapshot_date date not null default current_date,
  average_store_health numeric, risk_penalty numeric, final_portfolio_health numeric, rag_status text,
  active_stores int, green_count int, amber_count int, red_count int, critical_count int,
  open_tickets int, overdue_tickets int, supplier_sla_breaches int, internal_sla_breaches int,
  cost_exposure numeric, main_reason text,
  created_at timestamptz not null default now(),
  unique (region_id, snapshot_date)
);

create table public.executive_estate_health_scores (
  id uuid primary key default uuid_generate_v4(),
  snapshot_date date not null default current_date,
  weighted_regional_health numeric, risk_penalty numeric, final_estate_health numeric, rag_status text,
  total_active_stores int, green_count int, amber_count int, red_count int, critical_count int,
  open_tickets int, critical_tickets int, supplier_sla_breaches int, internal_sla_breaches int,
  quotes_awaiting_approval int, cost_exposure numeric, main_risk_driver text,
  created_at timestamptz not null default now(),
  unique (snapshot_date)
);

create table public.supplier_performance_scores (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  snapshot_date date not null default current_date,
  assigned_tickets int, completed_tickets int, sla_breaches int,
  avg_response_mins numeric, avg_resolution_mins numeric, first_time_fix_rate numeric,
  repeat_defect_involvement int, evidence_completion_rate numeric, escalation_count int,
  performance_score numeric, performance_band text,
  created_at timestamptz not null default now()
);
create index sps_supplier_date_idx on public.supplier_performance_scores (supplier_id, snapshot_date);
create index sps_region_date_idx   on public.supplier_performance_scores (region_id, snapshot_date);

create table public.dashboard_snapshots (
  id uuid primary key default uuid_generate_v4(),
  scope text not null, scope_id uuid, snapshot_date date not null default current_date,
  payload jsonb not null, created_at timestamptz not null default now()
);
create index ds_scope_idx on public.dashboard_snapshots (scope, scope_id, snapshot_date);

create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, entity_type text, entity_id uuid, metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_actor_idx  on public.audit_logs (actor_id, created_at);

-- ─────────────────────────────────────────
-- FUNCTIONS (security definer pinned to public search_path = hardening)
-- ─────────────────────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.set_ticket_region()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.region_id is null then
    select region_id into new.region_id from public.profiles where id = new.client_id;
  end if;
  return new;
end $$;

create or replace function public.append_session_photo(session_id uuid, photo_url text)
returns text[] language sql security definer set search_path = public as $$
  update public.whatsapp_sessions set photo_urls = array_append(photo_urls, photo_url)
  where id = session_id returning photo_urls;
$$;

-- Signup trigger. NOTE: executive is self-selectable here (open exec signup,
-- per product decision). Lock to ('store_manager','regional_manager') to disable.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_branch_code text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'store_manager');
  if v_role not in ('store_manager','regional_manager','executive') then v_role := 'store_manager'; end if;
  v_branch_code := upper(trim(coalesce(new.raw_user_meta_data->>'branch_code','')));
  if v_branch_code = '' then v_branch_code := null; end if;
  insert into public.profiles (id, email, role, full_name, phone, address, company_name, sub_store, branch_code)
  values (new.id, new.email, v_role,
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address', new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'sub_store', v_branch_code)
  on conflict (id) do update set
    role=excluded.role, full_name=excluded.full_name, phone=excluded.phone,
    address=excluded.address, company_name=excluded.company_name, sub_store=excluded.sub_store,
    branch_code=coalesce(excluded.branch_code, public.profiles.branch_code);
  return new;
end $$;

-- ─────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

create trigger suppliers_updated_at
  before update on public.suppliers for each row execute procedure public.set_updated_at();

drop trigger if exists trg_set_ticket_region on public.tickets;
create trigger trg_set_ticket_region
  before insert or update of client_id on public.tickets
  for each row execute function public.set_ticket_region();

-- ─────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- Enable on EVERY table. Tables with no policy are service-role only
-- (suppliers, push_subscriptions, whatsapp_sessions, analytics writes).
-- ─────────────────────────────────────────
alter table public.profiles                       enable row level security;
alter table public.suppliers                       enable row level security;
alter table public.regions                         enable row level security;
alter table public.sla_rules                        enable row level security;
alter table public.repeat_defect_groups            enable row level security;
alter table public.tickets                          enable row level security;
alter table public.quotes                           enable row level security;
alter table public.completions                      enable row level security;
alter table public.notifications                    enable row level security;
alter table public.ratings                          enable row level security;
alter table public.push_subscriptions              enable row level security;
alter table public.whatsapp_sessions               enable row level security;
alter table public.ticket_sla_events               enable row level security;
alter table public.ticket_blockers                 enable row level security;
alter table public.ticket_evidence                 enable row level security;
alter table public.approvals                        enable row level security;
alter table public.store_health_scores             enable row level security;
alter table public.regional_health_scores          enable row level security;
alter table public.executive_estate_health_scores  enable row level security;
alter table public.supplier_performance_scores     enable row level security;
alter table public.dashboard_snapshots             enable row level security;
alter table public.audit_logs                       enable row level security;

-- PROFILES
create policy "Users can view their own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Suppliers can view all profiles"    on public.profiles for select using (public.get_my_role() = 'supplier');
create policy "Executives can view all profiles"   on public.profiles for select using (public.get_my_role() = 'executive');

-- TICKETS
create policy "Clients can view their own tickets"   on public.tickets for select using (auth.uid() = client_id);
create policy "Clients can insert their own tickets" on public.tickets for insert with check (auth.uid() = client_id);
create policy "Suppliers can view all tickets"       on public.tickets for select using (public.get_my_role() = 'supplier');
create policy "Suppliers can update all tickets"     on public.tickets for update using (public.get_my_role() = 'supplier');
create policy "Executives can view all tickets"      on public.tickets for select using (public.get_my_role() = 'executive');

-- QUOTES
create policy "Clients can view quotes on their tickets" on public.quotes for select
  using (exists (select 1 from public.tickets t where t.id = quotes.ticket_id and t.client_id = auth.uid()));
create policy "Clients can update quote status"          on public.quotes for update
  using (exists (select 1 from public.tickets t where t.id = quotes.ticket_id and t.client_id = auth.uid()));
create policy "Suppliers can view all quotes"   on public.quotes for select using (public.get_my_role() = 'supplier');
create policy "Suppliers can insert quotes"     on public.quotes for insert with check (public.get_my_role() = 'supplier');
create policy "Suppliers can update quotes"     on public.quotes for update using (public.get_my_role() = 'supplier');
create policy "Executives can view all quotes"  on public.quotes for select using (public.get_my_role() = 'executive');

-- NOTIFICATIONS (inserts happen via service role)
create policy "Users can view their own notifications"   on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update their own notifications" on public.notifications for update using (auth.uid() = user_id);

-- COMPLETIONS
create policy "Suppliers can manage completions"          on public.completions for all
  using (public.get_my_role() = 'supplier');
create policy "Regional managers can view completions"    on public.completions for select
  using (public.get_my_role() = 'regional_manager');
create policy "Regional managers can update completions"  on public.completions for update
  using (public.get_my_role() = 'regional_manager');
create policy "Executives can view completions"           on public.completions for select
  using (public.get_my_role() = 'executive');

-- RATINGS
create policy "Read ratings" on public.ratings for select
  using (contractor_id = auth.uid() or public.get_my_role() in ('regional_manager','executive'));

-- REGIONS / SLA RULES
create policy "Executives manage regions" on public.regions for all
  using (public.get_my_role() = 'executive') with check (public.get_my_role() = 'executive');
create policy "Staff read regions" on public.regions for select
  using (public.get_my_role() in ('executive','regional_manager','supplier'));
create policy "Executives manage sla_rules" on public.sla_rules for all
  using (public.get_my_role() = 'executive') with check (public.get_my_role() = 'executive');
create policy "Staff read sla_rules" on public.sla_rules for select
  using (public.get_my_role() in ('executive','regional_manager','supplier'));

-- ANALYTICS (exec read all; RM read their regions)
create policy "Exec read store_health" on public.store_health_scores for select using (public.get_my_role() = 'executive');
create policy "RM read store_health"   on public.store_health_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));
create policy "Exec read regional_health" on public.regional_health_scores for select using (public.get_my_role() = 'executive');
create policy "RM read regional_health"   on public.regional_health_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));
create policy "Exec read estate_health" on public.executive_estate_health_scores for select using (public.get_my_role() = 'executive');
create policy "Exec read supplier_perf" on public.supplier_performance_scores for select using (public.get_my_role() = 'executive');
create policy "RM read supplier_perf"   on public.supplier_performance_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));
create policy "Staff read snapshots" on public.dashboard_snapshots for select
  using (public.get_my_role() = 'executive'
    or (scope = 'region' and scope_id in (select id from public.regions where regional_manager_id = auth.uid())));
create policy "Staff read repeat_defects" on public.repeat_defect_groups for select
  using (public.get_my_role() in ('executive','supplier')
    or region_id in (select id from public.regions where regional_manager_id = auth.uid()));
create policy "Exec read audit" on public.audit_logs for select using (public.get_my_role() = 'executive');

-- TICKET-SCOPED history (supplier+exec all; RM their regions; store own)
create policy "Read sla_events" on public.ticket_sla_events for select using (
  public.get_my_role() in ('executive','supplier') or exists (
    select 1 from public.tickets t where t.id = ticket_sla_events.ticket_id
      and (t.client_id = auth.uid() or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))));
create policy "Read blockers" on public.ticket_blockers for select using (
  public.get_my_role() in ('executive','supplier') or exists (
    select 1 from public.tickets t where t.id = ticket_blockers.ticket_id
      and (t.client_id = auth.uid() or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))));
create policy "Read evidence" on public.ticket_evidence for select using (
  public.get_my_role() in ('executive','supplier') or exists (
    select 1 from public.tickets t where t.id = ticket_evidence.ticket_id
      and (t.client_id = auth.uid() or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))));
create policy "Supplier write evidence" on public.ticket_evidence for insert with check (public.get_my_role() = 'supplier');
create policy "Read approvals" on public.approvals for select using (
  public.get_my_role() in ('executive','supplier') or exists (
    select 1 from public.tickets t where t.id = approvals.ticket_id
      and (t.client_id = auth.uid() or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))));

-- ─────────────────────────────────────────
-- STORAGE — buckets (all public, matches current app) + policies
-- ─────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('ticket-photos',    'ticket-photos',    true),
  ('completion-docs',  'completion-docs',  true),
  ('quote-attachments','quote-attachments',true)
on conflict (id) do nothing;

create policy "Upload ticket photos"   on storage.objects for insert with check (bucket_id = 'ticket-photos'    and auth.role() = 'authenticated');
create policy "View ticket photos"     on storage.objects for select using       (bucket_id = 'ticket-photos');
create policy "Upload completion docs" on storage.objects for insert with check (bucket_id = 'completion-docs'  and auth.role() = 'authenticated');
create policy "View completion docs"   on storage.objects for select using       (bucket_id = 'completion-docs');
create policy "Upload quote attach"    on storage.objects for insert with check (bucket_id = 'quote-attachments' and auth.role() = 'authenticated');
create policy "View quote attach"      on storage.objects for select using       (bucket_id = 'quote-attachments');

-- ─────────────────────────────────────────
-- SEED — SLA rules (the only real seed). SA-market defaults; tune per region later.
-- ─────────────────────────────────────────
insert into public.sla_rules (region_id, priority, first_response_mins, attendance_mins, resolution_mins) values
  (null, 'urgent',   60,  240,  1440),
  (null, 'high',    240,  480,  2880),
  (null, 'medium',  480, 1440,  5760),
  (null, 'low',    1440, 2880, 10080)
on conflict do nothing;

-- ============================================================
-- DONE. Next:
--  1) Create your first executive: sign up in the app (Executive role) OR
--     create a user in Auth, then:
--        update public.profiles set role='executive' where email='you@co.za';
--  2) Auth settings + env vars: docs/MIGRATE_TO_NEW_SUPABASE.md §7–§8.
--  3) Deploy. Dashboards work immediately (compute live).
-- ============================================================
