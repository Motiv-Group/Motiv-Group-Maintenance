import { createAdminClient } from '@/lib/supabase/server'
import { normalisePhone } from '@/lib/csv'
import { sendEmail, storeInviteEmail } from '@/lib/email'
import { sendWhatsAppText } from '@/lib/whatsapp'

export interface ProvisionInput {
  full_name:    string
  email:        string
  phone?:       string | null
  address?:     string | null
  company_name: string
  sub_store:    string
  branch_code:  string
  password:     string
}

export interface ProvisionResult {
  ok:            boolean
  reason?:       string          // populated when ok === false
  userId?:       string
  emailSent?:    boolean
  whatsappSent?: boolean
  phoneE164?:    string | null
  inviteText?:   string          // ready-to-share message (login link + credentials)
}

/**
 * Create one store-manager account, link it to the regional manager, and
 * auto-send a welcome message (email + best-effort WhatsApp). Returns a
 * structured result instead of throwing so the bulk caller can report per-row.
 */
export async function provisionStoreAccount(
  input: ProvisionInput,
  rm: { id: string; full_name?: string | null },
  appUrl: string,
): Promise<ProvisionResult> {
  const full_name    = input.full_name?.trim() ?? ''
  const email        = input.email?.trim().toLowerCase() ?? ''
  const company_name = input.company_name?.trim() ?? ''
  const sub_store    = input.sub_store?.trim() ?? ''
  const branch_code  = input.branch_code?.trim().toUpperCase() ?? ''
  const password     = input.password ?? ''
  const phoneE164    = normalisePhone(input.phone)
  const address      = input.address?.trim() || null

  if (!email)        return { ok: false, reason: 'Email is required' }
  if (!full_name)    return { ok: false, reason: 'Manager name is required' }
  if (!company_name) return { ok: false, reason: 'Company name is required' }
  if (!sub_store)    return { ok: false, reason: 'Branch / sub-store is required' }
  if (!branch_code)  return { ok: false, reason: 'Branch code is required' }
  if (password.length < 8) return { ok: false, reason: 'Password must be at least 8 characters' }

  const admin = createAdminClient()

  // Branch code must be unique across store profiles
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('branch_code', branch_code)
    .in('role', ['store_manager', 'client'])
    .limit(1)
  if (existing && existing.length > 0) {
    return { ok: false, reason: `Branch code "${branch_code}" is already in use` }
  }

  // Create the auth user (email pre-confirmed so they can log in immediately).
  // The handle_new_user trigger seeds the profile from this metadata.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone: phoneE164, address, company_name, sub_store, branch_code, role: 'store_manager' },
  })

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Could not create account'
    const friendly = /already|registered|exists|duplicate/i.test(msg)
      ? 'Email is already registered'
      : msg
    return { ok: false, reason: friendly }
  }

  const userId = created.user.id

  // Re-assert profile fields + link to this RM (belt-and-suspenders over the trigger).
  const { error: updateErr } = await admin
    .from('profiles')
    .update({
      role: 'store_manager',
      regional_manager_id: rm.id,
      full_name,
      phone: phoneE164,
      address,
      company_name,
      sub_store,
      branch_code,
    })
    .eq('id', userId)

  if (updateErr) {
    return { ok: false, reason: updateErr.message }
  }

  // Auto-send welcome message
  const loginUrl = `${appUrl.replace(/\/$/, '')}/auth/login`
  const { subject, html, text } = storeInviteEmail({
    managerName: full_name, loginUrl, email, password,
    rmName: rm.full_name, company: company_name, subStore: sub_store,
  })

  const emailSent    = await sendEmail({ to: email, subject, html, text })
  const whatsappSent = phoneE164 ? await sendWhatsAppText(phoneE164, text) : false

  return { ok: true, userId, emailSent, whatsappSent, phoneE164, inviteText: text }
}
