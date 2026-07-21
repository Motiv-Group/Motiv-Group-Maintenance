-- ===========================================================================
-- reset_dev_tickets.sql — DEV ONLY. DESTRUCTIVE + IRREVERSIBLE.
-- ===========================================================================
-- Wipes EVERY ticket (and all ticket-owned data) and EVERY notification, so the
-- dev database is a clean slate for ticket testing while KEEPING accounts,
-- companies, regions, stores, suppliers, SLA rules, branding and PM/asset data.
--
-- Deleted:   tickets + quotes, quote line items, signoffs (+ rounds, evidence),
--            snags (+ schedule events), disputes (+ messages), variations,
--            ticket_suppliers / declines / quote-requests / reads / views /
--            updates / sla-events / blockers / events, ratings, ticket/quote
--            approvals, and ALL notifications. Per-store job-ref + quote-ref
--            counters are reset so new refs start at 0001 / 00001.
-- Kept:      user_profiles + auth.users, companies, regions, stores, suppliers
--            (+ supplier_users), sla_rules, app_settings, preventative-maintenance
--            plans/tasks and asset service history (their ticket link is nulled,
--            the rows themselves survive), health snapshots (recompute on cron).
-- NOT touched: Storage objects (ticket photos, COCs, quote PDFs). Clear those in
--            the Storage UI separately if you want the buckets empty too.
--
-- Run in the Supabase SQL Editor of the DEV project. Do NOT run on prod.
-- ---------------------------------------------------------------------------
begin;

-- Snapshot the before-count so the notice makes the blast radius obvious.
do $$
declare n_tickets bigint; n_notifs bigint;
begin
  select count(*) into n_tickets from public.tickets;
  select count(*) into n_notifs  from public.notifications;
  raise notice 'reset_dev_tickets: deleting % ticket(s) and % notification(s).', n_tickets, n_notifs;
end $$;

-- 1. All notifications (ticket-linked or not — the request is "all notifications").
delete from public.notifications;

-- 2. Ticket/quote approvals (approvals.quote_id → quotes, so clear before quotes).
delete from public.approvals where ticket_id is not null or quote_id is not null;

-- 3. Disputes before signoffs (ticket_disputes.signoff_id → signoffs); messages first.
delete from public.ticket_dispute_messages;
delete from public.ticket_disputes;

-- 4. Sign-off tree (rounds + evidence reference signoffs / tickets).
delete from public.signoff_rounds;
delete from public.ticket_evidence;
delete from public.signoffs;

-- 5. Snag tree (schedule events reference snags).
delete from public.snag_schedule_events;
delete from public.snags;

-- 6. Ratings tied to a ticket (supplier score history for other tickets is unaffected).
delete from public.ratings where ticket_id is not null;

-- 7. Quote tree (line items + approvals already gone; ticket_suppliers.quote_id is SET NULL).
delete from public.quote_line_items;
delete from public.quotes;

-- 8. Unlink — NOT delete — PM tasks + asset service history from the doomed tickets,
--    so the PM schedule and asset history survive with a null ticket reference.
update public.preventative_maintenance_tasks set ticket_id = null where ticket_id is not null;
update public.asset_service_history           set ticket_id = null where ticket_id is not null;

-- 9. Remaining ticket-child tables (all reference tickets directly).
delete from public.ticket_variations;
delete from public.ticket_suppliers;
delete from public.ticket_supplier_declines;
delete from public.ticket_quote_requests;
delete from public.ticket_reads;
delete from public.ticket_views;
delete from public.ticket_updates;
delete from public.ticket_sla_events;
delete from public.ticket_blockers;
delete from public.ticket_events;

-- 10. The tickets themselves.
delete from public.tickets;

-- 11. Reset the ref counters so the next ticket/quote starts fresh.
truncate table public.store_ticket_counters;
truncate table public.quote_ref_counters;

-- Confirm empty before committing.
do $$
declare n_tickets bigint; n_notifs bigint; n_quotes bigint;
begin
  select count(*) into n_tickets from public.tickets;
  select count(*) into n_notifs  from public.notifications;
  select count(*) into n_quotes  from public.quotes;
  raise notice 'reset_dev_tickets done: tickets=%, notifications=%, quotes=%.', n_tickets, n_notifs, n_quotes;
end $$;

commit;
