-- When the RM re-assigns a supplier who previously declined (or was declined on) a
-- ticket, their invite is reset to 'invited' and this stamps the re-quote request so
-- the supplier's ticket page can say "the regional manager requested a re-quote".
alter table public.ticket_suppliers add column if not exists requote_requested_at timestamptz;
