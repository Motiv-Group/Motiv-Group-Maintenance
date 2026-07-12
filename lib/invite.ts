import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'

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
  // Must be an ABSOLUTE url that is allow-listed in Supabase Auth → URL
  // Configuration → Redirect URLs, otherwise Supabase ignores it and drops the
  // invited user on the Site URL (logged in, no password set).
  const base = (opts.baseUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  // Suppliers land on a full onboarding form (company details + password);
  // RMs just set a password.
  const path = opts.role === 'supplier' ? '/auth/supplier-onboard' : '/auth/reset-password'
  const redirectTo = `${base}${path}`

  const p = opts.profile ?? {}
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite', email: opts.email.trim().toLowerCase(),
    options: { data: { role: opts.role, company_id: opts.companyId, full_name: p.fullName, phone: p.phone }, redirectTo },
  } as any)
  if (error || !data?.user) {
    throw new Error(error?.message?.includes('already') ? 'That email already has an account.' : (error?.message ?? 'Invite failed'))
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

  const actionLink = (data.properties as any)?.action_link ?? null
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

// Transactional invite email — table-based + inline styles for broad email-client
// support (Gmail/Outlook strip <style> + classes). Navy MOTIV header, blue CTA
// (the app's action colour), and a copy-paste fallback link.
export function inviteEmailHtml(link: string, roleLabel: string, base: string): string {
  return `<div style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0d1f2d;padding:20px 32px;">
          <img src="${base}/brand/motiv-symbol.png" alt="" width="34" height="28" style="display:inline-block;vertical-align:middle;border:0;height:28px;width:34px;" />
          <img src="${base}/brand/motiv-wordmark.png" alt="MOTIV" width="96" height="15" style="display:inline-block;vertical-align:middle;border:0;height:15px;width:96px;margin-left:10px;" />
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0d1f2d;">You're invited to MOTIV</h1>
          <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#374151;">You've been added as <strong style="color:#0d1f2d;">${roleLabel}</strong>.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">Set your password to activate your account and sign in.</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2563eb;">
            <a href="${link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Set password &amp; sign in</a>
          </td></tr></table>
          <p style="margin:26px 0 6px;font-size:12px;color:#6b7280;">Button not working? Copy and paste this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:#2563eb;text-decoration:none;">${link}</a></p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #eef0f2;background:#fafbfc;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">This invitation was sent by MOTIV. If you weren't expecting it, you can safely ignore this email.</p>
        </td></tr>
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#b4b8bf;text-align:center;">© MOTIV · Maintenance &amp; ticketing</p>
    </td></tr>
  </table>
</div>`
}
