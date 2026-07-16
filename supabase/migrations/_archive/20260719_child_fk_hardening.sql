-- ============================================================================
-- Child-table FK hardening — audit finding SEC-037.
--
-- These tables reference companies/quotes/user_profiles/stores but had no FK, so
-- an orphaned reference was possible. Unlike tickets/ratings/technicians (empty,
-- handled in 20260718), some of these may already hold rows, so the FKs are added
-- NOT VALID: they enforce on every NEW insert/update immediately, but skip
-- validating pre-existing rows (no risk of the migration failing on an old orphan).
-- The owner can VALIDATE later once confirmed clean (statements at the bottom).
--
-- ON DELETE matched to nullability: SET NULL where the column is nullable (keep the
-- child, drop the link), CASCADE where NOT NULL (the child cannot exist without its
-- parent). NB: the app soft-deletes (POPIA, decision D4), so these rarely fire.
--
-- IDEMPOTENT — safe to re-run. APPLY: dev first, then prod, via the SQL Editor.
-- ============================================================================

-- nullable → SET NULL
alter table public.ticket_suppliers drop constraint if exists ticket_suppliers_quote_id_fkey;
alter table public.ticket_suppliers add  constraint ticket_suppliers_quote_id_fkey
  foreign key (quote_id) references public.quotes(id) on delete set null not valid;
alter table public.ticket_suppliers drop constraint if exists ticket_suppliers_company_id_fkey;
alter table public.ticket_suppliers add  constraint ticket_suppliers_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null not valid;
alter table public.ticket_events drop constraint if exists ticket_events_company_id_fkey;
alter table public.ticket_events add  constraint ticket_events_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null not valid;

-- NOT NULL → CASCADE (child cannot exist without its parent)
alter table public.daily_briefings drop constraint if exists daily_briefings_company_id_fkey;
alter table public.daily_briefings add  constraint daily_briefings_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade not valid;
alter table public.supplier_sla_acceptances drop constraint if exists supplier_sla_acceptances_user_id_fkey;
alter table public.supplier_sla_acceptances add  constraint supplier_sla_acceptances_user_id_fkey
  foreign key (user_id) references public.user_profiles(id) on delete cascade not valid;
alter table public.supplier_verification_docs drop constraint if exists supplier_verification_docs_uploaded_by_fkey;
alter table public.supplier_verification_docs add  constraint supplier_verification_docs_uploaded_by_fkey
  foreign key (uploaded_by) references public.user_profiles(id) on delete cascade not valid;
alter table public.store_ticket_counters drop constraint if exists store_ticket_counters_store_id_fkey;
alter table public.store_ticket_counters add  constraint store_ticket_counters_store_id_fkey
  foreign key (store_id) references public.stores(id) on delete cascade not valid;

-- OPTIONAL follow-up (owner, once you've confirmed no orphan rows exist): promote
-- the constraints to fully validated. Safe to run any time; errors only if an
-- orphan is present (which then needs cleaning first).
--   alter table public.ticket_suppliers          validate constraint ticket_suppliers_quote_id_fkey;
--   alter table public.ticket_suppliers          validate constraint ticket_suppliers_company_id_fkey;
--   alter table public.ticket_events             validate constraint ticket_events_company_id_fkey;
--   alter table public.daily_briefings           validate constraint daily_briefings_company_id_fkey;
--   alter table public.supplier_sla_acceptances  validate constraint supplier_sla_acceptances_user_id_fkey;
--   alter table public.supplier_verification_docs validate constraint supplier_verification_docs_uploaded_by_fkey;
--   alter table public.store_ticket_counters     validate constraint store_ticket_counters_store_id_fkey;
