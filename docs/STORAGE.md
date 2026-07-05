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
- **Display** goes through `lib/storage.ts`, entirely **server-side**:
  - Server components: `await signedUrl(stored)` / `await signManyUrls(list)` before
    passing URLs to render. All current display sites sign this way.
  - docx reports: sign before fetching the image bytes.
  - There is **no client-side signing endpoint** — the earlier `/api/files/sign` was
    unused and removed (it authorised only "logged-in", not per-file ownership). If a
    client component ever needs on-demand signing, re-add it **with per-file auth**
    (path → ticket/record → `company_id` check), not just an auth gate.
- `signedUrl()` **falls back to the original string** on failure, so display never
  hard-breaks.

## Status (applied 2026-07-07)
Buckets are private + signing is live and verified in production (public URLs 403,
signed URLs 200). The private-bucket + size/MIME changes are folded into
`supabase/schema.sql` (the two migration files were applied then deleted per the
schema-is-truth process). **When flipping storage settings again, always deploy the
signing code first — flipping buckets private before the code is live 404s every image.**

## Follow-up
- **Per-file authorization** if a client-side signing endpoint is ever added (see above).
- **Runtime re-test** after any storage change: ticket photo galleries, COC/proof docs,
  quote PDFs, docx report images all render; a raw `…/object/public/…` URL 403s.
