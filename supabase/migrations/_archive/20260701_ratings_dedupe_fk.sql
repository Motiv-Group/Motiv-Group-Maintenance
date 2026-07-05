-- The v3 ratings table (20260626_supplier_ratings.sql) was created without a FK on
-- ticket_id. Two consequences surfaced:
--   • PostgREST can't embed tickets(title), so the supplier "My Reviews" list errored
--     out and showed nothing (the page now resolves titles separately, but we add the
--     FK so the relationship is well-defined and ticket deletes cascade).
--   • Re-accepting a sign-off (e.g. after a snag fix) posted a second rating for the
--     same ticket, and deleting tickets left orphan ratings behind — both inflating the
--     supplier's review count.
-- Clean up, then enforce one rating per (ticket, supplier).

-- 1. De-dupe: keep the most recent rating per (ticket, supplier).
delete from public.ratings a
  using public.ratings b
  where a.ticket_id is not null and a.supplier_id is not null
    and a.ticket_id = b.ticket_id and a.supplier_id = b.supplier_id
    and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));

-- 2. Drop orphans whose ticket was deleted (they can't be shown and shouldn't count).
delete from public.ratings r
  where r.ticket_id is not null
    and not exists (select 1 from public.tickets t where t.id = r.ticket_id);

-- 3. FK so future ticket deletes cascade to their ratings and the relationship is defined.
alter table public.ratings drop constraint if exists ratings_ticket_id_fkey;
alter table public.ratings
  add constraint ratings_ticket_id_fkey
  foreign key (ticket_id) references public.tickets(id) on delete cascade;

-- 4. Backstop the app-level idempotency with a DB guarantee.
create unique index if not exists ratings_ticket_supplier_uniq
  on public.ratings (ticket_id, supplier_id)
  where ticket_id is not null and supplier_id is not null;
