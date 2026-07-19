-- ---------------------------------------------------------------------------
-- 20260719_password_set_at
-- ---------------------------------------------------------------------------
-- Makes the invite / password-reset confirm link one-time. Stamped by
-- /api/auth/set-password on success; the confirm page compares it against the
-- link's issue time and redirects an already-used link to /auth/login instead of
-- showing the set-password form again. Idempotent.
alter table public.user_profiles add column if not exists password_set_at timestamptz;
