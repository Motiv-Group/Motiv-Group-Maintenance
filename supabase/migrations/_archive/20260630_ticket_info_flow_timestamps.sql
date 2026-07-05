-- Timestamps for the RM↔Store-Manager "more information" exchange so the audit
-- trail (Regional Manager view only) can show when info was requested and when
-- the store manager supplied it. The reason itself already lives in
-- tickets.info_request_reason; these just capture the when.
alter table if exists tickets
  add column if not exists info_requested_at timestamptz,
  add column if not exists info_added_at timestamptz;
