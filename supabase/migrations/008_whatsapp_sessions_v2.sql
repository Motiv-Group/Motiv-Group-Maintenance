-- Drop old sessions table and recreate with ticket fields + photo_urls array
-- Ticket is now created AFTER photos are collected, not before.

DROP TABLE IF EXISTS whatsapp_sessions;

CREATE TABLE whatsapp_sessions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text        NOT NULL,
  title       text        NOT NULL,
  description text        NOT NULL,
  priority    text        NOT NULL DEFAULT 'medium',
  photo_urls  text[]      NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'awaiting_photos',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_status_idx
  ON whatsapp_sessions(phone, status);

-- Atomic photo append — prevents race condition when multiple photos sent simultaneously
CREATE OR REPLACE FUNCTION append_session_photo(session_id uuid, photo_url text)
RETURNS text[] AS $$
  UPDATE whatsapp_sessions
  SET photo_urls = array_append(photo_urls, photo_url)
  WHERE id = session_id
  RETURNING photo_urls;
$$ LANGUAGE sql SECURITY DEFINER;
