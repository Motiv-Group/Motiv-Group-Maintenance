import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalisePhone, isValidEmail } from '@/lib/csv'
import { rateLimit } from '@/lib/rate-limit'
import { sanitiseTrades } from '@/lib/trades'
import { SLA_VERSION } from '@/lib/sla'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { logAudit } from '@/lib/audit'
import type { Database } from '@/lib/database.types'

const BodySchema = z.object({
  password: z.string().optional(),
  company_name: z.string().optional(),
  contact_name: z.string().optional(),
  trades: z.any().optional(),
  vat_registered: z.boolean().optional(),
  vat_number: z.string().optional().nullable(),
  sla_agreed: z.boolean().optional(),
  sla_signed_name: z.string().optional(),
  phone: z.string().optional().nullable(),
  token: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  email: z.string().optional(),
})

// Supplier onboarding — TWO entry paths, one wizard:
//
//  INVITED (token):     custom-token invite from an exec/RM (`supplier_invites`).
//                       The email is locked to the invite; the account links to the
//                       inviting company's supplier row. Valid until accepted_at.
//  SELF-SIGNUP (no token): general-public supplier registration ("Continue as
//                       Supplier" on /auth/signup). Creates a STANDALONE supplier
//                       (company_id null, source 'self_signup') that lands in the
//                       Motiv pool only AFTER admin approval (verification_status
//                       'pending_review' → 'verified' + is_motiv). Until then they
//                       can log in, upload verification docs, but receive no work.
//
// Both paths REQUIRE electronic SLA acceptance (version + typed name + timestamp
// + ip) recorded in supplier_sla_acceptances — the platform's signed agreement.
//
// SECURITY: the auth user is created here server-side with the service-role
// client. The signup trigger clamps any client-supplied role to 'individual', so
// the 'supplier' role can ONLY be granted by this trusted path — a browser cannot
// self-provision it via auth.signUp().

interface Invite { id: string; email: string; supplier_id: string; company_id: string; accepted_at: string | null; expires_at: string | null }

async function loadInvite(token: string | null): Promise<{ inv?: Invite; error?: string; status?: number }> {
  if (!token) return { error: 'Missing invite token.', status: 400 }
  const admin = createAdminClient()
  const { data } = await admin.from('supplier_invites')
    .select('id, email, supplier_id, company_id, accepted_at, expires_at').eq('token', token).maybeSingle()
  const inv = data as Invite | null
  if (!inv) return { error: 'This invite link is invalid.', status: 404 }
  if (inv.accepted_at) return { error: 'This invite has already been used — please log in.', status: 409 }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return { error: 'This invite link has expired.', status: 410 }
  return { inv }
}

// GET /api/supplier/onboard?token=... — validate + return prefill data (invited path)
export async function GET(request: Request) {
  // Unauthenticated + token-gated → coarse global limit to slow token enumeration.
  if (!(await rateLimit('onboard-validate', 60, 60_000)))
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  const token = new URL(request.url).searchParams.get('token')
  const { inv, error, status } = await loadInvite(token)
  if (!inv) return NextResponse.json({ error }, { status })
  const admin = createAdminClient()
  const { data: sup } = await admin.from('suppliers').select('company_name, trade, trades').eq('id', inv.supplier_id).single()
  return NextResponse.json({ ok: true, email: inv.email, companyName: sup?.company_name ?? '', trade: sup?.trade ?? '', trades: sup?.trades ?? [] })
}

// POST /api/supplier/onboard — create the supplier account (both paths)
export async function POST(request: Request) {
  if (!(await rateLimit('onboard-create', 20, 60_000)))
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const b = parsed.data
  const admin = createAdminClient()
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

  // ── Shared validation ──────────────────────────────────────────────────────
  if (!b.password || String(b.password).length < 8) return bad('Password must be at least 8 characters')
  if (!b.company_name?.trim()) return bad('Company name is required')
  if (!b.contact_name?.trim()) return bad('Contact person is required')
  const trades = sanitiseTrades(b.trades)
  if (!trades.length) return bad('Select at least one trade')
  const vatNumber = b.vat_registered ? String(b.vat_number ?? '').replace(/\s+/g, '') : null
  if (b.vat_registered && !/^4\d{9}$/.test(vatNumber ?? ''))
    return bad('Enter a valid VAT number (10 digits, starting with 4)')
  // SLA — the binding step. No signature, no account.
  const signedName = String(b.sla_signed_name ?? '').trim()
  if (b.sla_agreed !== true || !signedName) return bad('You must accept the Service Level Agreement (type your full name and tick the box).')
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const phone = normalisePhone(b.phone)

  // ── Path A: invited (token) ────────────────────────────────────────────────
  if (b.token) {
    const { inv, error, status } = await loadInvite(b.token)
    if (!inv) return bad(error!, status)
    const email = inv.email.toLowerCase()

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: b.password, email_confirm: true,
      user_metadata: { role: 'supplier', company_id: inv.company_id, full_name: b.contact_name.trim() },
    })
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? 'Could not create account'
      return bad(/already|registered|exists/i.test(msg) ? 'An account already exists for this email — please log in.' : msg)
    }
    const uid = created.user.id

    await admin.from('user_profiles').upsert({
      id: uid, role: 'supplier', company_id: inv.company_id,
      full_name: b.contact_name.trim(), phone, company_name: b.company_name.trim(), address: b.address?.trim() || null,
    }, { onConflict: 'id' })
    await admin.from('supplier_users').upsert({ user_id: uid, supplier_id: inv.supplier_id })

    const supUpd: Record<string, unknown> = {
      company_name: b.company_name.trim(), email, phone,
      contact_name: b.contact_name.trim(), trades, trade: trades[0] ?? null,
      vat_number: vatNumber, address: b.address?.trim() || null,
    }
    await admin.from('suppliers').update(supUpd as Database['public']['Tables']['suppliers']['Update']).eq('id', inv.supplier_id)

    await admin.from('supplier_sla_acceptances').insert({
      supplier_id: inv.supplier_id, user_id: uid, sla_version: SLA_VERSION, signed_name: signedName, ip,
    })
    await admin.from('supplier_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)

    await logAudit(admin, { actorId: uid, companyId: inv.company_id, action: 'supplier.onboard_invited', entityType: 'user', entityId: uid, metadata: { supplierId: inv.supplier_id, email } })
    return NextResponse.json({ ok: true, email, pending: false })
  }

  // ── Path B: self-signup (no token) ─────────────────────────────────────────
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!isValidEmail(email)) return bad('Enter a valid email address')

  // Friendly pre-check (authoritative uniqueness is enforced by createUser below).
  const { data: existing } = await admin.from('user_profiles').select('id').ilike('email', email).maybeSingle()
  if (existing) return bad('An account already exists for this email — please log in.')

  // 1) the supplier company row: standalone, pending review, NOT in the Motiv pool yet.
  const { data: sup, error: supErr } = await admin.from('suppliers').insert({
    company_id: null, company_name: b.company_name.trim(), contact_name: b.contact_name.trim(),
    email, phone, address: b.address?.trim() || null,
    trades, trade: trades[0] ?? null, vat_number: vatNumber,
    is_motiv: false, active: true, source: 'self_signup', verification_status: 'pending_review',
  }).select('id').single()
  if (supErr || !sup) return bad(supErr?.message ?? 'Could not register your company')

  // 2) the login (service-role path grants the supplier role — see header note).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: b.password, email_confirm: true,
    user_metadata: { role: 'supplier', full_name: b.contact_name.trim() },
  })
  if (createErr || !created?.user) {
    await admin.from('suppliers').delete().eq('id', sup.id) // roll back the orphan row
    const msg = createErr?.message ?? 'Could not create account'
    return bad(/already|registered|exists/i.test(msg) ? 'An account already exists for this email — please log in.' : msg)
  }
  const uid = created.user.id

  // 3) profile + link. company_id stays NULL — a standalone supplier serves the
  //    Motiv pool (after approval), not one client company.
  await admin.from('user_profiles').upsert({
    id: uid, role: 'supplier', company_id: null,
    full_name: b.contact_name.trim(), phone, company_name: b.company_name.trim(), address: b.address?.trim() || null,
  }, { onConflict: 'id' })
  await admin.from('supplier_users').upsert({ user_id: uid, supplier_id: sup.id })

  // 4) the signed SLA.
  await admin.from('supplier_sla_acceptances').insert({
    supplier_id: sup.id, user_id: uid, sla_version: SLA_VERSION, signed_name: signedName, ip,
  })

  // 5) tell the platform admins there is a supplier to review.
  const { data: admins } = await admin.from('user_profiles').select('id').eq('role', 'system_admin')
  const adminIds = (admins ?? []).map(a => a.id)
  if (adminIds.length) {
    await admin.from('notifications').insert(adminIds.map(id => ({
      company_id: null, user_id: id, type: 'supplier_review',
      title: 'New supplier ready for review',
      message: `${(b.company_name ?? '').trim()} just signed up and offers ${trades.join(', ')}. They're waiting for you to review and verify them.`,
      link: '/admin/suppliers',
    })))
  }

  await logAudit(admin, { actorId: uid, action: 'supplier.onboard_self_signup', entityType: 'user', entityId: uid, metadata: { supplierId: sup.id, email, companyName: b.company_name?.trim() } })
  return NextResponse.json({ ok: true, email, pending: true })
}
