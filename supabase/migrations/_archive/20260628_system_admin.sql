-- ============================================================
-- Motiv — Platform admin (system_admin) account
-- Run in the Supabase SQL editor AFTER creating the auth user.
-- ============================================================
-- 1. Supabase Dashboard → Authentication → Users → "Add user": create the admin
--    with an email + password (this is the login — there is no admin/admin; it
--    is a real Supabase account).
-- 2. Replace the email below with that user's email and run this. It upserts the
--    user_profiles row and sets role = 'system_admin' (already a valid role key).
--    company_id is left null — the admin reads app-wide via the service role.

INSERT INTO public.user_profiles (id, email, role, full_name, active)
SELECT id, email, 'system_admin', 'Platform Admin', true
FROM auth.users
WHERE email = 'admin@motiv.example'      -- ← change to your admin's email
ON CONFLICT (id) DO UPDATE SET role = 'system_admin', active = true;
