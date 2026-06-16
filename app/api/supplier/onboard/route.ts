import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalisePhone } from '@/lib/csv'

// POST /api/supplier/onboard — called from the supplier onboarding page after
// the invited user has set their password. Enriches their suppliers row +
// profile. The supplier_users link + company_id were set at invite time, so
// this just fills in the details and keeps them linked to the RM/exec company.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Your invite session has expired — open the invite link again.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: link } = await admin.from('supplier_users').select('supplier_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!link?.supplier_id) return NextResponse.json({ error: 'No supplier is linked to this account.' }, { status: 400 })

  const b = await request.json()
  if (!b.company_name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  const phone = normalisePhone(b.phone)

  const supUpdate: Record<string, unknown> = { company_name: b.company_name.trim(), email: user.email, phone }
  if (typeof b.contact_name === 'string') supUpdate.contact_name = b.contact_name.trim() || null
  if (typeof b.address === 'string') supUpdate.address = b.address.trim() || null
  if (typeof b.vat_number === 'string') supUpdate.vat_number = b.vat_number.trim() || null
  if (typeof b.trade === 'string') supUpdate.trade = b.trade.trim() || null

  const { error: supErr } = await admin.from('suppliers').update(supUpdate).eq('id', link.supplier_id)
  if (supErr) return NextResponse.json({ error: supErr.message }, { status: 400 })

  await admin.from('user_profiles').update({
    full_name: b.contact_name?.trim() || null,
    phone,
    company_name: b.company_name.trim(),
    address: b.address?.trim() || null,
  }).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
