-- Supplier onboarding wizard (self-signup + SLA + verification). Idempotent.
--
-- 1) suppliers gains:
--    - trades text[]           : multi-select trades (old single `trade` kept for
--                                back-compat; new code writes both, reads trades first)
--    - verification_status     : 'unverified' (default, invited/legacy suppliers)
--                                'pending_review' (self-signup, awaiting admin approval)
--                                'verified' (admin approved — self-signup ones also get is_motiv)
--    - source                  : 'invited' | 'self_signup' (how the row came to exist)
-- 2) supplier_sla_acceptances  : audit-grade electronic SLA signatures (user, supplier,
--                                version, typed name, ip, timestamp). RLS deny-by-default
--                                (service-role only), like the other operational tables.
-- 3) supplier_verification_docs: uploaded compliance documents (CIPC, VAT cert,
--                                insurance, trade qualification) for the admin review.
-- 4) storage bucket supplier-docs: PRIVATE, pdf+images, 15MB, authenticated upload.

alter table public.suppliers add column if not exists trades text[];
alter table public.suppliers add column if not exists verification_status text not null default 'unverified';
alter table public.suppliers add column if not exists source text not null default 'invited';

create table if not exists public.supplier_sla_acceptances (
  id           uuid not null default gen_random_uuid() primary key,
  supplier_id  uuid references public.suppliers(id) on delete cascade,
  user_id      uuid not null,
  sla_version  text not null,
  signed_name  text not null,
  ip           text,
  accepted_at  timestamptz not null default now()
);
alter table public.supplier_sla_acceptances enable row level security;
-- no policies: deny-by-default; all access via the service-role client.

create index if not exists sla_acceptances_user_idx on public.supplier_sla_acceptances (user_id);
create index if not exists sla_acceptances_supplier_idx on public.supplier_sla_acceptances (supplier_id);

create table if not exists public.supplier_verification_docs (
  id           uuid not null default gen_random_uuid() primary key,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  uploaded_by  uuid not null,
  kind         text not null,   -- 'cipc' | 'vat_cert' | 'insurance' | 'qualification' | 'other'
  url          text not null,   -- stored bucket path/URL; served via signed URLs
  uploaded_at  timestamptz not null default now()
);
alter table public.supplier_verification_docs enable row level security;
-- no policies: deny-by-default; all access via the service-role client.

create index if not exists verification_docs_supplier_idx on public.supplier_verification_docs (supplier_id);

-- Private bucket for verification documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('supplier-docs','supplier-docs',false, 15728640, array['application/pdf','image/jpeg','image/jpg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "supplier-docs upload" on storage.objects;
create policy "supplier-docs upload" on storage.objects for insert
  with check (((bucket_id = 'supplier-docs'::text) AND (auth.role() = 'authenticated'::text)));
