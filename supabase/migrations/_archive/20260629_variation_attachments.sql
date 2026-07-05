-- Variation orders can carry supporting photos / documents the supplier uploads
-- when raising the variation. Stored as an array of public storage URLs.
alter table if exists ticket_variations
  add column if not exists file_urls text[] not null default '{}';
