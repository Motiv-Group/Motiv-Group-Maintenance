-- Prevent duplicate / orphan stores at the DB level.
--
-- Root cause of the "unassigned duplicates" seen in /admin/hierarchy: stores were
-- inserted with NO uniqueness guard, so a broken store-manager invite (before the
-- store-rollback fix landed) — or a retry of a failing invite — left several stores
-- with the same (company_id, branch_code) and no region / no SM.
--
-- The create paths now (a) roll back the store when the invite fails and (b) already
-- surface "Branch code already exists" on a duplicate error. This index makes that
-- guarantee hold at the DATABASE level regardless of code path, race, or partial
-- failure. Case-insensitive (branch codes are upper-cased on write, but be safe).
--
-- ⚠️ APPLY ONLY AFTER removing existing duplicates — creating a unique index fails
-- while duplicates remain. See the cleanup SQL provided alongside this migration:
--   1. delete orphan stores (no region + no SM + no tickets)
--   2. confirm no (company_id, lower(branch_code)) duplicates remain
--   3. run this index
-- Idempotent.
create unique index if not exists stores_company_branch_uidx
  on public.stores (company_id, lower(branch_code));
