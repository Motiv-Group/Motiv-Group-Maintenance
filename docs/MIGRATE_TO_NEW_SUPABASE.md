# Migrate Motiv to a new Supabase project (different account)

What actually has to move:

| Layer | Where it lives | How it moves |
|---|---|---|
| Schema (tables, RLS, functions, triggers) | Postgres `public` schema | `pg_dump` → `psql` |
| Reference/seed + live data | Postgres `public` schema | same dump (or `--data-only`) |
| Storage **buckets** (metadata) | `storage.buckets` table | SQL below (3 buckets) |
| Storage **policies** | `storage.objects` policies | SQL below |
| Storage **files** (actual photos/PDFs) | S3-backed object store | copy script (§5) |
| Auth users (logins/passwords) | `auth.users` + `auth.identities` | `pg_dump --data-only` (§6) |
| Auth settings (Site URL, redirects, email) | Dashboard config | manual (§7) |
| App secrets | Vercel env vars | manual (§8) |

> Two known objects were created in the dashboard, **not** in repo migrations: the **`ratings`** table and the **`quote-attachments`** storage bucket. A `pg_dump` of `public` captures `ratings` automatically; the bucket is created by the SQL in §4. (This is why the dump method is preferred over re-running migration files.)

---

## 1. Create the new project
New Supabase account → New project. Record:
- Project ref / URL: `https://<NEW_REF>.supabase.co`
- `anon` key, `service_role` key (Settings → API)
- DB password (Settings → Database)

## 2. Connection strings
Settings → Database → Connection string → **URI** (direct, port 5432) for both projects:
```
SRC = postgresql://postgres:<OLD_PW>@db.<OLD_REF>.supabase.co:5432/postgres
DST = postgresql://postgres:<NEW_PW>@db.<NEW_REF>.supabase.co:5432/postgres
```
Need `pg_dump`/`psql` v15+ locally (`psql --version`). On Windows use the PostgreSQL client tools or WSL.

## 3. Clone schema + data (public)
```bash
# dump public schema + data, portable across projects
pg_dump "$SRC" \
  --schema=public \
  --no-owner --no-privileges \
  --clean --if-exists \
  -f motiv_public.sql

# load into the new project
psql "$DST" -f motiv_public.sql
```
This brings every table (profiles, tickets, quotes, notifications, completions, suppliers, push_subscriptions, **ratings**, whatsapp_sessions, regions, sla_rules, all dashboards-v2 tables), their RLS policies, functions (`handle_new_user`, `get_my_role`, `set_ticket_region`, `set_updated_at`) and triggers.

> Schema-only instead: add `--schema-only`. Data-only top-up later: `--data-only`.

## 4. Storage buckets + policies (run on NEW project, SQL editor)
Idempotent. Recreates the 3 buckets and their `storage.objects` policies (the dump of `public` does **not** include storage policies):
```sql
insert into storage.buckets (id, name, public) values
  ('ticket-photos',    'ticket-photos',    true),
  ('completion-docs',  'completion-docs',  true),
  ('quote-attachments','quote-attachments',true)
on conflict (id) do nothing;

-- ticket-photos
drop policy if exists "Authenticated users can upload ticket photos" on storage.objects;
create policy "Authenticated users can upload ticket photos" on storage.objects for insert
  with check (bucket_id = 'ticket-photos' and auth.role() = 'authenticated');
drop policy if exists "Anyone can view ticket photos" on storage.objects;
create policy "Anyone can view ticket photos" on storage.objects for select
  using (bucket_id = 'ticket-photos');

-- completion-docs
drop policy if exists "Authenticated users can upload completion docs" on storage.objects;
create policy "Authenticated users can upload completion docs" on storage.objects for insert
  with check (bucket_id = 'completion-docs' and auth.role() = 'authenticated');
drop policy if exists "Anyone can view completion docs" on storage.objects;
create policy "Anyone can view completion docs" on storage.objects for select
  using (bucket_id = 'completion-docs');

-- quote-attachments
drop policy if exists "Authenticated users can upload quote attachments" on storage.objects;
create policy "Authenticated users can upload quote attachments" on storage.objects for insert
  with check (bucket_id = 'quote-attachments' and auth.role() = 'authenticated');
drop policy if exists "Anyone can view quote attachments" on storage.objects;
create policy "Anyone can view quote attachments" on storage.objects for select
  using (bucket_id = 'quote-attachments');
```

## 5. Copy storage files (old → new)
Buckets are public, but the **files** still must be copied. Run this Node script once (needs `@supabase/supabase-js`, already a dep):
```js
// copy-storage.mjs — node copy-storage.mjs
import { createClient } from '@supabase/supabase-js'

const SRC = createClient('https://OLD_REF.supabase.co', 'OLD_SERVICE_ROLE_KEY')
const DST = createClient('https://NEW_REF.supabase.co', 'NEW_SERVICE_ROLE_KEY')
const BUCKETS = ['ticket-photos', 'completion-docs', 'quote-attachments']

async function walk(bucket, prefix = '') {
  const { data, error } = await SRC.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) throw error
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) { await walk(bucket, path); continue }   // folder
    const { data: blob, error: dErr } = await SRC.storage.from(bucket).download(path)
    if (dErr) { console.error('download', path, dErr.message); continue }
    const buf = Buffer.from(await blob.arrayBuffer())
    const { error: uErr } = await DST.storage.from(bucket).upload(path, buf, { upsert: true, contentType: blob.type })
    if (uErr) console.error('upload', path, uErr.message)
    else console.log('ok', bucket, path)
  }
}
for (const b of BUCKETS) await walk(b)
console.log('done')
```

## 6. Migrate auth users (logins + passwords)
Password hashes live in `auth.users`. Disable the signup trigger during restore so it can't clobber the already-restored `public.profiles`, then copy auth rows:
```bash
pg_dump "$SRC" --data-only \
  --table='auth.users' --table='auth.identities' \
  -f motiv_auth.sql
```
```sql
-- on NEW project, SQL editor, BEFORE loading motiv_auth.sql:
alter table auth.users disable trigger on_auth_user_created;
```
```bash
psql "$DST" -f motiv_auth.sql
```
```sql
-- re-enable after:
alter table auth.users enable trigger on_auth_user_created;
```
Caveats:
- Source & target must be the same Supabase Postgres major version (they are if both are new-ish).
- JWT secret differs between projects → existing sessions are invalid; **users just log in again** (passwords still work).
- If `auth.identities` errors on schema drift, skip it and have users use "Forgot password" instead (profiles already exist from §3).

## 7. Auth settings (new project dashboard)
Authentication → URL Configuration & Providers — match the old project:
- **Site URL** = your production URL (e.g. `https://app.yourdomain.com`)
- **Redirect URLs** = production URL + `http://localhost:3000` (dev) + the Capacitor origin if used
- **Email** provider enabled; confirm the **"Confirm email"** setting matches old (on/off)
- Re-add any custom email templates (reset/confirm) you had
- SMTP settings if you used a custom sender

## 8. App config + env vars
Update env in Vercel (and `.env.local` for dev) to the **new** project:
```
NEXT_PUBLIC_SUPABASE_URL=https://NEW_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new anon>
SUPABASE_SERVICE_ROLE_KEY=<new service_role>
NEXT_PUBLIC_ADMIN_EMAILS=<unchanged>
NEXT_PUBLIC_APP_URL=<unchanged production URL>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<unchanged>     # push keep working
VAPID_PRIVATE_KEY=<unchanged>
VAPID_SUBJECT=<unchanged>
CRON_SECRET=<unchanged or new>
```
- **Capacitor** (`capacitor.config.ts` `server.url`) points at the Vercel **site**, not Supabase — no change unless your site URL changes.
- Redeploy Vercel after env change.

## 9. Cron
`vercel.json` crons hit your own `/api/cron/*` — no Supabase change. Ensure `CRON_SECRET` is set on the new deploy.

## 10. Verify
- [ ] `select count(*) from profiles;` matches old (run on both)
- [ ] Log in as each role → dashboards load
- [ ] A ticket photo and a completion PDF render (storage files copied)
- [ ] Submit a new ticket → row appears, notification fires
- [ ] Send a quote with attachment → uploads to `quote-attachments`
- [ ] `select * from sla_rules;` shows the 4 global rows
- [ ] Executive login works (role set)

---

## Alternative — fresh schema from repo (no data)
If you only want a clean schema (no existing data) and can't run `pg_dump`, run these migration files **in this order** in the SQL editor, then §4 storage SQL, then create the `ratings` table (below):

```
001_initial_schema.sql
002_fix_role_constraint.sql
002_fix_rls_recursion.sql
002_decline_reason.sql
002_extended_trigger.sql
003_quote_decline_reason.sql
004_ticket_declined_status.sql
005_completions.sql
006_snag_in_progress.sql
007_whatsapp_sessions.sql
008_whatsapp_sessions_v2.sql
suppliers_table.sql
push_subscriptions_table.sql
20240613_normalise_phone_e164.sql
20260613_quote_amount_incl_vat.sql
20260613_variation_orders.sql
20260613_rename_role_to_supplier.sql
20260614_store_capex_budget.sql
20260615_variation_accepted_status.sql
20260615_store_closure.sql
20260615_ticket_job_number.sql
20260616_dashboards_v2.sql
20260617_fix_ticket_fk_and_exec_signup.sql
```

`ratings` table (created in the old project via dashboard — recreate it; **verify columns against the old project** if you can):
```sql
create table if not exists public.ratings (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid references public.tickets(id) on delete cascade,
  contractor_id uuid references public.profiles(id) on delete cascade,  -- the supplier user
  score         int not null check (score between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);
alter table public.ratings enable row level security;
drop policy if exists "Suppliers read own ratings" on public.ratings;
create policy "Suppliers read own ratings" on public.ratings for select
  using (contractor_id = auth.uid() or public.get_my_role() in ('regional_manager','executive'));
drop policy if exists "RMs insert ratings" on public.ratings;
create policy "RMs insert ratings" on public.ratings for insert
  with check (public.get_my_role() in ('regional_manager','supplier','executive'));
```
This path does **not** copy data, files, or users — use the `pg_dump` method (§3–§6) for a true clone.
