-- FIX (production bug): authenticated photo/document uploads were denied with
-- "new row violates row-level security policy" (403) on EVERY role's log-a-job /
-- completion / quote / supplier-doc upload.
--
-- Cause: the storage upload policies gate on `auth.role() = 'authenticated'`, but
-- auth.role() reads a legacy JWT claim (request.jwt.claim.role) that no longer
-- resolves in Supabase's storage RLS context, so it returns NULL and the check is
-- never true. Reproduced: a freshly signed-in user uploading an image/jpeg to
-- ticket-photos 403s.
--
-- Fix: use auth.uid() IS NOT NULL — the reliable "is this an authenticated user"
-- check — for all four upload buckets. Idempotent.

drop policy if exists "ticket-photos upload" on storage.objects;
create policy "ticket-photos upload" on storage.objects for insert
  with check (((bucket_id = 'ticket-photos'::text) AND (auth.uid() IS NOT NULL)));

drop policy if exists "completion-docs upload" on storage.objects;
create policy "completion-docs upload" on storage.objects for insert
  with check (((bucket_id = 'completion-docs'::text) AND (auth.uid() IS NOT NULL)));

drop policy if exists "quote-attachments upload" on storage.objects;
create policy "quote-attachments upload" on storage.objects for insert
  with check (((bucket_id = 'quote-attachments'::text) AND (auth.uid() IS NOT NULL)));

drop policy if exists "supplier-docs upload" on storage.objects;
create policy "supplier-docs upload" on storage.objects for insert
  with check (((bucket_id = 'supplier-docs'::text) AND (auth.uid() IS NOT NULL)));
