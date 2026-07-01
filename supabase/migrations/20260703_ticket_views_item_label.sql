-- View tracking is now per specific item (click-based), so the audit trail can say
-- exactly what was opened — "viewed Photo 2", "viewed COC", "viewed ABC Traders' quote".
-- item_label carries that specific name; uniqueness is per (ticket, viewer, type, label)
-- so each distinct item's first open is recorded.
alter table public.ticket_views add column if not exists item_label text not null default '';
drop index if exists public.ticket_views_uniq;
create unique index if not exists ticket_views_uniq
  on public.ticket_views (ticket_id, viewer_id, item_type, item_label);
