import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return null
  return user
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    company_name, contact_name, email, phone, address,
    trade, qualified, qualification_number, qualification_expiry,
    vat_number, notes,
  } = body

  if (company_name !== undefined && !company_name?.trim())
    return NextResponse.json({ error: 'Company name cannot be empty' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('suppliers')
    .update({
      ...(company_name !== undefined     && { company_name: company_name.trim() }),
      ...(contact_name !== undefined     && { contact_name: contact_name?.trim() || null }),
      ...(email !== undefined            && { email: email?.trim() || null }),
      ...(phone !== undefined            && { phone: phone?.trim() || null }),
      ...(address !== undefined          && { address: address?.trim() || null }),
      ...(trade !== undefined            && { trade: trade?.trim() || null }),
      ...(qualified !== undefined        && { qualified: !!qualified }),
      ...(qualification_number !== undefined && { qualification_number: qualification_number?.trim() || null }),
      ...(qualification_expiry !== undefined && { qualification_expiry: qualification_expiry || null }),
      ...(vat_number !== undefined       && { vat_number: vat_number?.trim() || null }),
      ...(notes !== undefined            && { notes: notes?.trim() || null }),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ supplier: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('suppliers').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
