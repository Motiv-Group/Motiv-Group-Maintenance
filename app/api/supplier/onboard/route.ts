import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalisePhone } from '@/lib/csv'
import { rateLimit } from '@/lib/rate-limit'

// Custom-token supplier onboarding (no Supabase OTP). The link stays valid
// until accepted_at is set. GET validates the token; POST creates the auth user
// with the supplier's chosen password, links them to the company, and consumes
// the token.

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

// GET /api/supplier/onboard?token=... — validate + return prefill data
export async function GET(request: Request) {
  // Unauthenticated + token-gated → coarse global limit to slow token enumeration.
  if (!(await rateLimit('onboard-validate', 60, 60_000)))
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  const token = new URL(request.url).searchParams.get('token')
  const { inv, error, status } = await loadInvite(token)
  if (!inv) return NextResponse.json({ error }, { status })
  const admin = createAdminClient()
  const { data: sup } = await admin.from('suppliers').select('company_name, trade').eq('id', inv.supplier_id).single()
  return NextResponse.json({ ok: true, email: inv.email, companyName: sup?.company_name ?? '', trade: sup?.trade ?? '' })
}

// POST /api/supplier/onboard — create the supplier account + link + consume token
export async function POST(request: Request) {
  if (!(await rateLimit('onboard-create', 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  const b = await request.json()
  const { inv, error, status } = await loadInvite(b.token)
  if (!inv) return NextResponse.json({ error }, { status })
  if (!b.password || String(b.password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  if (!b.company_name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const admin = createAdminClient()
  const email = inv.email.toLowerCase()
  const phone = normalisePhone(b.phone)

  // 1) create the login-ready auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: b.password, email_confirm: true,
    user_metadata: { role: 'supplier', company_id: inv.company_id, full_name: b.contact_name?.trim() || null },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'Could not create account'
    return NextResponse.json({ error: /already|registered|exists/i.test(msg) ? 'An account already exists for this email — please log in.' : msg }, { status: 400 })
  }
  const uid = created.user.id

  // 2) profile + supplier link (keeps them tied to the RM/exec company)
  await admin.from('user_profiles').upsert({
    id: uid, role: 'supplier', company_id: inv.company_id,
    full_name: b.contact_name?.trim() || null, phone, company_name: b.company_name.trim(), address: b.address?.trim() || null,
  }, { onConflict: 'id' })
  await admin.from('supplier_users').upsert({ user_id: uid, supplier_id: inv.supplier_id })

  // 3) enrich the suppliers row
  const supUpd: Record<string, unknown> = { company_name: b.company_name.trim(), email, phone }
  if (typeof b.contact_name === 'string') supUpd.contact_name = b.contact_name.trim() || null
  if (typeof b.address === 'string') supUpd.address = b.address.trim() || null
  if (typeof b.vat_number === 'string') supUpd.vat_number = b.vat_number.trim() || null
  if (typeof b.trade === 'string') supUpd.trade = b.trade.trim() || null
  await admin.from('suppliers').update(supUpd).eq('id', inv.supplier_id)

  // 4) consume the token
  await admin.from('supplier_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)

  return NextResponse.json({ ok: true, email })
}
