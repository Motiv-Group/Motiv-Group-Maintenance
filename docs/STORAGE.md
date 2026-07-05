# Storage security model

## Why
The 3 buckets (`ticket-photos`, `completion-docs`, `quote-attachments`) held sensitive
content (COC certificates, completion photos, quote PDFs) but were **public** — served
as permanent, unauthenticated CDN URLs stored in the DB. Anyone with a leaked/shared/
logged URL could read them cross-tenant, forever.

## The model
- Buckets are **private** (`public = false`).
- Objects are read only via **short-lived signed URLs** minted server-side by the
  service role, or by the service role directly. No permanent public URLs.
- **Uploads are unchanged** — code still stores the object path (via `getPublicUrl`'s
  string, which encodes `bucket/path`). We never changed what's stored.
- **Display** goes through `lib/storage.ts`:
  - Server components: `await signedUrl(stored)` / `await signManyUrls(list)`.
  - Client components: `POST /api/files/sign { paths }` → `{ urls }` (auth-gated).
  - docx reports: sign before fetching the image bytes.
- `signedUrl()` **falls back to the original string** on failure, so display never
  hard-breaks during the migration window.

## Deploy order (IMPORTANT)
1. Ship the app code (signing at every display site) — safe while buckets are still public.
2. THEN run `supabase/migrations/20260708_private_buckets.sql` to flip the buckets private.
   (`20260706_bucket_limits.sql` sets per-bucket size/MIME limits and can run anytime.)

Flipping the buckets **before** the code is live breaks every image (existing public
URLs 404).

## Known limitation (follow-up)
`/api/files/sign` authorises "is a logged-in user", not "may THIS user see THIS file".
Full per-file isolation needs a path→ticket→company mapping. Short-TTL signed URLs +
auth already close the main hole (unauthenticated, permanent access); tighten later.

## Runtime test checklist (before merging the bucket flip)
After applying the private-bucket migration in a test project:
- Ticket photo galleries render (client / regional / supplier ticket detail pages).
- COC + proof-of-completion docs open.
- Quote PDF attachments open.
- docx report export embeds images.
- A raw `…/object/public/…` URL now 403s (confirms buckets are private).
