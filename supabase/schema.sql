-- ============================================================================
-- Motiv - CANONICAL DATABASE SCHEMA (reference)
-- Reconstructed from a live production schema dump on 2026-07-06.
-- This is the SINGLE SOURCE OF TRUTH for what the live DB looks like. When you
-- add a migration, apply it in Supabase THEN update the relevant section here so
-- this file always mirrors production. (Replaces the old schema_v3.sql /
-- clean_install.sql which did NOT match live.)
--
-- NOTE: reconstructed from information_schema + pg_policies. Column types/defaults,
-- PKs, FKs, RLS policies, functions, triggers and storage are faithful. Secondary
-- INDEXES and CHECK constraints are NOT captured here - run pg_dump --schema-only
-- if you need a byte-perfect copy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.approvals (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  ticket_id                    uuid,
  quote_id                     uuid,
  approval_type                text not null,
  status                       text not null default 'pending'::text,
  requested_at                 timestamptz not null default now(),
  requested_from               uuid,
  decided_by                   uuid,
  decided_at                   timestamptz,
  due_at                       timestamptz,
  amount                       numeric,
  reason                       text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.asset_categories (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  name                         text not null,
  default_pm_interval_days     integer
);

create table if not exists public.asset_health_scores (
  id                           uuid not null default gen_random_uuid(),
  asset_id                     uuid not null,
  snapshot_date                date not null default CURRENT_DATE,
  score                        numeric,
  status                       text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.asset_service_history (
  id                           uuid not null default gen_random_uuid(),
  asset_id                     uuid not null,
  ticket_id                    uuid,
  serviced_at                  timestamptz,
  notes                        text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.assets (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  store_id                     uuid,
  category_id                  uuid,
  name                         text not null,
  asset_code                   text,
  serial_number                text,
  installed_at                 date,
  status                       text default 'active'::text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  actor_id                     uuid,
  action                       text not null,
  entity_type                  text,
  entity_id                    uuid,
  metadata                     jsonb,
  created_at                   timestamptz not null default now()
);

create table if not exists public.companies (
  id                           uuid not null default gen_random_uuid(),
  name                         text not null,
  active                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.daily_briefings (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  scope                        text not null,
  scope_id                     text not null,
  briefing_date                date not null,
  role                         text not null,
  headline                     text,
  body                         text not null,
  source                       text not null default 'ai'::text,
  facts                        jsonb,
  created_at                   timestamptz not null default now()
);

create table if not exists public.dashboard_snapshots (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  scope                        text not null,
  scope_id                     uuid,
  snapshot_date                date not null default CURRENT_DATE,
  payload                      jsonb not null,
  created_at                   timestamptz not null default now()
);

create table if not exists public.decision_items (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  category                     text not null,
  title                        text not null,
  context                      text,
  main_driver                  text,
  business_impact              text,
  exposure_value               numeric,
  urgency                      text,
  recommended_action           text,
  owner_id                     uuid,
  region_id                    uuid,
  store_id                     uuid,
  supplier_id                  uuid,
  priority                     integer default 0,
  due_at                       timestamptz,
  status                       text not null default 'open'::text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.estate_health_scores (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  snapshot_date                date not null default CURRENT_DATE,
  weighted_regional_health     numeric,
  risk_penalty                 numeric,
  final_estate_health          numeric,
  status                       text,
  total_active_stores          integer,
  controlled_count             integer,
  attention_count              integer,
  at_risk_count                integer,
  critical_count               integer,
  open_tickets                 integer,
  critical_tickets             integer,
  supplier_sla_breaches        integer,
  internal_sla_breaches        integer,
  decisions_pending            integer,
  cost_exposure                numeric,
  main_risk_driver             text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.notifications (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  user_id                      uuid not null,
  type                         text not null,
  title                        text not null,
  message                      text not null,
  link                         text,
  read                         boolean not null default false,
  created_at                   timestamptz not null default now()
);

create table if not exists public.preventative_maintenance_plans (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  asset_id                     uuid,
  name                         text not null,
  interval_days                integer not null,
  active                       boolean default true,
  created_at                   timestamptz not null default now()
);

create table if not exists public.preventative_maintenance_tasks (
  id                           uuid not null default gen_random_uuid(),
  plan_id                      uuid,
  due_at                       timestamptz,
  completed_at                 timestamptz,
  status                       text default 'scheduled'::text,
  ticket_id                    uuid,
  created_at                   timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id                           uuid not null default gen_random_uuid(),
  user_id                      uuid not null,
  endpoint                     text not null,
  p256dh                       text not null,
  auth                         text not null,
  created_at                   timestamptz not null default now()
);

create table if not exists public.quote_line_items (
  id                           uuid not null default gen_random_uuid(),
  quote_id                     uuid not null,
  description                  text not null,
  qty                          numeric default 1,
  unit_price                   numeric default 0,
  line_total                   numeric,
  created_at                   timestamptz not null default now()
);

create table if not exists public.quotes (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid not null,
  supplier_id                  uuid,
  submitted_by                 uuid,
  type                         text not null default 'quote'::text,
  amount                       numeric not null,
  amount_incl_vat              numeric,
  description                  text,
  valid_until                  date,
  file_url                     text,
  status                       text not null default 'pending'::text,
  decline_reason               text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  proposed_schedule_at         timestamptz,
  warranty                     text
);

create table if not exists public.ratings (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid,
  supplier_id                  uuid,
  contractor_id                uuid,
  rated_by                     uuid,
  score                        integer not null,
  comment                      text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.regional_health_scores (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  region_id                    uuid not null,
  snapshot_date                date not null default CURRENT_DATE,
  average_store_health         numeric,
  risk_penalty                 numeric,
  final_portfolio_health       numeric,
  status                       text,
  active_stores                integer,
  controlled_count             integer,
  attention_count              integer,
  at_risk_count                integer,
  critical_count               integer,
  open_tickets                 integer,
  overdue_tickets              integer,
  supplier_sla_breaches        integer,
  internal_sla_breaches        integer,
  cost_exposure                numeric,
  main_reason                  text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.regional_users (
  user_id                      uuid not null,
  region_id                    uuid not null
);

create table if not exists public.regions (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  region_code                  text not null,
  name                         text not null,
  active                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.repeat_defect_groups (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  store_id                     uuid,
  region_id                    uuid,
  category                     text,
  supplier_id                  uuid,
  occurrence_count             integer not null default 0,
  window_days                  integer not null default 30,
  first_seen_at                timestamptz,
  last_seen_at                 timestamptz,
  root_cause                   text,
  suggested_action             text,
  status                       text not null default 'open'::text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.report_exports (
  id                           uuid not null default gen_random_uuid(),
  report_id                    uuid,
  company_id                   uuid not null,
  exported_by                  uuid,
  format                       text,
  file_url                     text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.reports (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  role_scope                   text not null,
  report_type                  text not null,
  params                       jsonb,
  generated_by                 uuid,
  created_at                   timestamptz not null default now()
);

create table if not exists public.roles (
  key                          text not null,
  label                        text not null
);

create table if not exists public.signoff_rounds (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  signoff_id                   uuid,
  round_no                     integer not null,
  kind                         text not null,
  reason                       text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.signoffs (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid not null,
  supplier_id                  uuid,
  coc_url                      text,
  before_urls                  text[] default '{}'::text[],
  after_urls                   text[] default '{}'::text[],
  invoice_url                  text,
  notes                        text,
  store_confirmed_at           timestamptz,
  status                       text not null default 'submitted'::text,
  reject_reason                text,
  reviewed_by                  uuid,
  reviewed_at                  timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.sla_rules (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  priority                     text not null,
  first_response_mins          integer not null,
  attendance_mins              integer not null,
  quote_due_mins               integer not null,
  resolution_mins              integer not null,
  internal_decision_mins       integer not null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.snag_schedule_events (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  snag_id                      uuid,
  kind                         text not null,
  scheduled_for                timestamptz,
  reason                       text,
  actor_role                   text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.snags (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid,
  store_id                     uuid,
  supplier_id                  uuid,
  category                     text,
  severity                     text,
  description                  text,
  required_correction          text,
  evidence_urls                text[] default '{}'::text[],
  owner_id                     uuid,
  due_at                       timestamptz,
  status                       text not null default 'open'::text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  assigned_at                  timestamptz,
  scheduled_at                 timestamptz,
  schedule_status              text,
  schedule_decline_reason      text
);

create table if not exists public.store_health_scores (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  store_id                     uuid not null,
  region_id                    uuid,
  snapshot_date                date not null default CURRENT_DATE,
  operational_risk_score       numeric,
  sla_score                    numeric,
  ticket_load_score            numeric,
  repeat_defect_score          numeric,
  commercial_blocker_score     numeric,
  data_quality_score           numeric,
  calculated_health_score      numeric,
  calculated_status            text,
  override_applied             boolean default false,
  override_reason              text,
  final_health_score           numeric,
  final_status                 text,
  open_tickets                 integer,
  overdue_tickets              integer,
  main_issue                   text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.store_ticket_counters (
  store_id                     uuid not null,
  year                         integer not null,
  last_number                  integer not null default 0
);

create table if not exists public.store_users (
  user_id                      uuid not null,
  store_id                     uuid not null
);

create table if not exists public.stores (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  region_id                    uuid,
  region_code                  text,
  branch_code                  text not null,
  name                         text not null,
  sub_store                    text,
  address                      text,
  capex_budget                 numeric,
  active                       boolean not null default true,
  closed_at                    timestamptz,
  closure_reason               text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.supplier_escalations (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  supplier_id                  uuid not null,
  region_id                    uuid,
  issue                        text not null,
  action_required              text,
  status                       text not null default 'open'::text,
  escalated_by                 text,
  escalated_at                 timestamptz not null default now(),
  resolved_at                  timestamptz,
  created_at                   timestamptz not null default now()
);

create table if not exists public.supplier_invites (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  supplier_id                  uuid not null,
  email                        text not null,
  token                        text not null,
  created_at                   timestamptz not null default now(),
  expires_at                   timestamptz,
  accepted_at                  timestamptz
);

create table if not exists public.supplier_performance_scores (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid not null,
  supplier_id                  uuid not null,
  region_id                    uuid,
  snapshot_date                date not null default CURRENT_DATE,
  assigned_tickets             integer,
  completed_tickets            integer,
  sla_breaches                 integer,
  avg_response_mins            numeric,
  avg_resolution_mins          numeric,
  first_time_fix_rate          numeric,
  repeat_defect_involvement    integer,
  evidence_completion_rate     numeric,
  escalation_count             integer,
  performance_score            numeric,
  performance_band             text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.supplier_sla_acceptances (
  id           uuid not null default gen_random_uuid() primary key,
  supplier_id  uuid references public.suppliers(id) on delete cascade,
  user_id      uuid not null,
  sla_version  text not null,
  signed_name  text not null,
  ip           text,
  accepted_at  timestamptz not null default now()
);

create table if not exists public.supplier_users (
  user_id                      uuid not null,
  supplier_id                  uuid not null
);

create table if not exists public.supplier_verification_docs (
  id           uuid not null default gen_random_uuid() primary key,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  uploaded_by  uuid not null,
  kind         text not null,   -- cipc | vat_cert | insurance | qualification | other
  url          text not null,   -- stored bucket path/URL; served via signed URLs
  uploaded_at  timestamptz not null default now()
);

create table if not exists public.suppliers (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  company_name                 text not null,
  contact_name                 text,
  email                        text,
  phone                        text,
  address                      text,
  trade                        text,
  trades                       text[],
  qualified                    boolean not null default false,
  qualification_number         text,
  qualification_expiry         date,
  vat_number                   text,
  notes                        text,
  active                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  is_motiv                     boolean not null default false,
  verification_status          text not null default 'unverified',   -- unverified | pending_review | verified
  source                       text not null default 'invited'       -- invited | self_signup
);

create table if not exists public.technicians (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  supplier_id                  uuid,
  name                         text not null,
  phone                        text not null,
  active                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.ticket_blockers (
  id                           uuid not null default gen_random_uuid(),
  ticket_id                    uuid not null,
  blocker_type                 text not null,
  owner_type                   text not null,
  owner_id                     uuid,
  started_at                   timestamptz not null default now(),
  resolved_at                  timestamptz,
  notes                        text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.ticket_dispute_messages (
  id                           uuid not null default uuid_generate_v4(),
  dispute_id                   uuid not null,
  ticket_id                    uuid not null,
  author_id                    uuid,
  author_role                  text not null,
  body                         text,
  evidence_urls                jsonb not null default '[]'::jsonb,
  created_at                   timestamptz not null default now()
);

create table if not exists public.ticket_disputes (
  id                           uuid not null default uuid_generate_v4(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid not null,
  origin                       text not null,
  status                       text not null default 'open'::text,
  outcome                      text,
  raised_by                    uuid,
  resolved_by                  uuid,
  resolution_note              text,
  created_at                   timestamptz not null default now(),
  resolved_at                  timestamptz,
  signoff_id                   uuid,
  pending_outcome              text,
  pending_by                   text,
  pending_at                   timestamptz
);

create table if not exists public.ticket_evidence (
  id                           uuid not null default gen_random_uuid(),
  ticket_id                    uuid not null,
  kind                         text not null,
  url                          text not null,
  uploaded_by                  uuid,
  created_at                   timestamptz not null default now()
);

create table if not exists public.ticket_quote_requests (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  supplier_id                  uuid,
  requested_at                 timestamptz not null default now()
);

create table if not exists public.ticket_reads (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  user_id                      uuid not null,
  last_seen_at                 timestamptz not null default now()
);

create table if not exists public.ticket_sla_events (
  id                           uuid not null default gen_random_uuid(),
  ticket_id                    uuid not null,
  event_type                   text not null,
  sla_kind                     text,
  actor_id                     uuid,
  metadata                     jsonb,
  created_at                   timestamptz not null default now()
);

create table if not exists public.ticket_supplier_declines (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  supplier_id                  uuid,
  reason                       text,
  declined_at                  timestamptz not null default now()
);

create table if not exists public.ticket_suppliers (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid not null,
  supplier_id                  uuid not null,
  status                       text not null default 'invited'::text,
  quote_id                     uuid,
  decline_reason               text,
  invited_at                   timestamptz not null default now(),
  responded_at                 timestamptz,
  declined_by                  text,
  requote_requested_at         timestamptz
);

create table if not exists public.ticket_updates (
  id                           uuid not null default gen_random_uuid(),
  ticket_id                    uuid not null,
  author_id                    uuid,
  author_role                  text,
  body                         text,
  created_at                   timestamptz not null default now()
);

create table if not exists public.ticket_variations (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid, -- nullable (20260718): individual tickets carry no company

  ticket_id                    uuid not null,
  supplier_id                  uuid,
  description                  text not null,
  amount                       numeric,
  status                       text not null default 'pending'::text,
  submitted_by                 uuid,
  reviewed_by                  uuid,
  reviewed_at                  timestamptz,
  reject_reason                text,
  created_at                   timestamptz not null default now(),
  file_urls                    text[] not null default '{}'::text[],
  warranty                     text
);

create table if not exists public.ticket_views (
  id                           uuid not null default gen_random_uuid(),
  company_id                   uuid,
  ticket_id                    uuid not null,
  viewer_id                    uuid,
  viewer_role                  text,
  item_type                    text not null,
  first_viewed_at              timestamptz not null default now(),
  item_label                   text not null default ''::text
);

create table if not exists public.tickets (
  id                           uuid not null default gen_random_uuid(),
  job_number                   bigint,
  -- company_id/store_id nullable (20260717): an Individual's standalone ticket has
  -- no company/store hierarchy — ownership is via created_by.
  company_id                   uuid,
  store_id                     uuid,
  branch_code                  text,
  region_id                    uuid,
  region_code                  text,
  supplier_id                  uuid,
  created_by                   uuid,
  assigned_user_id             uuid,
  category                     text,
  subcategory                  text,
  asset_id                     uuid,
  title                        text not null,
  description                  text not null,
  priority                     text not null default 'P3'::text,
  severity                     text default 'medium'::text,
  operational_impact           text default 'none'::text,
  safety_risk_flag             boolean not null default false,
  trading_impact_flag          boolean not null default false,
  customer_visible_flag        boolean not null default false,
  staff_impact_flag            boolean not null default false,
  status                       text not null default 'open'::text,
  photo_urls                   text[] default '{}'::text[],
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  closed_at                    timestamptz,
  first_response_due_at        timestamptz,
  first_response_at            timestamptz,
  attendance_due_at            timestamptz,
  attended_at                  timestamptz,
  quote_required               boolean not null default false,
  quote_requested_at           timestamptz,
  quote_due_at                 timestamptz,
  quote_submitted_at           timestamptz,
  quote_value                  numeric,
  quote_decision_required      boolean not null default false,
  quote_decision_status        text,
  quote_decided_at             timestamptz,
  resolution_due_at            timestamptz,
  adjusted_resolution_due_at   timestamptz,
  completed_at                 timestamptz,
  supplier_sla_status          text,
  internal_sla_status          text,
  sla_paused                   boolean not null default false,
  pause_reason                 text,
  pause_started_at             timestamptz,
  pause_ended_at               timestamptz,
  total_paused_minutes         integer not null default 0,
  current_blocker              text,
  blocker_owner_type           text,
  blocker_owner_id             uuid,
  blocker_started_at           timestamptz,
  internal_action_due_at       timestamptz,
  delay_owner                  text,
  repeat_defect_flag           boolean not null default false,
  repeat_defect_group_id       uuid,
  evidence_required            boolean not null default false,
  before_photo_uploaded        boolean not null default false,
  after_photo_uploaded         boolean not null default false,
  completion_certificate_uploaded boolean not null default false,
  invoice_uploaded             boolean not null default false,
  store_confirmation_required  boolean not null default false,
  store_confirmed_at           timestamptz,
  submitted_for_signoff_at     timestamptz,
  signoff_status               text,
  last_supplier_update_at      timestamptz,
  last_internal_update_at      timestamptz,
  last_store_update_at         timestamptz,
  ticket_health_score          integer,
  ticket_health_status         text,
  scheduled_at                 timestamptz,
  assessment_required          boolean not null default false,
  assessment_at                timestamptz,
  assessment_notes             text,
  info_request_reason          text,
  closed_out_at                timestamptz,
  closed_out_by                uuid,
  needs_review                 boolean not null default false,
  store_job_number             integer,
  store_job_year               integer,
  job_ref                      text,
  cancellation_reason          text,
  technician_id                uuid,
  edited_at                    timestamptz,
  edited_by                    uuid,
  schedule_status              text,
  info_requested_at            timestamptz,
  info_added_at                timestamptz,
  evidence_request_reason      text,
  edit_note                    text,
  first_quote_requested_at     timestamptz,
  vo_none_confirmed_at         timestamptz
);

create table if not exists public.user_profiles (
  id                           uuid not null,
  company_id                   uuid,
  role                         text not null default 'store_manager'::text,
  full_name                    text,
  email                        text,
  phone                        text,
  active                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  requested_region_code        text,
  address                      text,
  company_name                 text,
  sub_store                    text,
  branch_code                  text,
  last_wa_inbound_at           timestamptz
);

create table if not exists public.whatsapp_sessions (
  id                           uuid not null default gen_random_uuid(),
  phone                        text not null,
  title                        text not null,
  description                  text not null,
  priority                     text not null default 'medium'::text,
  photo_urls                   text[] not null default '{}'::text[],
  status                       text not null default 'awaiting_photos'::text,
  created_at                   timestamptz not null default now(),
  category                     text not null default 'General'::text,
  operational_impact           text not null default 'none'::text,
  confidence                   numeric,
  pending_field                text
);

-- ---------------------------------------------------------------------------
-- PRIMARY KEYS & FOREIGN KEYS
-- ---------------------------------------------------------------------------

alter table public.approvals add primary key (id);
alter table public.asset_categories add primary key (id);
alter table public.asset_health_scores add primary key (id);
alter table public.asset_service_history add primary key (id);
alter table public.assets add primary key (id);
alter table public.audit_logs add primary key (id);
alter table public.companies add primary key (id);
alter table public.daily_briefings add primary key (id);
alter table public.dashboard_snapshots add primary key (id);
alter table public.decision_items add primary key (id);
alter table public.estate_health_scores add primary key (id);
alter table public.notifications add primary key (id);
alter table public.preventative_maintenance_plans add primary key (id);
alter table public.preventative_maintenance_tasks add primary key (id);
alter table public.push_subscriptions add primary key (id);
alter table public.quote_line_items add primary key (id);
alter table public.quotes add primary key (id);
alter table public.ratings add primary key (id);
alter table public.regional_health_scores add primary key (id);
alter table public.regional_users add primary key (region_id, user_id);
alter table public.regions add primary key (id);
alter table public.repeat_defect_groups add primary key (id);
alter table public.report_exports add primary key (id);
alter table public.reports add primary key (id);
alter table public.roles add primary key (key);
-- Lookup rows referenced by user_profiles.role FK. 'individual' seeded 20260720
-- (general-public self-signup role).
insert into public.roles (key, label) values ('individual', 'Individual')
on conflict (key) do nothing;
alter table public.signoff_rounds add primary key (id);
alter table public.signoffs add primary key (id);
alter table public.sla_rules add primary key (id);
alter table public.snag_schedule_events add primary key (id);
alter table public.snags add primary key (id);
alter table public.store_health_scores add primary key (id);
alter table public.store_ticket_counters add primary key (store_id, year);
alter table public.store_users add primary key (store_id, user_id);
alter table public.stores add primary key (id);
alter table public.supplier_escalations add primary key (id);
alter table public.supplier_invites add primary key (id);
alter table public.supplier_performance_scores add primary key (id);
alter table public.supplier_users add primary key (supplier_id, user_id);
alter table public.suppliers add primary key (id);
alter table public.technicians add primary key (id);
alter table public.ticket_blockers add primary key (id);
alter table public.ticket_dispute_messages add primary key (id);
alter table public.ticket_disputes add primary key (id);
alter table public.ticket_evidence add primary key (id);
alter table public.ticket_quote_requests add primary key (id);
alter table public.ticket_reads add primary key (id);
alter table public.ticket_sla_events add primary key (id);
alter table public.ticket_supplier_declines add primary key (id);
alter table public.ticket_suppliers add primary key (id);
alter table public.ticket_updates add primary key (id);
alter table public.ticket_variations add primary key (id);
alter table public.ticket_views add primary key (id);
alter table public.tickets add primary key (id);
alter table public.user_profiles add primary key (id);
alter table public.whatsapp_sessions add primary key (id);

alter table public.approvals add foreign key (ticket_id) references public.tickets(id);
alter table public.approvals add foreign key (company_id) references public.companies(id);
alter table public.approvals add foreign key (decided_by) references public.user_profiles(id);
alter table public.approvals add foreign key (requested_from) references public.user_profiles(id);
alter table public.approvals add foreign key (quote_id) references public.quotes(id);
alter table public.asset_categories add foreign key (company_id) references public.companies(id);
alter table public.asset_health_scores add foreign key (asset_id) references public.assets(id);
alter table public.asset_service_history add foreign key (asset_id) references public.assets(id);
alter table public.asset_service_history add foreign key (ticket_id) references public.tickets(id);
alter table public.assets add foreign key (category_id) references public.asset_categories(id);
alter table public.assets add foreign key (store_id) references public.stores(id);
alter table public.assets add foreign key (company_id) references public.companies(id);
alter table public.audit_logs add foreign key (actor_id) references public.user_profiles(id);
alter table public.audit_logs add foreign key (company_id) references public.companies(id);
alter table public.dashboard_snapshots add foreign key (company_id) references public.companies(id);
alter table public.decision_items add foreign key (region_id) references public.regions(id);
alter table public.decision_items add foreign key (company_id) references public.companies(id);
alter table public.decision_items add foreign key (store_id) references public.stores(id);
alter table public.decision_items add foreign key (supplier_id) references public.suppliers(id);
alter table public.decision_items add foreign key (owner_id) references public.user_profiles(id);
alter table public.estate_health_scores add foreign key (company_id) references public.companies(id);
alter table public.notifications add foreign key (user_id) references public.user_profiles(id);
alter table public.notifications add foreign key (company_id) references public.companies(id);
alter table public.preventative_maintenance_plans add foreign key (asset_id) references public.assets(id);
alter table public.preventative_maintenance_plans add foreign key (company_id) references public.companies(id);
alter table public.preventative_maintenance_tasks add foreign key (ticket_id) references public.tickets(id);
alter table public.preventative_maintenance_tasks add foreign key (plan_id) references public.preventative_maintenance_plans(id);
alter table public.push_subscriptions add foreign key (user_id) references public.null(null);
alter table public.quote_line_items add foreign key (quote_id) references public.quotes(id);
alter table public.quotes add foreign key (ticket_id) references public.tickets(id);
alter table public.quotes add foreign key (company_id) references public.companies(id);
alter table public.quotes add foreign key (submitted_by) references public.user_profiles(id);
alter table public.quotes add foreign key (supplier_id) references public.suppliers(id);
alter table public.ratings add foreign key (ticket_id) references public.tickets(id);
alter table public.regional_health_scores add foreign key (region_id) references public.regions(id);
alter table public.regional_health_scores add foreign key (company_id) references public.companies(id);
alter table public.regional_users add foreign key (region_id) references public.regions(id);
alter table public.regional_users add foreign key (user_id) references public.user_profiles(id);
alter table public.regions add foreign key (company_id) references public.companies(id);
alter table public.repeat_defect_groups add foreign key (region_id) references public.regions(id);
alter table public.repeat_defect_groups add foreign key (supplier_id) references public.suppliers(id);
alter table public.repeat_defect_groups add foreign key (store_id) references public.stores(id);
alter table public.repeat_defect_groups add foreign key (company_id) references public.companies(id);
alter table public.report_exports add foreign key (company_id) references public.companies(id);
alter table public.report_exports add foreign key (exported_by) references public.user_profiles(id);
alter table public.report_exports add foreign key (report_id) references public.reports(id);
alter table public.reports add foreign key (company_id) references public.companies(id);
alter table public.reports add foreign key (generated_by) references public.user_profiles(id);
alter table public.signoff_rounds add foreign key (signoff_id) references public.signoffs(id);
alter table public.signoff_rounds add foreign key (ticket_id) references public.tickets(id);
alter table public.signoff_rounds add foreign key (company_id) references public.companies(id);
alter table public.signoffs add foreign key (company_id) references public.companies(id);
alter table public.signoffs add foreign key (ticket_id) references public.tickets(id);
alter table public.signoffs add foreign key (supplier_id) references public.suppliers(id);
alter table public.signoffs add foreign key (reviewed_by) references public.user_profiles(id);
alter table public.sla_rules add foreign key (company_id) references public.companies(id);
alter table public.snag_schedule_events add foreign key (snag_id) references public.snags(id);
alter table public.snag_schedule_events add foreign key (ticket_id) references public.tickets(id);
alter table public.snag_schedule_events add foreign key (company_id) references public.companies(id);
alter table public.snags add foreign key (company_id) references public.companies(id);
alter table public.snags add foreign key (store_id) references public.stores(id);
alter table public.snags add foreign key (ticket_id) references public.tickets(id);
alter table public.snags add foreign key (owner_id) references public.user_profiles(id);
alter table public.snags add foreign key (supplier_id) references public.suppliers(id);
alter table public.store_health_scores add foreign key (store_id) references public.stores(id);
alter table public.store_health_scores add foreign key (company_id) references public.companies(id);
alter table public.store_health_scores add foreign key (region_id) references public.regions(id);
alter table public.store_users add foreign key (store_id) references public.stores(id);
alter table public.store_users add foreign key (user_id) references public.user_profiles(id);
alter table public.stores add foreign key (region_id) references public.regions(id);
alter table public.stores add foreign key (company_id) references public.companies(id);
alter table public.supplier_escalations add foreign key (region_id) references public.regions(id);
alter table public.supplier_escalations add foreign key (company_id) references public.companies(id);
alter table public.supplier_escalations add foreign key (supplier_id) references public.suppliers(id);
alter table public.supplier_invites add foreign key (supplier_id) references public.suppliers(id);
alter table public.supplier_invites add foreign key (company_id) references public.companies(id);
alter table public.supplier_performance_scores add foreign key (supplier_id) references public.suppliers(id);
alter table public.supplier_performance_scores add foreign key (region_id) references public.regions(id);
alter table public.supplier_performance_scores add foreign key (company_id) references public.companies(id);
alter table public.supplier_users add foreign key (supplier_id) references public.suppliers(id);
alter table public.supplier_users add foreign key (user_id) references public.user_profiles(id);
alter table public.suppliers add foreign key (company_id) references public.companies(id);
alter table public.ticket_blockers add foreign key (owner_id) references public.user_profiles(id);
alter table public.ticket_blockers add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_dispute_messages add foreign key (author_id) references public.user_profiles(id);
alter table public.ticket_dispute_messages add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_dispute_messages add foreign key (dispute_id) references public.ticket_disputes(id);
alter table public.ticket_disputes add foreign key (signoff_id) references public.signoffs(id);
alter table public.ticket_disputes add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_disputes add foreign key (raised_by) references public.user_profiles(id);
alter table public.ticket_disputes add foreign key (resolved_by) references public.user_profiles(id);
alter table public.ticket_disputes add foreign key (company_id) references public.companies(id);
alter table public.ticket_evidence add foreign key (uploaded_by) references public.user_profiles(id);
alter table public.ticket_evidence add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_quote_requests add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_quote_requests add foreign key (company_id) references public.companies(id);
alter table public.ticket_quote_requests add foreign key (supplier_id) references public.suppliers(id);
alter table public.ticket_reads add foreign key (user_id) references public.user_profiles(id);
alter table public.ticket_reads add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_reads add foreign key (company_id) references public.companies(id);
alter table public.ticket_sla_events add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_sla_events add foreign key (actor_id) references public.user_profiles(id);
alter table public.ticket_supplier_declines add foreign key (company_id) references public.companies(id);
alter table public.ticket_supplier_declines add foreign key (supplier_id) references public.suppliers(id);
alter table public.ticket_supplier_declines add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_suppliers add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_suppliers add foreign key (supplier_id) references public.suppliers(id);
alter table public.ticket_updates add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_updates add foreign key (author_id) references public.user_profiles(id);
alter table public.ticket_variations add foreign key (company_id) references public.companies(id);
alter table public.ticket_variations add foreign key (supplier_id) references public.suppliers(id);
alter table public.ticket_variations add foreign key (submitted_by) references public.user_profiles(id);
alter table public.ticket_variations add foreign key (reviewed_by) references public.user_profiles(id);
alter table public.ticket_variations add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_views add foreign key (company_id) references public.companies(id);
alter table public.ticket_views add foreign key (ticket_id) references public.tickets(id);
alter table public.ticket_views add foreign key (viewer_id) references public.user_profiles(id);
alter table public.tickets add foreign key (company_id) references public.companies(id);
alter table public.tickets add foreign key (edited_by) references public.user_profiles(id);
alter table public.tickets add foreign key (repeat_defect_group_id) references public.repeat_defect_groups(id);
alter table public.tickets add foreign key (closed_out_by) references public.user_profiles(id);
alter table public.tickets add foreign key (created_by) references public.user_profiles(id);
alter table public.tickets add foreign key (supplier_id) references public.suppliers(id);
alter table public.tickets add foreign key (region_id) references public.regions(id);
alter table public.tickets add foreign key (store_id) references public.stores(id);
alter table public.user_profiles add foreign key (role) references public.roles(key);
alter table public.user_profiles add foreign key (id) references public.null(null);
alter table public.user_profiles add foreign key (company_id) references public.companies(id);

-- ---------------------------------------------------------------------------
-- FUNCTIONS (RLS helpers + triggers)
-- ---------------------------------------------------------------------------

-- admin_db_stats() — one-call snapshot of database + storage size and per-table
-- row/size estimates for the platform-admin infra dashboard (/admin/supabase).
-- Called via the service-role client only; EXECUTE granted to service_role only.
CREATE OR REPLACE FUNCTION public.admin_db_stats()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'table', relname,
                 'rows',  n_live_tup,
                 'bytes', pg_total_relation_size(relid)
               )
               order by n_live_tup desc
             )
      from pg_stat_user_tables
      where schemaname = 'public'
    ), '[]'::jsonb),
    'storage_bytes',   coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0),
    'storage_objects', (select count(*) from storage.objects),
    'auth_users',      (select count(*) from auth.users)
  );
$function$;
revoke all on function public.admin_db_stats() from public;
revoke all on function public.admin_db_stats() from anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;

CREATE OR REPLACE FUNCTION public.app_can_see_ticket(t_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.tickets t where t.id = t_id
    and t.company_id = public.app_company_id()
    and (public.app_is_company_wide()
      or t.region_id in (select public.app_region_ids())
      or t.store_id  in (select public.app_store_ids())
      or t.supplier_id in (select public.app_supplier_ids())));
$function$
;

-- True iff the caller owns t_id AND it is a standalone/company-less ticket
-- (Individual users). Lets owner-scoped read policies on quotes/signoffs check
-- ownership without recursing through tickets RLS. (migration 20260706)
CREATE OR REPLACE FUNCTION public.app_owns_standalone_ticket(t_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tickets t
    where t.id = t_id and t.created_by = auth.uid() and t.company_id is null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.app_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.user_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.app_is_company_wide()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select role in ('executive','system_admin') from public.user_profiles where id = auth.uid()), false);
$function$
;

CREATE OR REPLACE FUNCTION public.app_region_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select region_id from public.regional_users where user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.user_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.app_store_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select store_id from public.store_users where user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.app_supplier_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select supplier_id from public.supplier_users where user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.append_session_photo(session_id uuid, photo_url text)
 RETURNS text[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.whatsapp_sessions
  set photo_urls = array_append(photo_urls, photo_url)
  where id = session_id
  returning photo_urls;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_store_job_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year   integer := EXTRACT(year FROM COALESCE(NEW.created_at, now()))::integer;
  v_prefix text    := COALESCE(NULLIF(NEW.branch_code, ''), 'JOB');
  v_seq    integer;
BEGIN
  IF NEW.store_job_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.store_ticket_counters (store_id, year, last_number)
    VALUES (NEW.store_id, v_year, 1)
    ON CONFLICT (store_id, year)
    DO UPDATE SET last_number = public.store_ticket_counters.last_number + 1
    RETURNING last_number INTO v_seq;

  NEW.store_job_number := v_seq;
  NEW.store_job_year   := v_year;
  NEW.job_ref          := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$function$
;

-- SECURITY (20260721): the signup trigger may only ever produce the 'individual'
-- role from client metadata — public signUp() data becomes raw_user_meta_data, so
-- honouring its role was a self-service privilege escalation. Privileged roles are
-- set AFTER creation by trusted service-role paths (lib/invite, supplier onboard,
-- create_store_manager), which upsert user_profiles.role in the same request.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text; v_company uuid;
begin
  -- Public self-signup can ONLY create an Individual. Anything else in the client
  -- metadata is ignored (privileged roles are set post-creation by a service-role
  -- path). This is the authoritative guard — the UI only offers Individual anyway.
  v_role := coalesce(new.raw_user_meta_data->>'role','individual');
  if v_role <> 'individual' then v_role := 'individual'; end if;

  -- company_id is only meaningful for the trusted paths (which pass it AND re-upsert
  -- the role); for a self-service individual it's simply null.
  begin v_company := nullif(new.raw_user_meta_data->>'company_id','')::uuid; exception when others then v_company := null; end;

  insert into public.user_profiles (id, email, role, full_name, phone, company_id, requested_region_code)
  values (
    new.id, new.email, v_role,
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_company, null
  )
  on conflict (id) do update set
    role=excluded.role, full_name=excluded.full_name, phone=excluded.phone,
    company_id=coalesce(excluded.company_id, public.user_profiles.company_id);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end; $function$
;

-- Function EXECUTE grants (advisor lockdown 20260709): these SECURITY DEFINER
-- functions are service-role/trigger only, not public RPC. The app_* helpers are
-- intentionally left executable (RLS policies call them per query as the caller).
revoke execute on function public.append_session_photo(uuid, text) from anon, authenticated;
revoke execute on function public.handle_new_user()                 from anon, authenticated;
revoke execute on function public.assign_store_job_ref()            from anon, authenticated;

-- ---------------------------------------------------------------------------
-- INDEXES (beyond PK/FK — only explicitly-created ones are listed)
-- ---------------------------------------------------------------------------

-- Individual dashboards/lists scope standalone tickets by owner (20260717).
create index if not exists tickets_created_by_idx on public.tickets (created_by);

-- Supplier onboarding wizard (20260722).
create index if not exists sla_acceptances_user_idx on public.supplier_sla_acceptances (user_id);
create index if not exists sla_acceptances_supplier_idx on public.supplier_sla_acceptances (supplier_id);
create index if not exists verification_docs_supplier_idx on public.supplier_verification_docs (supplier_id);

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

drop trigger if exists trg_assign_store_job_ref on public.tickets;
create trigger trg_assign_store_job_ref BEFORE INSERT on public.tickets for each row EXECUTE FUNCTION assign_store_job_ref();

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- RLS gaps closed 2026-07-07 (migration 20260707_rls_gaps): these 7 shipped with
-- RLS off. assign_store_job_ref() was made SECURITY DEFINER (above) so the counter
-- table can stay locked without breaking ticket inserts.
alter table public.assets enable row level security;
alter table public.asset_categories enable row level security;
alter table public.asset_health_scores enable row level security;
alter table public.asset_service_history enable row level security;
alter table public.preventative_maintenance_plans enable row level security;
alter table public.preventative_maintenance_tasks enable row level security;
alter table public.store_ticket_counters enable row level security;  -- no policy: service-role/trigger only

drop policy if exists "assets read" on public.assets;
create policy "assets read" on public.assets for select using (company_id = public.app_company_id());
drop policy if exists "asset_categories read" on public.asset_categories;
create policy "asset_categories read" on public.asset_categories for select using (company_id = public.app_company_id());
drop policy if exists "pm_plans read" on public.preventative_maintenance_plans;
create policy "pm_plans read" on public.preventative_maintenance_plans for select using (company_id = public.app_company_id());
drop policy if exists "asset_health read" on public.asset_health_scores;
create policy "asset_health read" on public.asset_health_scores for select
  using (exists (select 1 from public.assets a where a.id = asset_health_scores.asset_id and a.company_id = public.app_company_id()));
drop policy if exists "asset_service read" on public.asset_service_history;
create policy "asset_service read" on public.asset_service_history for select
  using (exists (select 1 from public.assets a where a.id = asset_service_history.asset_id and a.company_id = public.app_company_id()));
drop policy if exists "pm_tasks read" on public.preventative_maintenance_tasks;
create policy "pm_tasks read" on public.preventative_maintenance_tasks for select
  using (exists (select 1 from public.preventative_maintenance_plans p where p.id = preventative_maintenance_tasks.plan_id and p.company_id = public.app_company_id()));

alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.companies enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.dashboard_snapshots enable row level security;
alter table public.decision_items enable row level security;
alter table public.estate_health_scores enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.quotes enable row level security;
alter table public.ratings enable row level security;
alter table public.regional_health_scores enable row level security;
alter table public.regional_users enable row level security;
alter table public.regions enable row level security;
alter table public.repeat_defect_groups enable row level security;
alter table public.report_exports enable row level security;
alter table public.reports enable row level security;
alter table public.roles enable row level security;
alter table public.signoff_rounds enable row level security;
alter table public.signoffs enable row level security;
alter table public.sla_rules enable row level security;
alter table public.snag_schedule_events enable row level security;
alter table public.snags enable row level security;
alter table public.store_health_scores enable row level security;
alter table public.store_users enable row level security;
alter table public.stores enable row level security;
alter table public.supplier_escalations enable row level security;
alter table public.supplier_invites enable row level security;
alter table public.supplier_performance_scores enable row level security;
alter table public.supplier_sla_acceptances enable row level security;   -- no policy: service-role only
alter table public.supplier_users enable row level security;
alter table public.supplier_verification_docs enable row level security; -- no policy: service-role only
alter table public.suppliers enable row level security;
alter table public.technicians enable row level security;
alter table public.ticket_blockers enable row level security;
alter table public.ticket_dispute_messages enable row level security;
alter table public.ticket_disputes enable row level security;
alter table public.ticket_evidence enable row level security;
alter table public.ticket_quote_requests enable row level security;
alter table public.ticket_reads enable row level security;
alter table public.ticket_sla_events enable row level security;
alter table public.ticket_supplier_declines enable row level security;
alter table public.ticket_suppliers enable row level security;
alter table public.ticket_updates enable row level security;
alter table public.ticket_variations enable row level security;
alter table public.ticket_views enable row level security;
alter table public.tickets enable row level security;
alter table public.user_profiles enable row level security;
alter table public.whatsapp_sessions enable row level security;

-- Policies

drop policy if exists "approvals read" on public.approvals;
create policy "approvals read" on public.approvals for select
  using (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)));

drop policy if exists "approvals write" on public.approvals;
create policy "approvals write" on public.approvals for all
  using ((company_id = app_company_id()) AND (app_is_company_wide() OR (app_role() = 'regional_manager'::text
    AND exists (select 1 from public.tickets t where t.id = approvals.ticket_id and t.region_id in (select app_region_ids())))))
  with check (company_id = app_company_id());

drop policy if exists "audit read" on public.audit_logs;
create policy "audit read" on public.audit_logs for select
  using (((company_id = app_company_id()) AND app_is_company_wide()));

drop policy if exists "admin manage company" on public.companies;
create policy "admin manage company" on public.companies for all
  using (((id = app_company_id()) AND (app_role() = 'system_admin'::text)))
  with check (((id = app_company_id()) AND (app_role() = 'system_admin'::text)));

drop policy if exists "read own company" on public.companies;
create policy "read own company" on public.companies for select
  using ((id = app_company_id()));

drop policy if exists "snapshots read" on public.dashboard_snapshots;
create policy "snapshots read" on public.dashboard_snapshots for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR ((scope = 'region'::text) AND (scope_id IN ( SELECT app_region_ids() AS app_region_ids))))));

drop policy if exists "decisions read" on public.decision_items;
create policy "decisions read" on public.decision_items for select
  using (((company_id = app_company_id()) AND app_is_company_wide()));

drop policy if exists "decisions write" on public.decision_items;
create policy "decisions write" on public.decision_items for all
  using (((company_id = app_company_id()) AND app_is_company_wide()))
  with check ((company_id = app_company_id()));

drop policy if exists "estate_health read" on public.estate_health_scores;
create policy "estate_health read" on public.estate_health_scores for select
  using (((company_id = app_company_id()) AND app_is_company_wide()));

drop policy if exists "notif read" on public.notifications;
create policy "notif read" on public.notifications for select
  using ((user_id = auth.uid()));

drop policy if exists "notif update" on public.notifications;
create policy "notif update" on public.notifications for update
  using ((user_id = auth.uid()));

drop policy if exists "push manage" on public.push_subscriptions;
create policy "push manage" on public.push_subscriptions for all
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "qli read" on public.quote_line_items;
create policy "qli read" on public.quote_line_items for select
  using ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_line_items.quote_id) AND app_can_see_ticket(q.ticket_id)))));

drop policy if exists "quotes read" on public.quotes;
create policy "quotes read" on public.quotes for select
  using (app_can_see_ticket(ticket_id));

drop policy if exists "quotes owner read" on public.quotes;
create policy "quotes owner read" on public.quotes for select
  using (public.app_owns_standalone_ticket(ticket_id));

drop policy if exists "quotes update" on public.quotes;
create policy "quotes update" on public.quotes for update
  using (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)));

drop policy if exists "quotes write" on public.quotes;
create policy "quotes write" on public.quotes for insert
  with check (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)));

drop policy if exists "regional_health read" on public.regional_health_scores;
create policy "regional_health read" on public.regional_health_scores for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)))));

drop policy if exists "read own region links" on public.regional_users;
create policy "read own region links" on public.regional_users for select
  using (((user_id = auth.uid()) OR app_is_company_wide()));

drop policy if exists "regions admin" on public.regions;
create policy "regions admin" on public.regions for all
  using (((company_id = app_company_id()) AND (app_role() = 'system_admin'::text)))
  with check (((company_id = app_company_id()) AND (app_role() = 'system_admin'::text)));

drop policy if exists "regions read" on public.regions;
create policy "regions read" on public.regions for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (id IN ( SELECT app_region_ids() AS app_region_ids)))));

drop policy if exists "repeat_defects read" on public.repeat_defect_groups;
create policy "repeat_defects read" on public.repeat_defect_groups for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (supplier_id IN ( SELECT app_supplier_ids() AS app_supplier_ids)))));

drop policy if exists "exports read" on public.report_exports;
create policy "exports read" on public.report_exports for select
  using ((company_id = app_company_id()));

drop policy if exists "exports write" on public.report_exports;
create policy "exports write" on public.report_exports for insert
  with check ((company_id = app_company_id()));

drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select
  using ((company_id = app_company_id()));

drop policy if exists "reports write" on public.reports;
create policy "reports write" on public.reports for insert
  with check ((company_id = app_company_id()));

drop policy if exists "read roles" on public.roles;
create policy "read roles" on public.roles for select
  using ((auth.role() = 'authenticated'::text));

drop policy if exists "signoff_rounds read" on public.signoff_rounds;
create policy "signoff_rounds read" on public.signoff_rounds for select
  using ((company_id = app_company_id()));

drop policy if exists "signoffs read" on public.signoffs;
create policy "signoffs read" on public.signoffs for select
  using (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)));

drop policy if exists "signoffs owner read" on public.signoffs;
create policy "signoffs owner read" on public.signoffs for select
  using (public.app_owns_standalone_ticket(ticket_id));

drop policy if exists "signoffs write" on public.signoffs;
create policy "signoffs write" on public.signoffs for all
  using (((company_id = app_company_id()) AND app_can_see_ticket(ticket_id)))
  with check ((company_id = app_company_id()));

drop policy if exists "sla manage" on public.sla_rules;
create policy "sla manage" on public.sla_rules for all
  using (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'executive'::text]))))
  with check (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'executive'::text]))));

drop policy if exists "sla read" on public.sla_rules;
create policy "sla read" on public.sla_rules for select
  using (((company_id IS NULL) OR (company_id = app_company_id())));

drop policy if exists "snag_schedule_events read" on public.snag_schedule_events;
create policy "snag_schedule_events read" on public.snag_schedule_events for select
  using ((company_id = app_company_id()));

drop policy if exists "snags read" on public.snags;
create policy "snags read" on public.snags for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (store_id IN ( SELECT app_store_ids() AS app_store_ids)) OR (supplier_id IN ( SELECT app_supplier_ids() AS app_supplier_ids)) OR (store_id IN ( SELECT s.id
   FROM stores s
  WHERE (s.region_id IN ( SELECT app_region_ids() AS app_region_ids)))))));

drop policy if exists "snags write" on public.snags;
create policy "snags write" on public.snags for all
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (app_role() = 'regional_manager'::text))))
  with check ((company_id = app_company_id()));

drop policy if exists "store_health read" on public.store_health_scores;
create policy "store_health read" on public.store_health_scores for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (store_id IN ( SELECT app_store_ids() AS app_store_ids)))));

drop policy if exists "read own store links" on public.store_users;
create policy "read own store links" on public.store_users for select
  using (((user_id = auth.uid()) OR app_is_company_wide()));

drop policy if exists "stores admin" on public.stores;
create policy "stores admin" on public.stores for all
  using (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'regional_manager'::text]))))
  with check (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'regional_manager'::text]))));

drop policy if exists "stores read" on public.stores;
create policy "stores read" on public.stores for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (id IN ( SELECT app_store_ids() AS app_store_ids)))));

drop policy if exists "supplier_escalations admin" on public.supplier_escalations;
create policy "supplier_escalations admin" on public.supplier_escalations for all
  using ((company_id = app_company_id()))
  with check ((company_id = app_company_id()));

drop policy if exists "supplier_escalations read" on public.supplier_escalations;
create policy "supplier_escalations read" on public.supplier_escalations for select
  using ((company_id = app_company_id()));

drop policy if exists "supplier_invites admin" on public.supplier_invites;
create policy "supplier_invites admin" on public.supplier_invites for all
  using ((company_id = app_company_id()))
  with check ((company_id = app_company_id()));

drop policy if exists "supplier_invites read" on public.supplier_invites;
create policy "supplier_invites read" on public.supplier_invites for select
  using ((company_id = app_company_id()));

drop policy if exists "supplier_perf read" on public.supplier_performance_scores;
create policy "supplier_perf read" on public.supplier_performance_scores for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (supplier_id IN ( SELECT app_supplier_ids() AS app_supplier_ids)))));

drop policy if exists "read own supplier links" on public.supplier_users;
create policy "read own supplier links" on public.supplier_users for select
  using (((user_id = auth.uid()) OR app_is_company_wide()));

drop policy if exists "suppliers admin" on public.suppliers;
create policy "suppliers admin" on public.suppliers for all
  using (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'regional_manager'::text, 'executive'::text]))))
  with check (((company_id = app_company_id()) AND (app_role() = ANY (ARRAY['system_admin'::text, 'regional_manager'::text, 'executive'::text]))));

drop policy if exists "suppliers read" on public.suppliers;
create policy "suppliers read" on public.suppliers for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (app_role() = 'regional_manager'::text) OR (id IN ( SELECT app_supplier_ids() AS app_supplier_ids)))));

drop policy if exists "ticket_blockers read" on public.ticket_blockers;
create policy "ticket_blockers read" on public.ticket_blockers for select
  using (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_evidence read" on public.ticket_evidence;
create policy "ticket_evidence read" on public.ticket_evidence for select
  using (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_evidence write" on public.ticket_evidence;
create policy "ticket_evidence write" on public.ticket_evidence for insert
  with check (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_quote_requests read" on public.ticket_quote_requests;
create policy "ticket_quote_requests read" on public.ticket_quote_requests for select
  using ((company_id = app_company_id()));

drop policy if exists "ticket_reads read" on public.ticket_reads;
create policy "ticket_reads read" on public.ticket_reads for select
  using ((company_id = app_company_id()));

drop policy if exists "ticket_sla read" on public.ticket_sla_events;
create policy "ticket_sla read" on public.ticket_sla_events for select
  using (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_supplier_declines read" on public.ticket_supplier_declines;
create policy "ticket_supplier_declines read" on public.ticket_supplier_declines for select
  using ((company_id = app_company_id()));

drop policy if exists "ticket_updates read" on public.ticket_updates;
create policy "ticket_updates read" on public.ticket_updates for select
  using (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_updates write" on public.ticket_updates;
create policy "ticket_updates write" on public.ticket_updates for insert
  with check (app_can_see_ticket(ticket_id));

drop policy if exists "ticket_variations admin" on public.ticket_variations;
create policy "ticket_variations admin" on public.ticket_variations for all
  using ((company_id = app_company_id()))
  with check ((company_id = app_company_id()));

drop policy if exists "ticket_variations read" on public.ticket_variations;
create policy "ticket_variations read" on public.ticket_variations for select
  using ((company_id = app_company_id()));

drop policy if exists "ticket_views read" on public.ticket_views;
create policy "ticket_views read" on public.ticket_views for select
  using ((company_id = app_company_id()));

drop policy if exists "tickets insert" on public.tickets;
create policy "tickets insert" on public.tickets for insert
  with check (((company_id = app_company_id()) AND ((app_role() = ANY (ARRAY['system_admin'::text, 'executive'::text, 'regional_manager'::text])) OR (store_id IN ( SELECT app_store_ids() AS app_store_ids)))));

drop policy if exists "tickets read" on public.tickets;
create policy "tickets read" on public.tickets for select
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (store_id IN ( SELECT app_store_ids() AS app_store_ids)) OR (supplier_id IN ( SELECT app_supplier_ids() AS app_supplier_ids)))));

-- Individual owner-scoped read (standalone tickets); enables browser reads + realtime (migration 20260706).
drop policy if exists "tickets owner read" on public.tickets;
create policy "tickets owner read" on public.tickets for select
  using (((created_by = auth.uid()) AND (company_id IS NULL)));

drop policy if exists "tickets update" on public.tickets;
create policy "tickets update" on public.tickets for update
  using (((company_id = app_company_id()) AND (app_is_company_wide() OR (region_id IN ( SELECT app_region_ids() AS app_region_ids)) OR (supplier_id IN ( SELECT app_supplier_ids() AS app_supplier_ids)))));

drop policy if exists "company members read" on public.user_profiles;
create policy "company members read" on public.user_profiles for select
  using (((company_id = app_company_id()) AND app_is_company_wide()));

drop policy if exists "own profile read" on public.user_profiles;
create policy "own profile read" on public.user_profiles for select
  using ((id = auth.uid()));

drop policy if exists "own profile update" on public.user_profiles;
create policy "own profile update" on public.user_profiles for update
  using ((id = auth.uid()));

-- ---------------------------------------------------------------------------
-- STORAGE (buckets + object policies)
-- ---------------------------------------------------------------------------
-- Buckets are PRIVATE (migration 20260708). Reads go through short-lived signed
-- URLs (lib/storage.ts, signed server-side); no public read policy. Size/MIME
-- limits from 20260706. See docs/STORAGE.md.
-- NOTE: on this (migrated) project the storage RLS context does NOT receive the
-- user's JWT claims — auth.uid()/auth.role() are null in storage.objects policies
-- — so browser→storage uploads always 403. Uploads therefore go through the
-- server route POST /api/uploads (authenticates via cookie, writes with the
-- service-role client, forces a per-user path). These upload policies are kept as
-- correct-in-principle defence (auth.uid() IS NOT NULL, updated 20260706) but are
-- not the live write path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('ticket-photos','ticket-photos',false, 15728640, array['image/jpeg','image/jpg','image/png','image/webp']),
  ('completion-docs','completion-docs',false, 15728640, array['image/jpeg','image/jpg','image/png','image/webp','application/pdf']),
  ('quote-attachments','quote-attachments',false, 15728640, array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','image/jpeg','image/jpg','image/png','image/webp']),
  ('supplier-docs','supplier-docs',false, 15728640, array['application/pdf','image/jpeg','image/jpg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Upload policies only (no public read — private buckets read via signed URLs).
drop policy if exists "completion-docs upload" on storage.objects;
create policy "completion-docs upload" on storage.objects for insert
  with check (((bucket_id = 'completion-docs'::text) AND (auth.uid() IS NOT NULL)));
drop policy if exists "quote-attachments upload" on storage.objects;
create policy "quote-attachments upload" on storage.objects for insert
  with check (((bucket_id = 'quote-attachments'::text) AND (auth.uid() IS NOT NULL)));
drop policy if exists "supplier-docs upload" on storage.objects;
create policy "supplier-docs upload" on storage.objects for insert
  with check (((bucket_id = 'supplier-docs'::text) AND (auth.uid() IS NOT NULL)));
drop policy if exists "ticket-photos upload" on storage.objects;
create policy "ticket-photos upload" on storage.objects for insert
  with check (((bucket_id = 'ticket-photos'::text) AND (auth.uid() IS NOT NULL)));

-- ---------------------------------------------------------------------------
-- REALTIME (postgres_changes)
-- ---------------------------------------------------------------------------
-- EVERY table a RealtimeRefresh layout subscribes to MUST be in the
-- supabase_realtime publication — a postgres_changes channel that binds a
-- NON-published table is rejected wholesale (CHANNEL_ERROR "transport failure")
-- and loops the socket for that whole role. REPLICA IDENTITY FULL is required so
-- RLS can be evaluated on UPDATE/DELETE events (default replica identity only
-- carries the PK → RLS drops the event). The browser must also authenticate the
-- socket with the user JWT (supabase-js 2.110 wires this on SIGNED_IN/refresh;
-- components/ui/RealtimeRefresh.tsx seeds it on load) or RLS hides every row.
alter table public.tickets                  replica identity full;
alter table public.quotes                   replica identity full;
alter table public.signoffs                 replica identity full;
alter table public.notifications            replica identity full;
alter table public.snags                    replica identity full;
alter table public.decision_items           replica identity full;
alter table public.ticket_updates           replica identity full;
alter table public.ticket_disputes          replica identity full;
alter table public.ticket_dispute_messages  replica identity full;

-- Publication membership (idempotent). ticket_disputes / ticket_dispute_messages
-- are deny-all under RLS (read via the service-role client), so Realtime delivers
-- no events for them to users — they are published only so binding to them does
-- not error the channel.
do $$
declare t text;
begin
  foreach t in array array[
    'tickets', 'quotes', 'signoffs', 'notifications',
    'snags', 'decision_items', 'ticket_updates', 'ticket_disputes', 'ticket_dispute_messages'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
