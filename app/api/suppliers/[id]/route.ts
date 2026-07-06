import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  company_name: z.string().optional(),
  contact_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
  qualified: z.any().optional(),
  qualification_number: z.string().optional().nullable(),
  qualification_expiry: z.any().optional().nullable(),
  vat_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})
// Returns the caller's company_id when they are a supplier-role user, else null.
// company_id is required so mutations can be scoped to the caller's own company
// (the admin client bypasses RLS, so this is the only tenant guard).
async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (profile?.role !== 'supplier' || !profile.company_id) return null
  return { user, companyId: profile.company_id as string }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await rateLimit(`supplier-edit:${ctx.user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
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
    .eq('company_id', ctx.companyId)   // tenant guard — only your own company's suppliers
    .select()
    .maybeSingle()

  if (error) return serverError(error)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ supplier: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await rateLimit(`supplier-edit:${ctx.user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('suppliers')
    .delete()
    .eq('id', params.id)
    .eq('company_id', ctx.companyId)   // tenant guard
    .select('id')
    .maybeSingle()

  if (error) return serverError(error)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
