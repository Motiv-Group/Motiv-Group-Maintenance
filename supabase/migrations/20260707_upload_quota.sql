-- Per-user upload quota (B5)
-- ---------------------------------------------------------------------------
-- Tracks cumulative bytes each user has uploaded (via POST /api/uploads, which
-- writes with the service-role client) and lets the route enforce a per-user
-- cap. `reserve_upload_quota` atomically checks-and-adds in one statement so
-- concurrent uploads can't both slip past the cap.
--
-- SECURITY: the function is SECURITY DEFINER and EXECUTE is revoked from
-- anon/authenticated — only the service-role (server) may call it. Otherwise a
-- signed-in user could RPC it with a NEGATIVE delta to zero their own counter
-- and bypass the quota. The upload route passes only positive byte counts.

alter table public.user_profiles
  add column if not exists storage_bytes_used bigint not null default 0;

-- Atomically add p_bytes to the user's usage IFF it stays within p_cap.
-- Returns true when the reservation succeeded (under cap), false otherwise.
create or replace function public.reserve_upload_quota(p_user uuid, p_bytes bigint, p_cap bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bytes <= 0 then
    return true; -- nothing to reserve
  end if;
  update public.user_profiles
    set storage_bytes_used = storage_bytes_used + p_bytes
    where id = p_user
      and storage_bytes_used + p_bytes <= p_cap;
  return found;
end;
$$;

revoke all on function public.reserve_upload_quota(uuid, bigint, bigint) from public;
revoke all on function public.reserve_upload_quota(uuid, bigint, bigint) from anon;
revoke all on function public.reserve_upload_quota(uuid, bigint, bigint) from authenticated;
