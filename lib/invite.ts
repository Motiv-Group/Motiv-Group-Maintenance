import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { motivBrandedEmailHtml } from '@/lib/email'
import { signAccountToken } from '@/lib/auth-token'

export type InviteRole = 'regional_manager' | 'store_manager' | 'supplier' | 'executive'

interface InviteOpts {
  email: string
  role: InviteRole
  companyId: string
  roleLabel: string
  baseUrl?: string
  link: { regionId?: string; storeId?: string; supplierId?: string }
  // Optional profile fields captured by the inviter (admin) → stored immediately so
  // the account is complete before the invitee even sets their password.
  profile?: { fullName?: string; phone?: string | null; address?: string; subStore?: string; branchCode?: string }
}

/**
 * Create an invited user (auth + profile + scope link) and email a set-password
 * link via Resend. Returns the action link too, so the inviter can copy/share
 * it if email isn't configured. Auth users are created via generateLink (no
 * Supabase SMTP needed); we send the link ourselves.
 */
export async function inviteUser(opts: InviteOpts): Promise<{ userId: string; actionLink: string | null; emailed: boolean }> {
  const admin = createAdminClient()
  const base = (opts.baseUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  const p = opts.profile ?? {}
  // Create the (confirmed, password-less) auth user directly — the invitee sets
  // their password via our own signed-token link, so we don't use Supabase's
  // invite/verify/OTP flow at all.
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email.trim().toLowerCase(),
    email_confirm: true,
    user_metadata: { role: opts.role, company_id: opts.companyId, full_name: p.fullName, phone: p.phone },
  })
  if (error || !data?.user) {
    throw new Error(/already|registered|exists/i.test(error?.message ?? '') ? 'That email already has an account.' : (error?.message ?? 'Invite failed'))
  }
  const uid = data.user.id

  // Ensure profile carries company + role + any admin-entered details (the trigger
  // seeds from metadata; enforce here so the account is complete on creation).
  await admin.from('user_profiles').upsert({
    id: uid, role: opts.role, company_id: opts.companyId,
    ...(p.fullName !== undefined ? { full_name: p.fullName } : {}),
    ...(p.phone !== undefined && p.phone !== null ? { phone: p.phone } : {}),
    ...(p.address !== undefined ? { address: p.address } : {}),
    ...(p.subStore !== undefined ? { sub_store: p.subStore } : {}),
    ...(p.branchCode !== undefined ? { branch_code: p.branchCode } : {}),
  }, { onConflict: 'id' })

  if (opts.link.regionId) await admin.from('regional_users').upsert({ user_id: uid, region_id: opts.link.regionId })
  if (opts.link.storeId) await admin.from('store_users').upsert({ user_id: uid, store_id: opts.link.storeId })
  if (opts.link.supplierId) await admin.from('supplier_users').upsert({ user_id: uid, supplier_id: opts.link.supplierId })

  // Link to our confirm page carrying a signed token (uid + 1-month expiry). The
  // page sets the password server-side by verifying THIS token → that user — no
  // Supabase OTP, no browser session, prefetch-safe.
  const actionLink = `${base}/auth/confirm?t=${signAccountToken(uid, Date.now())}&type=invite`
  const emailed = await sendInviteEmail(opts.email, actionLink, opts.roleLabel, base)
  return { userId: uid, actionLink, emailed }
}

async function sendInviteEmail(to: string, link: string | null, roleLabel: string, base: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM
  if (!key || !from || !link) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject: `You've been invited to MOTIV as ${roleLabel}`,
        html: inviteEmailHtml(link, roleLabel, base),
      }),
    })
    return res.ok
  } catch { return false }
}

// Branded invite email — shares the MOTIV template with the password-reset email.
export function inviteEmailHtml(link: string, roleLabel: string, base: string): string {
  return motivBrandedEmailHtml({
    base,
    heading: "You're invited to MOTIV",
    lead: `You've been added as <strong style="color:#0d1f2d;">${roleLabel}</strong>.`,
    sub: 'Set your password to activate your account and sign in.',
    ctaLabel: 'Set password &amp; sign in',
    link,
    footerNote: "This invitation was sent by MOTIV. If you weren't expecting it, you can safely ignore this email.",
  })
}
