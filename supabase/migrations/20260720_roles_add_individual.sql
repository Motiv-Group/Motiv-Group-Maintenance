-- The real cause of "Database error saving new user" on Individual signup:
-- user_profiles.role has a FOREIGN KEY (user_profiles_role_fkey) to the roles(key)
-- lookup table, and 'individual' was never seeded there — so the signup trigger's
-- insert fails the FK. Seed the row. Idempotent.
insert into public.roles (key, label) values ('individual', 'Individual')
on conflict (key) do nothing;
