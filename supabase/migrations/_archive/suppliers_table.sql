-- Run this in your Supabase SQL Editor before deploying the suppliers feature

create table if not exists public.suppliers (
  id                    uuid primary key default uuid_generate_v4(),
  company_name          text not null,
  contact_name          text,
  email                 text,
  phone                 text,
  address               text,
  trade                 text,
  qualified             boolean not null default false,
  qualification_number  text,
  qualification_expiry  date,
  vat_number            text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute procedure public.set_updated_at();

-- RLS: only service-role (admin API) can access — anon/user never touches this table directly
alter table public.suppliers enable row level security;
