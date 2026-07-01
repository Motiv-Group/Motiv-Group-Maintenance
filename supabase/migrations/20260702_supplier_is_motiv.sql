-- Motiv-curated supplier pool: suppliers flagged is_motiv are a shared directory an
-- RM can pick from in addition to their own company's suppliers (the assign-supplier
-- pop-up gets a "My suppliers / Motiv suppliers" toggle).
alter table public.suppliers add column if not exists is_motiv boolean not null default false;
create index if not exists suppliers_is_motiv_idx on public.suppliers (is_motiv) where is_motiv;
