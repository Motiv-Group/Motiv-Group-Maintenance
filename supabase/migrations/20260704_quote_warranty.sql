-- Suppliers must state a warranty / guarantee on each quote (or explicitly "N/A").
alter table public.quotes add column if not exists warranty text;
