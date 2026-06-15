-- WhatsApp conversation sessions for photo collection flow
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text        NOT NULL,
  ticket_id   uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  photo_count integer     NOT NULL DEFAULT 0,
  status      text        NOT NULL DEFAULT 'awaiting_photos', -- 'awaiting_photos' | 'complete'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_status_idx
  ON whatsapp_sessions(phone, status);
