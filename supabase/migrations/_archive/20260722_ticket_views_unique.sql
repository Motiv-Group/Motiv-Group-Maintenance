-- ---------------------------------------------------------------------------
-- 20260722_ticket_views_unique
-- ---------------------------------------------------------------------------
-- The /api/tickets/[id]/view route upserts with
--   onConflict: 'ticket_id,viewer_id,item_type,item_label'
-- but ticket_views had NO matching unique index, so every upsert raised
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- and silently recorded NOTHING — the timeline never showed "viewed …" events
-- for anyone. Add the missing unique index so the first-view-wins upsert works.
--
-- Idempotent. Dedup any rows that slipped in before the index (there shouldn't
-- be any, since the insert always failed, but guard anyway).

delete from public.ticket_views a using public.ticket_views b
  where a.ctid < b.ctid
    and a.ticket_id = b.ticket_id
    and coalesce(a.viewer_id::text, '') = coalesce(b.viewer_id::text, '')
    and a.item_type = b.item_type
    and a.item_label = b.item_label;

create unique index if not exists ticket_views_unique_view
  on public.ticket_views (ticket_id, viewer_id, item_type, item_label);
