-- ---------------------------------------------------------------------------
-- 20260724_ticket_reads_unique
-- ---------------------------------------------------------------------------
-- The /api/tickets/[id]/seen route upserts with onConflict: 'user_id,ticket_id'
-- but ticket_reads had NO matching unique index, so every write raised
-- "no unique or exclusion constraint matching the ON CONFLICT specification"
-- and silently recorded NOTHING — "last seen" watermarks never persisted, so
-- declined-quote notifications (and the RM's new-update markers) never cleared.
-- Same failure class as 20260722_ticket_views_unique.
--
-- Idempotent. Dedup first (keep the newest last_seen_at per user+ticket).

delete from public.ticket_reads a using public.ticket_reads b
  where a.user_id = b.user_id
    and a.ticket_id = b.ticket_id
    and (a.last_seen_at < b.last_seen_at
         or (a.last_seen_at = b.last_seen_at and a.ctid < b.ctid));

create unique index if not exists ticket_reads_unique_read
  on public.ticket_reads (user_id, ticket_id);
