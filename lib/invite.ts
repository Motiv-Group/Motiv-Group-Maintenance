import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'

export type InviteRole = 'regional_manager' | 'store_manager' | 'supplier'

interface InviteOpts {
  email: string
  role: InviteRole
  companyId: string
  roleLabel: string
  baseUrl?: string
  link: { regionId?: string; storeId?: string; supplierId?: string }
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

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite', email: opts.email.trim().toLowerCase(),
    options: { data: { role: opts.role, company_id: opts.companyId }, redirectTo },
  } as any)
  if (error || !data?.user) {
    throw new Error(error?.message?.includes('already') ? 'That email already has an account.' : (error?.message ?? 'Invite failed'))
  }
  const uid = data.user.id

  // Ensure profile carries company + role (trigger sets from metadata; enforce here).
  await admin.from('user_profiles').upsert({ id: uid, role: opts.role, company_id: opts.companyId }, { onConflict: 'id' })

  if (opts.link.regionId) await admin.from('regional_users').upsert({ user_id: uid, region_id: opts.link.regionId })
  if (opts.link.storeId) await admin.from('store_users').upsert({ user_id: uid, store_id: opts.link.storeId })
  if (opts.link.supplierId) await admin.from('supplier_users').upsert({ user_id: uid, supplier_id: opts.link.supplierId })

  const actionLink = (data.properties as any)?.action_link ?? null
  const emailed = await sendInviteEmail(opts.email, actionLink, opts.roleLabel)
  return { userId: uid, actionLink, emailed }
}

async function sendInviteEmail(to: string, link: string | null, roleLabel: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM
  if (!key || !from || !link) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to, subject: `You've been invited to MOTIV as ${roleLabel}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#0a0e17">Welcome to MOTIV</h2>
          <p>You've been added as <strong>${roleLabel}</strong>. Set your password to get started:</p>
          <p><a href="${link}" style="display:inline-block;background:#C6A35D;color:#0a0e17;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Set password &amp; sign in</a></p>
          <p style="color:#666;font-size:12px">If the button doesn't work, paste this link:<br>${link}</p>
        </div>`,
      }),
    })
    return res.ok
  } catch { return false }
}
