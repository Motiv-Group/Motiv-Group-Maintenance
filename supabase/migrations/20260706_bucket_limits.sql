-- ============================================================
-- Storage hardening (part 1 of 2): per-bucket size + MIME limits.
-- Run in the Supabase SQL Editor. Idempotent (plain UPDATEs).
--
-- This enforces upload size/type at the storage layer (client-side checks are
-- bypassable). It does NOT change the buckets' public/private flag — that's the
-- bigger part-2 change (make buckets private + switch the app from getPublicUrl
-- to short-TTL createSignedUrl at every render site). Do part 2 together with the
-- render-site sweep so image display doesn't break. See docs/PROFILES... / plan.
-- ============================================================

-- 15 MB cap on every bucket.
update storage.buckets set file_size_limit = 15728640
  where id in ('ticket-photos', 'completion-docs', 'quote-attachments');

-- ticket-photos: images only.
update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp']
  where id = 'ticket-photos';

-- completion-docs: images + PDF (COC / proof-of-completion).
update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
  where id = 'completion-docs';

-- quote-attachments: PDF, Excel, images.
update storage.buckets
  set allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/jpeg','image/jpg','image/png','image/webp'
  ]
  where id = 'quote-attachments';
