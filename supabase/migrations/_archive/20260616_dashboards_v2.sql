-- ============================================================
-- Motiv Migration — Dashboards v2
-- Regional Manager + Executive decision-driven dashboards.
--
-- Run this in the Supabase SQL Editor (https://app.supabase.com).
-- Fully idempotent: safe to re-run. Additive only — every new ticket
-- column is nullable/defaulted so existing tickets keep working and the
-- scoring engine degrades gracefully (low Data Quality Score) where data
-- is missing.
--
-- Apply AFTER all existing migrations. Pairs with the code release that
-- adds the `executive` role + /executive routes.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- 0. Role helper (defensive create — already used by earlier migrations)
-- ─────────────────────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ─────────────────────────────────────────
-- 1. Add the `executive` role
-- ─────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'supplier', 'store_manager', 'regional_manager', 'executive'));

-- ─────────────────────────────────────────
-- 2. REGIONS  (a store belongs to a region; a region has an assigned RM)
-- ─────────────────────────────────────────
create table if not exists public.regions (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  code                 text unique,
  regional_manager_id  uuid references public.profiles(id) on delete set null,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists regions_rm_idx on public.regions (regional_manager_id);

-- store → region link
alter table public.profiles add column if not exists region_id uuid references public.regions(id) on delete set null;
create index if not exists profiles_region_idx on public.profiles (region_id);

-- ─────────────────────────────────────────
-- 3. SLA RULES  (per-priority targets; global default row has region_id NULL,
--    optionally overridden per region as clients are onboarded)
-- ─────────────────────────────────────────
create table if not exists public.sla_rules (
  id                        uuid primary key default uuid_generate_v4(),
  region_id                 uuid references public.regions(id) on delete cascade, -- NULL = global default
  priority                  text not null check (priority in ('low','medium','high','urgent')),
  -- Supplier-controlled SLAs (minutes)
  first_response_mins       int not null,
  attendance_mins           int not null,
  resolution_mins           int not null,
  -- Internal-action SLAs (minutes)
  quote_review_mins         int not null default 1440,   -- 24h
  quote_approval_mins       int not null default 2880,   -- 48h
  instruction_mins          int not null default 1440,   -- 24h
  store_access_mins         int not null default 1440,   -- 24h
  escalation_response_mins  int not null default 480,    -- 8h
  completion_confirm_mins   int not null default 2880,   -- 48h
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists sla_rules_global_priority  on public.sla_rules (priority)            where region_id is null;
create unique index if not exists sla_rules_region_priority  on public.sla_rules (region_id, priority)  where region_id is not null;

-- Seed SA-market defaults once. Tunable per region later via UI.
do $$
begin
  if not exists (select 1 from public.sla_rules where region_id is null) then
    insert into public.sla_rules (region_id, priority, first_response_mins, attendance_mins, resolution_mins) values
      (null, 'urgent',   60,  240,  1440),   -- 1h / 4h / 24h
      (null, 'high',    240,  480,  2880),   -- 4h / 8h / 48h
      (null, 'medium',  480, 1440,  5760),   -- 8h / 24h / 96h
      (null, 'low',    1440, 2880, 10080);   -- 24h / 48h / 7d
  end if;
end $$;

-- ─────────────────────────────────────────
-- 4. TICKETS — expanded operational + SLA + blocker + evidence fields
--    (all nullable/defaulted; existing rows unaffected)
-- ─────────────────────────────────────────
alter table public.tickets add column if not exists region_id                       uuid references public.regions(id) on delete set null;
alter table public.tickets add column if not exists supplier_id                     uuid references public.suppliers(id) on delete set null;
-- NOTE: assigned_user_id is a plain uuid (NOT a FK to profiles). A second/third
-- tickets→profiles FK makes PostgREST `profiles(...)` embeds ambiguous and breaks
-- every ticket query that embeds the store profile. Keep client_id as the only
-- tickets→profiles FK.
alter table public.tickets add column if not exists assigned_user_id                uuid;

alter table public.tickets add column if not exists category                        text;
alter table public.tickets add column if not exists subcategory                     text;
alter table public.tickets add column if not exists asset_id                        text;
alter table public.tickets add column if not exists severity                        text default 'medium' check (severity in ('low','medium','high','critical'));
alter table public.tickets add column if not exists operational_impact              text;
alter table public.tickets add column if not exists safety_risk_flag                boolean not null default false;
alter table public.tickets add column if not exists trading_impact_flag             boolean not null default false;
alter table public.tickets add column if not exists customer_visible_flag           boolean not null default false;
alter table public.tickets add column if not exists staff_impact_flag               boolean not null default false;

alter table public.tickets add column if not exists closed_at                       timestamptz;

-- Supplier SLA timestamps
alter table public.tickets add column if not exists first_response_due_at           timestamptz;
alter table public.tickets add column if not exists first_response_at               timestamptz;
alter table public.tickets add column if not exists attendance_due_at               timestamptz;
alter table public.tickets add column if not exists attended_at                     timestamptz;

-- Quote lifecycle
alter table public.tickets add column if not exists quote_required                  boolean not null default false;
alter table public.tickets add column if not exists quote_requested_at              timestamptz;
alter table public.tickets add column if not exists quote_due_at                    timestamptz;
alter table public.tickets add column if not exists quote_submitted_at              timestamptz;
alter table public.tickets add column if not exists quote_value                     numeric(12,2);
alter table public.tickets add column if not exists quote_approval_required         boolean not null default false;
alter table public.tickets add column if not exists quote_approval_status           text check (quote_approval_status in ('pending','approved','rejected'));
alter table public.tickets add column if not exists quote_approved_at               timestamptz;
alter table public.tickets add column if not exists quote_rejected_at               timestamptz;

-- Resolution
alter table public.tickets add column if not exists resolution_due_at               timestamptz;
alter table public.tickets add column if not exists adjusted_resolution_due_at      timestamptz;
alter table public.tickets add column if not exists completed_at                    timestamptz;

-- Dual SLA status (denormalised cache; engine is the source of truth)
alter table public.tickets add column if not exists supplier_sla_status             text;
alter table public.tickets add column if not exists internal_sla_status             text;
alter table public.tickets add column if not exists sla_paused                      boolean not null default false;
alter table public.tickets add column if not exists pause_reason                    text;
alter table public.tickets add column if not exists pause_started_at                timestamptz;
alter table public.tickets add column if not exists pause_ended_at                  timestamptz;
alter table public.tickets add column if not exists total_paused_minutes            int not null default 0;

-- Blocker tracking
alter table public.tickets add column if not exists current_blocker                 text;
alter table public.tickets add column if not exists blocker_owner_type              text;  -- supplier | regional_manager | finance | store | executive
alter table public.tickets add column if not exists blocker_owner_id                uuid;  -- plain uuid, not a FK (see assigned_user_id note above)
alter table public.tickets add column if not exists blocker_started_at              timestamptz;
alter table public.tickets add column if not exists internal_action_due_at          timestamptz;
alter table public.tickets add column if not exists delay_owner                     text;  -- supplier | internal | store | none

-- Repeat defects
alter table public.tickets add column if not exists repeat_defect_flag             boolean not null default false;
alter table public.tickets add column if not exists repeat_defect_group_id          uuid;

-- Evidence flags
alter table public.tickets add column if not exists evidence_required               boolean not null default false;
alter table public.tickets add column if not exists before_photo_uploaded           boolean not null default false;
alter table public.tickets add column if not exists after_photo_uploaded            boolean not null default false;
alter table public.tickets add column if not exists completion_certificate_uploaded boolean not null default false;
alter table public.tickets add column if not exists invoice_uploaded               boolean not null default false;

-- Store confirmation
alter table public.tickets add column if not exists store_confirmation_required     boolean not null default false;
alter table public.tickets add column if not exists store_confirmed_at              timestamptz;

-- Freshness markers
alter table public.tickets add column if not exists last_supplier_update_at         timestamptz;
alter table public.tickets add column if not exists last_internal_update_at         timestamptz;
alter table public.tickets add column if not exists last_store_update_at            timestamptz;

-- Cached ticket health
alter table public.tickets add column if not exists ticket_health_score             int;
alter table public.tickets add column if not exists ticket_health_status            text;

create index if not exists tickets_region_idx    on public.tickets (region_id);
create index if not exists tickets_supplier_idx  on public.tickets (supplier_id);
create index if not exists tickets_repeat_idx    on public.tickets (repeat_defect_group_id);
create index if not exists tickets_severity_idx  on public.tickets (severity);

-- Auto-populate ticket.region_id from the store's region
create or replace function public.set_ticket_region()
returns trigger language plpgsql as $$
begin
  if new.region_id is null then
    select region_id into new.region_id from public.profiles where id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_ticket_region on public.tickets;
create trigger trg_set_ticket_region
  before insert or update of client_id on public.tickets
  for each row execute function public.set_ticket_region();

-- ─────────────────────────────────────────
-- 5. REPEAT DEFECT GROUPS
-- ─────────────────────────────────────────
create table if not exists public.repeat_defect_groups (
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
create index if not exists rdg_store_idx  on public.repeat_defect_groups (store_id);
create index if not exists rdg_region_idx on public.repeat_defect_groups (region_id);

-- FK from tickets now that the group table exists
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tickets_repeat_group_fk' and table_name = 'tickets'
  ) then
    alter table public.tickets
      add constraint tickets_repeat_group_fk
      foreign key (repeat_defect_group_id) references public.repeat_defect_groups(id) on delete set null;
  end if;
end $$;

-- ─────────────────────────────────────────
-- 6. SLA EVENTS / BLOCKERS / EVIDENCE / APPROVALS  (audit-grade history)
-- ─────────────────────────────────────────
create table if not exists public.ticket_sla_events (
  id          uuid primary key default uuid_generate_v4(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  event_type  text not null,  -- created|first_response|attended|quote_requested|quote_submitted|quote_approved|quote_rejected|paused|unpaused|store_confirmed|escalated|completed
  sla_kind    text,           -- supplier | internal
  actor_id    uuid references public.profiles(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists tse_ticket_idx on public.ticket_sla_events (ticket_id, created_at);

create table if not exists public.ticket_blockers (
  id           uuid primary key default uuid_generate_v4(),
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  blocker_type text not null,  -- quote_approval|store_access|instruction|escalation|completion_confirm|supplier_action
  owner_type   text not null,  -- supplier|regional_manager|finance|store|executive
  owner_id     uuid references public.profiles(id) on delete set null,
  started_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists tb_ticket_idx on public.ticket_blockers (ticket_id);
create index if not exists tb_open_idx    on public.ticket_blockers (resolved_at) where resolved_at is null;

create table if not exists public.ticket_evidence (
  id           uuid primary key default uuid_generate_v4(),
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  kind         text not null,  -- before_photo|after_photo|coc|invoice|other
  url          text not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists te_ticket_idx on public.ticket_evidence (ticket_id);

create table if not exists public.approvals (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid references public.tickets(id) on delete cascade,
  quote_id        uuid references public.quotes(id)  on delete set null,
  approval_type   text not null,  -- quote|variation|completion|funding
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at    timestamptz not null default now(),
  requested_from  uuid references public.profiles(id) on delete set null,
  decided_by      uuid references public.profiles(id) on delete set null,
  decided_at      timestamptz,
  due_at          timestamptz,
  amount          numeric(12,2),
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists approvals_ticket_idx on public.approvals (ticket_id);
create index if not exists approvals_status_idx  on public.approvals (status) where status = 'pending';

-- ─────────────────────────────────────────
-- 7. HEALTH SNAPSHOT TABLES (daily trend history; dashboards can also compute live)
-- ─────────────────────────────────────────
create table if not exists public.store_health_scores (
  id                        uuid primary key default uuid_generate_v4(),
  store_id                  uuid not null references public.profiles(id) on delete cascade,
  region_id                 uuid references public.regions(id) on delete set null,
  snapshot_date             date not null default current_date,
  operational_risk_score    numeric,  -- /30
  sla_score                 numeric,  -- /20
  ticket_load_score         numeric,  -- /15
  repeat_defect_score       numeric,  -- /15
  commercial_blocker_score  numeric,  -- /10
  data_quality_score        numeric,  -- /10
  calculated_health_score   numeric,  -- /100
  calculated_rag_status     text,
  override_applied          boolean default false,
  override_reason           text,
  final_health_score        numeric,
  final_rag_status          text,
  open_tickets              int,
  overdue_tickets           int,
  main_issue                text,
  created_at                timestamptz not null default now(),
  unique (store_id, snapshot_date)
);
create index if not exists shs_region_date_idx on public.store_health_scores (region_id, snapshot_date);

create table if not exists public.regional_health_scores (
  id                      uuid primary key default uuid_generate_v4(),
  region_id               uuid not null references public.regions(id) on delete cascade,
  snapshot_date           date not null default current_date,
  average_store_health    numeric,
  risk_penalty            numeric,
  final_portfolio_health  numeric,
  rag_status              text,
  active_stores           int,
  green_count             int,
  amber_count             int,
  red_count               int,
  critical_count          int,
  open_tickets            int,
  overdue_tickets         int,
  supplier_sla_breaches   int,
  internal_sla_breaches   int,
  cost_exposure           numeric,
  main_reason             text,
  created_at              timestamptz not null default now(),
  unique (region_id, snapshot_date)
);

create table if not exists public.executive_estate_health_scores (
  id                        uuid primary key default uuid_generate_v4(),
  snapshot_date             date not null default current_date,
  weighted_regional_health  numeric,
  risk_penalty              numeric,
  final_estate_health       numeric,
  rag_status                text,
  total_active_stores       int,
  green_count               int,
  amber_count               int,
  red_count                 int,
  critical_count            int,
  open_tickets              int,
  critical_tickets          int,
  supplier_sla_breaches     int,
  internal_sla_breaches     int,
  quotes_awaiting_approval  int,
  cost_exposure             numeric,
  main_risk_driver          text,
  created_at                timestamptz not null default now(),
  unique (snapshot_date)
);

create table if not exists public.supplier_performance_scores (
  id                        uuid primary key default uuid_generate_v4(),
  supplier_id               uuid not null references public.suppliers(id) on delete cascade,
  region_id                 uuid references public.regions(id) on delete set null,  -- NULL = estate-wide
  snapshot_date             date not null default current_date,
  assigned_tickets          int,
  completed_tickets         int,
  sla_breaches              int,
  avg_response_mins         numeric,
  avg_resolution_mins       numeric,
  first_time_fix_rate       numeric,
  repeat_defect_involvement int,
  evidence_completion_rate  numeric,
  escalation_count          int,
  performance_score         numeric,
  performance_band          text,
  created_at                timestamptz not null default now()
);
create index if not exists sps_supplier_date_idx on public.supplier_performance_scores (supplier_id, snapshot_date);
create index if not exists sps_region_date_idx   on public.supplier_performance_scores (region_id, snapshot_date);

create table if not exists public.dashboard_snapshots (
  id             uuid primary key default uuid_generate_v4(),
  scope          text not null,  -- estate | region | store
  scope_id       uuid,           -- region_id / store_id; NULL for estate
  snapshot_date  date not null default current_date,
  payload        jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists ds_scope_idx on public.dashboard_snapshots (scope, scope_id, snapshot_date);

create table if not exists public.audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_actor_idx  on public.audit_logs (actor_id, created_at);

-- ─────────────────────────────────────────
-- 8. BACKFILL — one region per existing RM; link stores + tickets
-- ─────────────────────────────────────────
do $$
declare
  r record;
  v_region_id uuid;
begin
  for r in
    select distinct regional_manager_id
    from public.profiles
    where regional_manager_id is not null
  loop
    select id into v_region_id from public.regions where regional_manager_id = r.regional_manager_id limit 1;
    if v_region_id is null then
      insert into public.regions (name, regional_manager_id)
      select coalesce(nullif(trim(p.full_name), ''), 'Region') || ' Region', r.regional_manager_id
      from public.profiles p where p.id = r.regional_manager_id
      returning id into v_region_id;
    end if;

    update public.profiles
      set region_id = v_region_id
      where regional_manager_id = r.regional_manager_id and region_id is null;
  end loop;

  -- denormalise region onto existing tickets
  update public.tickets t
    set region_id = p.region_id
    from public.profiles p
    where t.client_id = p.id and t.region_id is null and p.region_id is not null;
end $$;

-- ─────────────────────────────────────────
-- 9. ROW-LEVEL SECURITY
--    Heavy dashboard reads go through the service-role client (RLS bypass),
--    so these policies are defence-in-depth for direct user-scoped access.
--    Service role bypasses RLS, so cron/admin writes need no policy.
-- ─────────────────────────────────────────

-- regions
alter table public.regions enable row level security;
drop policy if exists "Executives manage regions"        on public.regions;
drop policy if exists "RMs read their regions"           on public.regions;
drop policy if exists "Staff read regions"               on public.regions;
create policy "Executives manage regions" on public.regions for all
  using (public.get_my_role() = 'executive') with check (public.get_my_role() = 'executive');
create policy "Staff read regions" on public.regions for select
  using (public.get_my_role() in ('executive','regional_manager','supplier'));

-- sla_rules
alter table public.sla_rules enable row level security;
drop policy if exists "Executives manage sla_rules" on public.sla_rules;
drop policy if exists "Staff read sla_rules"        on public.sla_rules;
create policy "Executives manage sla_rules" on public.sla_rules for all
  using (public.get_my_role() = 'executive') with check (public.get_my_role() = 'executive');
create policy "Staff read sla_rules" on public.sla_rules for select
  using (public.get_my_role() in ('executive','regional_manager','supplier'));

-- Helper: tables that store / executive / regional managers read.
-- Executive: read all.  Regional manager: read rows for regions they manage.
-- supplier: read their own performance rows.

-- Generic analytics read policies via a reusable predicate pattern.
alter table public.store_health_scores            enable row level security;
alter table public.regional_health_scores         enable row level security;
alter table public.executive_estate_health_scores enable row level security;
alter table public.supplier_performance_scores    enable row level security;
alter table public.dashboard_snapshots            enable row level security;
alter table public.repeat_defect_groups           enable row level security;
alter table public.ticket_sla_events              enable row level security;
alter table public.ticket_blockers                enable row level security;
alter table public.ticket_evidence                enable row level security;
alter table public.approvals                      enable row level security;
alter table public.audit_logs                     enable row level security;

-- Executives read everything analytics-related
drop policy if exists "Exec read store_health"     on public.store_health_scores;
drop policy if exists "RM read store_health"        on public.store_health_scores;
create policy "Exec read store_health" on public.store_health_scores for select
  using (public.get_my_role() = 'executive');
create policy "RM read store_health" on public.store_health_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));

drop policy if exists "Exec read regional_health" on public.regional_health_scores;
drop policy if exists "RM read regional_health"    on public.regional_health_scores;
create policy "Exec read regional_health" on public.regional_health_scores for select
  using (public.get_my_role() = 'executive');
create policy "RM read regional_health" on public.regional_health_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));

drop policy if exists "Exec read estate_health" on public.executive_estate_health_scores;
create policy "Exec read estate_health" on public.executive_estate_health_scores for select
  using (public.get_my_role() = 'executive');

drop policy if exists "Exec read supplier_perf" on public.supplier_performance_scores;
drop policy if exists "RM read supplier_perf"    on public.supplier_performance_scores;
create policy "Exec read supplier_perf" on public.supplier_performance_scores for select
  using (public.get_my_role() = 'executive');
create policy "RM read supplier_perf" on public.supplier_performance_scores for select
  using (region_id in (select id from public.regions where regional_manager_id = auth.uid()));

drop policy if exists "Staff read snapshots" on public.dashboard_snapshots;
create policy "Staff read snapshots" on public.dashboard_snapshots for select
  using (
    public.get_my_role() = 'executive'
    or (scope = 'region' and scope_id in (select id from public.regions where regional_manager_id = auth.uid()))
  );

drop policy if exists "Staff read repeat_defects" on public.repeat_defect_groups;
create policy "Staff read repeat_defects" on public.repeat_defect_groups for select
  using (
    public.get_my_role() in ('executive','supplier')
    or region_id in (select id from public.regions where regional_manager_id = auth.uid())
  );

-- Ticket-scoped tables: supplier (all, they action tickets), executive (all),
-- regional manager (tickets in their regions), store (own tickets).
drop policy if exists "Ticket-scoped read sla_events" on public.ticket_sla_events;
create policy "Ticket-scoped read sla_events" on public.ticket_sla_events for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_sla_events.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );

drop policy if exists "Ticket-scoped read blockers" on public.ticket_blockers;
create policy "Ticket-scoped read blockers" on public.ticket_blockers for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_blockers.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );

drop policy if exists "Ticket-scoped read evidence" on public.ticket_evidence;
create policy "Ticket-scoped read evidence" on public.ticket_evidence for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_evidence.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );
drop policy if exists "Supplier write evidence" on public.ticket_evidence;
create policy "Supplier write evidence" on public.ticket_evidence for insert
  with check (public.get_my_role() = 'supplier');

drop policy if exists "Ticket-scoped read approvals" on public.approvals;
create policy "Ticket-scoped read approvals" on public.approvals for select
  using (
    public.get_my_role() in ('executive','supplier')
    or exists (
      select 1 from public.tickets t
      where t.id = approvals.ticket_id
        and (t.client_id = auth.uid()
             or t.region_id in (select id from public.regions where regional_manager_id = auth.uid()))
    )
  );

drop policy if exists "Exec read audit" on public.audit_logs;
create policy "Exec read audit" on public.audit_logs for select
  using (public.get_my_role() = 'executive');

-- Executives may read all profiles & tickets (mirrors supplier policy) so the
-- estate dashboard works under RLS as well as via the service-role client.
drop policy if exists "Executives can view all profiles" on public.profiles;
create policy "Executives can view all profiles" on public.profiles for select
  using (public.get_my_role() = 'executive');

drop policy if exists "Executives can view all tickets" on public.tickets;
create policy "Executives can view all tickets" on public.tickets for select
  using (public.get_my_role() = 'executive');

drop policy if exists "Executives can view all quotes" on public.quotes;
create policy "Executives can view all quotes" on public.quotes for select
  using (public.get_my_role() = 'executive');

-- ============================================================
-- End Dashboards v2 migration
-- ============================================================
