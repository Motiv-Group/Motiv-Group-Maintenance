-- ============================================================
-- Storage hardening (part 2 of 2): make buckets PRIVATE.
-- Run in the Supabase SQL Editor.
--
-- ⚠️ APPLY THIS ONLY TOGETHER WITH THE APP DEPLOY that switches image rendering
-- from getPublicUrl() to signed URLs (lib/storage.ts + /api/files/sign). Flipping
-- the buckets private BEFORE that code is live will break EVERY image/COC/quote-PDF
-- (existing public URLs 404). Deploy the code first (or same release), then run this.
--
-- After this, objects are readable only via short-lived signed URLs (minted by the
-- service role) or the service role itself — no more permanent unauthenticated URLs.
-- ============================================================

-- 1. Buckets -> private.
update storage.buckets set public = false
  where id in ('ticket-photos', 'completion-docs', 'quote-attachments');

-- 2. Drop the old unscoped public READ policies (they allowed anyone, even
--    unauthenticated, to read any object). Signed URLs don't need a SELECT policy.
drop policy if exists "ticket-photos read"     on storage.objects;
drop policy if exists "completion-docs read"   on storage.objects;
drop policy if exists "quote-attachments read" on storage.objects;

-- 3. Uploads stay gated to authenticated users (unchanged) — recreate defensively.
drop policy if exists "ticket-photos upload"     on storage.objects;
drop policy if exists "completion-docs upload"   on storage.objects;
drop policy if exists "quote-attachments upload" on storage.objects;
create policy "ticket-photos upload"     on storage.objects for insert with check (bucket_id = 'ticket-photos'     and auth.role() = 'authenticated');
create policy "completion-docs upload"   on storage.objects for insert with check (bucket_id = 'completion-docs'   and auth.role() = 'authenticated');
create policy "quote-attachments upload" on storage.objects for insert with check (bucket_id = 'quote-attachments' and auth.role() = 'authenticated');
