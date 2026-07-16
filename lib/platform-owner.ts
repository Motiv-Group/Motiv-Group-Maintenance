// SEC-014 (decision D5): app_settings / branding is a GLOBAL, platform-wide config
// (one row, no company_id). To stop any company's system_admin — in a future
// multi-tenant / white-label setup — from overwriting everyone's branding, writes
// are restricted to a single platform owner.
//
// Set PLATFORM_OWNER_USER_ID to that account's user id to lock it down. While the
// env var is UNSET (current single-tenant reality), any system_admin may write, so
// there is no lockout risk before the owner configures it.

export function isPlatformOwner(userId: string): boolean {
  const owner = process.env.PLATFORM_OWNER_USER_ID
  if (!owner) return true // not configured → don't restrict (single-tenant default)
  return userId === owner
}
