-- ============================================================
-- MOTIV — SCHEMA v3 (Phase 1: multi-tenant, normalized, RLS)
--
-- Foundational rebuild. Supersedes clean_install.sql (v2).
-- Apply ONLY to a fresh project together with the v3 code refactor —
-- the v2-deployed app will not run against this until pages are rewired.
--
-- Tenancy:   companies → regions → stores; suppliers per company.
-- Identity:  auth.users → user_profiles(company_id, role) + link tables.
-- Isolation: company_id everywhere; region/branch/supplier scoping via links.
-- Idempotent-ish: drop/create. Run top-to-bottom.
-- ============================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────
-- 1. TENANCY + IDENTITY
-- ─────────────────────────────────────────
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.roles (
  key   text primary key,
  label text not null
);
insert into public.roles (key, label) values
  ('executive','Executive'),
  ('regional_manager','Regional Manager'),
  ('store_manager','Store Manager'),
  ('supplier','Supplier'),
  ('system_admin','System Admin')
on conflict (key) do nothing;

-- One profile per auth user. company_id = tenant. role = access tier.
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  role        text not null default 'store_manager' references public.roles(key),
  full_name   text,
  email       text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists user_profiles_company_idx on public.user_profiles (company_id);

create table if not exists public.regions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  region_code text not null,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, region_code)
);
create index if not exists regions_company_idx on public.regions (company_id);

create table if not exists public.stores (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  region_id      uuid references public.regions(id) on delete set null,
  region_code    text,
  branch_code    text not null,
  name           text not null,
  sub_store      text,
  address        text,
  capex_budget   numeric(12,2),
  active         boolean not null default true,
  closed_at      timestamptz,
  closure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, branch_code)
);
create index if not exists stores_company_idx on public.stores (company_id);
create index if not exists stores_region_idx  on public.stores (region_id);

create table if not exists public.suppliers (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references public.companies(id) on delete cascade,
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
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists suppliers_company_idx on public.suppliers (company_id);

-- Link tables (a user may map to many stores/regions; a supplier to many users)
create table if not exists public.store_users (
  user_id  uuid not null references public.user_profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  primary key (user_id, store_id)
);
create table if not exists public.regional_users (
  user_id   uuid not null references public.user_profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  primary key (user_id, region_id)
);
create table if not exists public.supplier_users (
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  primary key (user_id, supplier_id)
);

-- ─────────────────────────────────────────
-- 2. SLA CONFIG (per company; P1–P4)
-- ─────────────────────────────────────────
create table if not exists public.sla_rules (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid references public.companies(id) on delete cascade, -- NULL = platform default
  priority                 text not null check (priority in ('P1','P2','P3','P4')),
  first_response_mins      int not null,
  attendance_mins          int not null,
  quote_due_mins           int not null,
  resolution_mins          int not null,
  internal_decision_mins   int not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists sla_rules_default_priority on public.sla_rules (priority)             where company_id is null;
create unique index if not exists sla_rules_company_priority on public.sla_rules (company_id, priority)  where company_id is not null;

-- ─────────────────────────────────────────
-- 3. REPEAT DEFECT GROUPS (referenced by tickets)
-- ─────────────────────────────────────────
create table if not exists public.repeat_defect_groups (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  store_id         uuid references public.stores(id) on delete cascade,
  region_id        uuid references public.regions(id) on delete set null,
  category         text,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  occurrence_count int not null default 0,
  window_days      int not null default 30,
  first_seen_at    timestamptz,
  last_seen_at     timestamptz,
  root_cause       text,
  suggested_action text,
  status           text not null default 'open' check (status in ('open','monitoring','resolved')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rdg_company_idx on public.repeat_defect_groups (company_id);

-- ─────────────────────────────────────────
-- 4. TICKETS (full spec shape). assigned_user_id / blocker_owner_id are plain
--    uuids (avoid multiple FKs to one table → PostgREST embed ambiguity).
-- ─────────────────────────────────────────
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  job_number     bigint,                                  -- per-company sequence assigned in app/trigger
  company_id     uuid not null references public.companies(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  branch_code    text,
  region_id      uuid references public.regions(id) on delete set null,
  region_code    text,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  created_by     uuid references public.user_profiles(id) on delete set null,
  assigned_user_id uuid,
  -- classification & impact
  category               text,
  subcategory            text,
  asset_id               uuid,                            -- future asset register
  title                  text not null,
  description            text not null,
  priority               text not null default 'P3' check (priority in ('P1','P2','P3','P4')),
  severity               text default 'medium' check (severity in ('low','medium','high','critical')),
  operational_impact     text default 'none'
                          check (operational_impact in ('none','cosmetic','customer_visible','staff_inconvenience','trading_affected','safety_risk','cannot_trade')),
  safety_risk_flag       boolean not null default false,
  trading_impact_flag    boolean not null default false,
  customer_visible_flag  boolean not null default false,
  staff_impact_flag      boolean not null default false,
  status                 text not null default 'open' check (status in (
                           'open','acknowledged','in_progress','quoted','awaiting_decision',
                           'on_hold','submitted_for_signoff','snag','completed','cancelled','declined')),
  photo_urls             text[] default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz,
  -- supplier SLA
  first_response_due_at  timestamptz,
  first_response_at      timestamptz,
  attendance_due_at      timestamptz,
  attended_at            timestamptz,
  -- quote lifecycle
  quote_required           boolean not null default false,
  quote_requested_at       timestamptz,
  quote_due_at             timestamptz,
  quote_submitted_at       timestamptz,
  quote_value              numeric(12,2),
  quote_decision_required  boolean not null default false,
  quote_decision_status    text check (quote_decision_status in ('pending','approved','rejected')),
  quote_decided_at         timestamptz,
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
  -- store confirmation / signoff
  store_confirmation_required boolean not null default false,
  store_confirmed_at          timestamptz,
  submitted_for_signoff_at    timestamptz,
  signoff_status              text check (signoff_status in ('submitted','awaiting_regional','awaiting_store','accepted','rejected')),
  -- freshness
  last_supplier_update_at timestamptz,
  last_internal_update_at timestamptz,
  last_store_update_at    timestamptz,
  -- cached health
  ticket_health_score   int,
  ticket_health_status  text
);
create index if not exists tickets_company_idx  on public.tickets (company_id);
create index if not exists tickets_store_idx     on public.tickets (store_id);
create index if not exists tickets_region_idx    on public.tickets (region_id);
create index if not exists tickets_supplier_idx  on public.tickets (supplier_id);
create index if not exists tickets_status_idx    on public.tickets (status);

create table if not exists public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.user_profiles(id) on delete set null,
  author_role text,
  body text,
  created_at timestamptz not null default now()
);
create index if not exists ticket_updates_ticket_idx on public.ticket_updates (ticket_id, created_at);

create table if not exists public.ticket_sla_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_type text not null, sla_kind text,
  actor_id uuid references public.user_profiles(id) on delete set null,
  metadata jsonb, created_at timestamptz not null default now()
);
create index if not exists tse_ticket_idx on public.ticket_sla_events (ticket_id, created_at);

create table if not exists public.ticket_blockers (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  blocker_type text not null, owner_type text not null,
  owner_id uuid references public.user_profiles(id) on delete set null,
  started_at timestamptz not null default now(), resolved_at timestamptz,
  notes text, created_at timestamptz not null default now()
);
create index if not exists tb_ticket_idx on public.ticket_blockers (ticket_id);

create table if not exists public.ticket_evidence (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  kind text not null, url text not null,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists te_ticket_idx on public.ticket_evidence (ticket_id);

-- ─────────────────────────────────────────
-- 5. QUOTES / APPROVALS / SIGNOFFS / SNAGS
-- ─────────────────────────────────────────
create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  submitted_by    uuid references public.user_profiles(id) on delete set null,
  type            text not null default 'quote' check (type in ('quote','variation')),
  amount          numeric(12,2) not null,
  amount_incl_vat numeric(12,2),
  description     text,
  valid_until     date,
  file_url        text,
  status          text not null default 'pending' check (status in ('pending','accepted','declined','revision_requested')),
  decline_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists quotes_ticket_idx on public.quotes (ticket_id);

create table if not exists public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null, qty numeric(12,2) default 1, unit_price numeric(12,2) default 0,
  line_total numeric(12,2), created_at timestamptz not null default now()
);
create index if not exists qli_quote_idx on public.quote_line_items (quote_id);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  quote_id  uuid references public.quotes(id) on delete set null,
  approval_type text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  requested_from uuid references public.user_profiles(id) on delete set null,
  decided_by uuid references public.user_profiles(id) on delete set null,
  decided_at timestamptz, due_at timestamptz, amount numeric(12,2), reason text,
  created_at timestamptz not null default now()
);
create index if not exists approvals_ticket_idx on public.approvals (ticket_id);

create table if not exists public.signoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  coc_url text, before_urls text[] default '{}', after_urls text[] default '{}', invoice_url text,
  notes text,
  store_confirmed_at timestamptz,
  status text not null default 'submitted' check (status in ('submitted','awaiting_regional','awaiting_store','accepted','rejected')),
  reject_reason text,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signoffs_ticket_idx on public.signoffs (ticket_id);

create table if not exists public.snags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category text, severity text, description text, required_correction text,
  evidence_urls text[] default '{}',
  owner_id uuid references public.user_profiles(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','resolved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists snags_company_idx on public.snags (company_id);

-- ─────────────────────────────────────────
-- 6. HEALTH SNAPSHOTS + PERFORMANCE + DECISIONS
-- ─────────────────────────────────────────
create table if not exists public.store_health_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  snapshot_date date not null default current_date,
  operational_risk_score numeric, sla_score numeric, ticket_load_score numeric,
  repeat_defect_score numeric, commercial_blocker_score numeric, data_quality_score numeric,
  calculated_health_score numeric, calculated_status text,
  override_applied boolean default false, override_reason text,
  final_health_score numeric, final_status text,
  open_tickets int, overdue_tickets int, main_issue text,
  created_at timestamptz not null default now(),
  unique (store_id, snapshot_date)
);

create table if not exists public.regional_health_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  snapshot_date date not null default current_date,
  average_store_health numeric, risk_penalty numeric, final_portfolio_health numeric, status text,
  active_stores int, controlled_count int, attention_count int, at_risk_count int, critical_count int,
  open_tickets int, overdue_tickets int, supplier_sla_breaches int, internal_sla_breaches int,
  cost_exposure numeric, main_reason text,
  created_at timestamptz not null default now(),
  unique (region_id, snapshot_date)
);

create table if not exists public.estate_health_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_date date not null default current_date,
  weighted_regional_health numeric, risk_penalty numeric, final_estate_health numeric, status text,
  total_active_stores int, controlled_count int, attention_count int, at_risk_count int, critical_count int,
  open_tickets int, critical_tickets int, supplier_sla_breaches int, internal_sla_breaches int,
  decisions_pending int, cost_exposure numeric, main_risk_driver text,
  created_at timestamptz not null default now(),
  unique (company_id, snapshot_date)
);

create table if not exists public.supplier_performance_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  snapshot_date date not null default current_date,
  assigned_tickets int, completed_tickets int, sla_breaches int,
  avg_response_mins numeric, avg_resolution_mins numeric, first_time_fix_rate numeric,
  repeat_defect_involvement int, evidence_completion_rate numeric, escalation_count int,
  performance_score numeric, performance_band text,
  created_at timestamptz not null default now()
);
create index if not exists sps_supplier_idx on public.supplier_performance_scores (supplier_id, snapshot_date);

create table if not exists public.decision_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null,            -- Approve Investment | Escalate Supplier | Reallocate Budget | Accept Risk | Policy Exception | Review Contract | Change Strategy | Monitor
  title text not null,
  context text, main_driver text,
  business_impact text, exposure_value numeric(12,2),
  urgency text, recommended_action text,
  owner_id uuid references public.user_profiles(id) on delete set null,
  region_id uuid references public.regions(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  priority int default 0, due_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decisions_company_idx on public.decision_items (company_id, status);

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope text not null, scope_id uuid, snapshot_date date not null default current_date,
  payload jsonb not null, created_at timestamptz not null default now()
);
create index if not exists ds_scope_idx on public.dashboard_snapshots (company_id, scope, scope_id, snapshot_date);

-- ─────────────────────────────────────────
-- 7. REPORTS / NOTIFICATIONS / PUSH / AUDIT
-- ─────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role_scope text not null, report_type text not null, params jsonb,
  generated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  exported_by uuid references public.user_profiles(id) on delete set null,
  format text, file_url text, created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null, title text not null, message text not null, link text,
  read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  actor_id uuid references public.user_profiles(id) on delete set null,
  action text not null, entity_type text, entity_id uuid, metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_company_idx on public.audit_logs (company_id, created_at);

-- ─────────────────────────────────────────
-- 8. FUTURE — asset register / preventative maintenance (stubs, design-ready)
-- ─────────────────────────────────────────
create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, default_pm_interval_days int
);
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  category_id uuid references public.asset_categories(id) on delete set null,
  name text not null, asset_code text, serial_number text, installed_at date,
  status text default 'active', created_at timestamptz not null default now()
);
create table if not exists public.asset_health_scores (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  snapshot_date date not null default current_date, score numeric, status text,
  created_at timestamptz not null default now()
);
create table if not exists public.preventative_maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  name text not null, interval_days int not null, active boolean default true,
  created_at timestamptz not null default now()
);
create table if not exists public.preventative_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.preventative_maintenance_plans(id) on delete cascade,
  due_at timestamptz, completed_at timestamptz, status text default 'scheduled',
  ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.asset_service_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  serviced_at timestamptz, notes text, created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 9. RLS HELPERS (security definer → no recursion). Pinned search_path.
-- ─────────────────────────────────────────
create or replace function public.app_company_id() returns uuid
  language sql security definer stable set search_path = public as $$
  select company_id from public.user_profiles where id = auth.uid();
$$;
create or replace function public.app_role() returns text
  language sql security definer stable set search_path = public as $$
  select role from public.user_profiles where id = auth.uid();
$$;
create or replace function public.app_region_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
  select region_id from public.regional_users where user_id = auth.uid();
$$;
create or replace function public.app_store_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
  select store_id from public.store_users where user_id = auth.uid();
$$;
create or replace function public.app_supplier_ids() returns setof uuid
  language sql security definer stable set search_path = public as $$
  select supplier_id from public.supplier_users where user_id = auth.uid();
$$;
-- Company-wide roles (see everything in their company)
create or replace function public.app_is_company_wide() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select role in ('executive','system_admin') from public.user_profiles where id = auth.uid()), false);
$$;

-- new-user trigger → user_profiles from signup metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role text; v_company uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role','store_manager');
  if v_role not in ('executive','regional_manager','store_manager','supplier','system_admin') then v_role := 'store_manager'; end if;
  begin v_company := nullif(new.raw_user_meta_data->>'company_id','')::uuid; exception when others then v_company := null; end;
  insert into public.user_profiles (id, email, role, full_name, phone, company_id)
  values (new.id, new.email, v_role, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_company)
  on conflict (id) do update set
    role=excluded.role, full_name=excluded.full_name, phone=excluded.phone,
    company_id=coalesce(excluded.company_id, public.user_profiles.company_id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ─────────────────────────────────────────
-- 10. ROW-LEVEL SECURITY
--   Pattern per business table: company match AND role scope.
--   company-wide (exec/system_admin) see all in company. RM/store/supplier scoped.
-- ─────────────────────────────────────────
alter table public.companies        enable row level security;
alter table public.roles             enable row level security;
alter table public.user_profiles     enable row level security;
alter table public.regions           enable row level security;
alter table public.stores            enable row level security;
alter table public.suppliers         enable row level security;
alter table public.store_users       enable row level security;
alter table public.regional_users    enable row level security;
alter table public.supplier_users    enable row level security;
alter table public.sla_rules         enable row level security;
alter table public.repeat_defect_groups enable row level security;
alter table public.tickets           enable row level security;
alter table public.ticket_updates    enable row level security;
alter table public.ticket_sla_events enable row level security;
alter table public.ticket_blockers   enable row level security;
alter table public.ticket_evidence   enable row level security;
alter table public.quotes            enable row level security;
alter table public.quote_line_items  enable row level security;
alter table public.approvals         enable row level security;
alter table public.signoffs          enable row level security;
alter table public.snags             enable row level security;
alter table public.store_health_scores    enable row level security;
alter table public.regional_health_scores enable row level security;
alter table public.estate_health_scores   enable row level security;
alter table public.supplier_performance_scores enable row level security;
alter table public.decision_items    enable row level security;
alter table public.dashboard_snapshots enable row level security;
alter table public.reports           enable row level security;
alter table public.report_exports    enable row level security;
alter table public.notifications     enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_logs        enable row level security;

-- roles lookup: readable by all authenticated
create policy "read roles" on public.roles for select using (auth.role() = 'authenticated');

-- own profile + company-wide read of company members
create policy "own profile read"   on public.user_profiles for select using (id = auth.uid());
create policy "own profile update" on public.user_profiles for update using (id = auth.uid());
create policy "company members read" on public.user_profiles for select
  using (company_id = public.app_company_id() and public.app_is_company_wide());

-- companies: members read their company; system_admin manages
create policy "read own company" on public.companies for select using (id = public.app_company_id());
create policy "admin manage company" on public.companies for all
  using (id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (id = public.app_company_id() and public.app_role() = 'system_admin');

-- link tables: a user reads their own links; company-wide read all in company; admin writes
create policy "read own store links" on public.store_users for select using (user_id = auth.uid() or public.app_is_company_wide());
create policy "read own region links" on public.regional_users for select using (user_id = auth.uid() or public.app_is_company_wide());
create policy "read own supplier links" on public.supplier_users for select using (user_id = auth.uid() or public.app_is_company_wide());

-- regions: company-wide see all; RM sees their regions
create policy "regions read" on public.regions for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide() or id in (select public.app_region_ids())));
create policy "regions admin" on public.regions for all
  using (company_id = public.app_company_id() and public.app_role() = 'system_admin')
  with check (company_id = public.app_company_id() and public.app_role() = 'system_admin');

-- stores: company-wide all; RM by region; store_manager by store
create policy "stores read" on public.stores for select
  using (company_id = public.app_company_id() and (
    public.app_is_company_wide()
    or region_id in (select public.app_region_ids())
    or id in (select public.app_store_ids())));
create policy "stores admin" on public.stores for all
  using (company_id = public.app_company_id() and public.app_role() in ('system_admin','regional_manager'))
  with check (company_id = public.app_company_id() and public.app_role() in ('system_admin','regional_manager'));

-- suppliers: company-wide all; supplier sees own; RM sees company suppliers
create policy "suppliers read" on public.suppliers for select
  using (company_id = public.app_company_id() and (
    public.app_is_company_wide() or public.app_role() = 'regional_manager'
    or id in (select public.app_supplier_ids())));
create policy "suppliers admin" on public.suppliers for all
  using (company_id = public.app_company_id() and public.app_role() in ('system_admin','regional_manager','executive'))
  with check (company_id = public.app_company_id() and public.app_role() in ('system_admin','regional_manager','executive'));

-- sla_rules: company read; admin/exec manage
create policy "sla read" on public.sla_rules for select
  using (company_id is null or company_id = public.app_company_id());
create policy "sla manage" on public.sla_rules for all
  using (company_id = public.app_company_id() and public.app_role() in ('system_admin','executive'))
  with check (company_id = public.app_company_id() and public.app_role() in ('system_admin','executive'));

-- TICKETS — the central scope gate
create policy "tickets read" on public.tickets for select
  using (company_id = public.app_company_id() and (
    public.app_is_company_wide()
    or region_id in (select public.app_region_ids())
    or store_id  in (select public.app_store_ids())
    or supplier_id in (select public.app_supplier_ids())));
create policy "tickets insert" on public.tickets for insert
  with check (company_id = public.app_company_id() and (
    public.app_role() in ('system_admin','executive','regional_manager')
    or store_id in (select public.app_store_ids())));        -- store mgr logs for own store
create policy "tickets update" on public.tickets for update
  using (company_id = public.app_company_id() and (
    public.app_is_company_wide()
    or region_id in (select public.app_region_ids())
    or supplier_id in (select public.app_supplier_ids())));   -- suppliers update assigned

-- Helper predicate reused: ticket visible to me
create or replace function public.app_can_see_ticket(t_id uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.tickets t where t.id = t_id
    and t.company_id = public.app_company_id()
    and (public.app_is_company_wide()
      or t.region_id in (select public.app_region_ids())
      or t.store_id  in (select public.app_store_ids())
      or t.supplier_id in (select public.app_supplier_ids())));
$$;

-- ticket children: visible if parent ticket visible
create policy "ticket_updates read"  on public.ticket_updates  for select using (public.app_can_see_ticket(ticket_id));
create policy "ticket_updates write" on public.ticket_updates  for insert with check (public.app_can_see_ticket(ticket_id));
create policy "ticket_sla read"      on public.ticket_sla_events for select using (public.app_can_see_ticket(ticket_id));
create policy "ticket_blockers read" on public.ticket_blockers  for select using (public.app_can_see_ticket(ticket_id));
create policy "ticket_evidence read" on public.ticket_evidence  for select using (public.app_can_see_ticket(ticket_id));
create policy "ticket_evidence write" on public.ticket_evidence for insert with check (public.app_can_see_ticket(ticket_id));

create policy "quotes read"  on public.quotes  for select using (public.app_can_see_ticket(ticket_id));
create policy "quotes write" on public.quotes  for insert with check (company_id = public.app_company_id() and public.app_can_see_ticket(ticket_id));
create policy "quotes update" on public.quotes for update using (company_id = public.app_company_id() and public.app_can_see_ticket(ticket_id));
create policy "qli read"  on public.quote_line_items for select using (exists (select 1 from public.quotes q where q.id = quote_id and public.app_can_see_ticket(q.ticket_id)));

create policy "approvals read"  on public.approvals for select using (company_id = public.app_company_id() and public.app_can_see_ticket(ticket_id));
create policy "approvals write" on public.approvals for all using (company_id = public.app_company_id() and (public.app_is_company_wide() or public.app_role()='regional_manager')) with check (company_id = public.app_company_id());

create policy "signoffs read"  on public.signoffs for select using (company_id = public.app_company_id() and public.app_can_see_ticket(ticket_id));
create policy "signoffs write" on public.signoffs for all using (company_id = public.app_company_id() and public.app_can_see_ticket(ticket_id)) with check (company_id = public.app_company_id());

create policy "snags read"  on public.snags for select using (company_id = public.app_company_id() and (
  public.app_is_company_wide() or store_id in (select public.app_store_ids())
  or supplier_id in (select public.app_supplier_ids())
  or store_id in (select s.id from public.stores s where s.region_id in (select public.app_region_ids()))));
create policy "snags write" on public.snags for all using (company_id = public.app_company_id() and (public.app_is_company_wide() or public.app_role()='regional_manager')) with check (company_id = public.app_company_id());

-- health + analytics: company-wide read all; RM read their regions/stores
create policy "store_health read" on public.store_health_scores for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide()
    or region_id in (select public.app_region_ids()) or store_id in (select public.app_store_ids())));
create policy "regional_health read" on public.regional_health_scores for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide() or region_id in (select public.app_region_ids())));
create policy "estate_health read" on public.estate_health_scores for select
  using (company_id = public.app_company_id() and public.app_is_company_wide());
create policy "supplier_perf read" on public.supplier_performance_scores for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide()
    or region_id in (select public.app_region_ids()) or supplier_id in (select public.app_supplier_ids())));
create policy "decisions read" on public.decision_items for select
  using (company_id = public.app_company_id() and public.app_is_company_wide());
create policy "decisions write" on public.decision_items for all
  using (company_id = public.app_company_id() and public.app_is_company_wide()) with check (company_id = public.app_company_id());
create policy "snapshots read" on public.dashboard_snapshots for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide()
    or (scope='region' and scope_id in (select public.app_region_ids()))));
create policy "repeat_defects read" on public.repeat_defect_groups for select
  using (company_id = public.app_company_id() and (public.app_is_company_wide()
    or region_id in (select public.app_region_ids()) or supplier_id in (select public.app_supplier_ids())));

-- reports / exports: own company; created by self or company-wide
create policy "reports read" on public.reports for select using (company_id = public.app_company_id());
create policy "reports write" on public.reports for insert with check (company_id = public.app_company_id());
create policy "exports read" on public.report_exports for select using (company_id = public.app_company_id());
create policy "exports write" on public.report_exports for insert with check (company_id = public.app_company_id());

-- notifications: own only
create policy "notif read"   on public.notifications for select using (user_id = auth.uid());
create policy "notif update" on public.notifications for update using (user_id = auth.uid());

-- push: own only
create policy "push manage" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit: system_admin/exec read company
create policy "audit read" on public.audit_logs for select
  using (company_id = public.app_company_id() and public.app_is_company_wide());

-- NOTE: server-side writes (notifications fan-out, snapshots, recompute, admin
-- provisioning) use the service-role key which BYPASSES RLS — these read
-- policies are the client-facing isolation guarantee.

-- ─────────────────────────────────────────
-- 11. SEED — platform-default SLA rules (P1–P4). Per spec §13.
-- ─────────────────────────────────────────
insert into public.sla_rules (company_id, priority, first_response_mins, attendance_mins, quote_due_mins, resolution_mins, internal_decision_mins) values
  (null,'P1',   60,  240,  240,   240,  240),   -- 1h / 4h / 4h / 4h (resolution) / 4h
  (null,'P2',  240,  480,  480,  1440,  480),   -- 4h / 1bd / 1bd / 1 day (resolution) / 1bd
  (null,'P3', 1440, 2880, 2880,  7200, 2880),   -- 1bd / 2bd / 2bd / 5 days (resolution) / 2bd
  (null,'P4', 2880, 7200, 7200, 10080, 7200)    -- 2bd / 5bd / 5bd / 7 days (resolution) / 5bd
on conflict do nothing;

-- ============================================================
-- Phase 1 · Step 1 complete (schema + roles + RLS).
-- NEXT (Phase 1 · Step 2): align health engine to spec §7 exact bands +
-- P1–P4 auto-priority + executive data-model loaders against these tables.
-- Then: refactor app pages onto v3, build System Admin module.
-- Seed a company + system_admin before first login:
--   insert into companies (name) values ('Motiv') returning id;
--   update user_profiles set company_id = '<id>', role='system_admin' where email='you@co.za';
-- ============================================================
