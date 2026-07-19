import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { buildEmail } from '@/lib/emails/server'
import { randomBytes } from 'crypto'

type Admin = ReturnType<typeof createAdminClient>

export interface SupplierInviteResult { supplierId: string; emailed: boolean; actionLink: string | null; message: string }

/** Best-effort company name for an email-only invite: use the domain (e.g.
 *  flowfix.co.za → "Flowfix") unless it's a free-mail provider, else a neutral
 *  placeholder. The supplier confirms/edits their real name at onboarding. */
export function supplierPlaceholderName(email: string): string {
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  const free = /^(gmail|outlook|hotmail|yahoo|live|icloud|proton(mail)?|ymail|aol|mail|webmail|mweb|telkomsa|vodamail|gmx|zoho)\./
  if (domain && !free.test(domain)) {
    const core = domain.split('.')[0]
    if (core) return core.charAt(0).toUpperCase() + core.slice(1)
  }
  return 'Invited supplier'
}

// Link an existing supplier ORG (matched by email, ANY existing supplier) to a
// company, or create + invite a brand-new one. Suppliers are competing outsiders
// shared across companies, so an existing supplier is REUSED (a company_suppliers
// link is added) rather than duplicated — this is the single source of truth for
// both the admin (/api/admin/accounts) and exec/RM (/api/provision) invite paths.
export async function linkOrInviteSupplier(admin: Admin, opts: {
  companyId: string
  supplierName: string
  email: string
  phone?: string | null
  address?: string
  actorId: string
  origin: string
  inviterCompany: string | null
  inviterName?: string | null
  message?: string | null
}): Promise<SupplierInviteResult> {
  const email = opts.email.trim().toLowerCase()
  const base = opts.origin.replace(/\/$/, '')
  const { data: existingSup } = await admin.from('suppliers').select('id, company_name').ilike('email', email).limit(1).maybeSingle()
  const name = opts.supplierName.trim() || existingSup?.company_name || supplierPlaceholderName(email)

  let supplierId: string
  if (existingSup?.id) {
    supplierId = existingSup.id
  } else {
    const { data: sup, error } = await admin.from('suppliers')
      .insert({ company_id: opts.companyId, company_name: name, email, phone: opts.phone ?? null, address: opts.address || null, source: 'invited' })
      .select('id').single()
    if (error || !sup) throw new Error(error?.message ?? 'Could not create supplier')
    supplierId = sup.id
  }

  // Persist the company<->supplier membership (idempotent).
  await admin.from('company_suppliers').upsert(
    { company_id: opts.companyId, supplier_id: supplierId, source: 'admin_invite', invited_by: opts.actorId },
    { onConflict: 'company_id,supplier_id' },
  )

  // Already has a login → no onboarding link; send the "you've been added" note.
  const { data: existingUser } = await admin.from('user_profiles').select('id').ilike('email', email).maybeSingle()
  if (existingUser) {
    const { subject, html, text } = await buildEmail('supplier_added', { company: opts.inviterCompany ?? name, inviter: opts.inviterName ?? null, loginUrl: `${base}/auth/login` })
    const emailed = await sendEmail({ to: email, subject, html, text })
    return { supplierId, emailed, actionLink: null, message: emailed ? 'Supplier already had an account — linked and notified.' : 'Supplier already had an account — linked.' }
  }

  // Otherwise send a set-up (onboarding) invite for this company.
  const token = randomBytes(24).toString('hex')
  const { error: invErr } = await admin.from('supplier_invites').insert({ company_id: opts.companyId, supplier_id: supplierId, email, token })
  if (invErr) throw new Error(invErr.message)
  const link = `${base}/auth/supplier-onboard?token=${token}`
  const { subject, html, text } = await buildEmail('supplier_invite', { link, base, inviterCompany: opts.inviterCompany, message: opts.message ?? null })
  const emailed = await sendEmail({ to: email, subject, html, text })
  return { supplierId, emailed, actionLink: emailed ? null : link, message: emailed ? 'Supplier invited — set-up email sent.' : 'Supplier invited. Email not sent — copy the link below.' }
}

// Invite a supplier into the shared MOTIV pool (no client company). They onboard
// via the invite token (company_id null), land as pending_review, and the admin
// verifies them in the Suppliers → Review tab (approve → is_motiv). Deduped by
// email — an existing supplier is not re-created.
export async function inviteMotivSupplier(admin: Admin, opts: {
  supplierName: string
  email: string
  phone?: string | null
  address?: string
  trades?: string[]
  origin: string
}): Promise<SupplierInviteResult> {
  const email = opts.email.trim().toLowerCase()
  const base = opts.origin.replace(/\/$/, '')
  const { data: existing } = await admin.from('suppliers').select('id').ilike('email', email).limit(1).maybeSingle()
  if (existing?.id) {
    return { supplierId: existing.id, emailed: false, actionLink: null, message: 'That email is already a supplier on Motiv.' }
  }
  const name = opts.supplierName.trim() || supplierPlaceholderName(email)
  const trades = opts.trades && opts.trades.length ? opts.trades : null
  const { data: sup, error } = await admin.from('suppliers').insert({
    company_id: null, company_name: name, email, phone: opts.phone ?? null, address: opts.address || null,
    trades, trade: trades?.[0] ?? null, source: 'motiv_invite', is_motiv: false, verification_status: 'unverified', active: true,
  }).select('id').single()
  if (error || !sup) throw new Error(error?.message ?? 'Could not create supplier')

  const token = randomBytes(24).toString('hex')
  const { error: invErr } = await admin.from('supplier_invites').insert({ company_id: null, supplier_id: sup.id, email, token })
  if (invErr) { await admin.from('suppliers').delete().eq('id', sup.id); throw new Error(invErr.message) }
  const link = `${base}/auth/supplier-onboard?token=${token}`
  const { subject, html, text } = await buildEmail('supplier_invite', { link, base, inviterCompany: 'Motiv', message: null })
  const emailed = await sendEmail({ to: email, subject, html, text })
  return { supplierId: sup.id, emailed, actionLink: emailed ? null : link, message: emailed ? 'Motiv supplier invited — set-up email sent.' : 'Motiv supplier invited. Email not sent — copy the link below.' }
}
