-- ============================================================
-- Supabase advisor follow-ups (SQL part). Run in the Supabase SQL Editor.
--
-- Locks down the SECURITY DEFINER functions that are NOT used by RLS policies and
-- should only be called server-side (service role) — so they're no longer exposed
-- as public/authenticated RPC endpoints:
--   * append_session_photo  — mutates whatsapp_sessions; only the webhook (admin
--     client / service role) calls it.
--   * handle_new_user, assign_store_job_ref — trigger functions; never meant to be
--     called directly.
-- Service role keeps EXECUTE (revokes below don't touch it), so the webhook + the
-- triggers keep working.
--
-- NOT touched: the app_* helpers (app_company_id, app_role, app_can_see_ticket,
-- app_region_ids, app_store_ids, app_supplier_ids, app_is_company_wide). RLS
-- policies call these during query evaluation as the querying role, so they MUST
-- stay executable by anon/authenticated. Their "public/signed-in can execute"
-- advisor warnings are expected for this pattern and are safe — each returns only
-- the CALLER's own scoping data (keyed on auth.uid()), never another user's.
-- ============================================================

revoke execute on function public.append_session_photo(uuid, text) from anon, authenticated;
revoke execute on function public.handle_new_user()                 from anon, authenticated;
revoke execute on function public.assign_store_job_ref()            from anon, authenticated;
