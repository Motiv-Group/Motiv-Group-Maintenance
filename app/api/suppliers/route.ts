import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  company_name: z.string(),
  contact_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
  qualified: z.boolean().optional().nullable(),
  qualification_number: z.string().optional().nullable(),
  qualification_expiry: z.string().optional().nullable(),
  vat_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// SEC-003/005/009/010/015: the `suppliers` table is company-scoped (FK company_id,
// RLS, and every other route filters by it). This collection route must both READ
// and WRITE within the caller's own company. requireAdmin() therefore captures
// company_id and rejects any supplier-role user without one (e.g. an unverified
// self-signup / Motiv-pool supplier), so it can never read or create global rows.
async function requireAdmin(): Promise<{ user: { id: string }; companyId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return null
  if (!profile.company_id) return null
  return { user, companyId: profile.company_id }
}

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('suppliers')
    .select('*')
    .eq('company_id', ctx.companyId)
    .order('company_name')

  if (error) return serverError(error)
  return NextResponse.json({ suppliers: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const user = ctx.user

  if (!(await rateLimit(`suppliers:${user.id}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const {
    company_name, contact_name, email, phone, address,
    trade, qualified, qualification_number, qualification_expiry,
    vat_number, notes,
  } = body

  if (!company_name?.trim())
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('suppliers')
    .insert({
      company_id: ctx.companyId,
      company_name: company_name.trim(),
      contact_name: contact_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      trade: trade?.trim() || null,
      qualified: !!qualified,
      qualification_number: qualification_number?.trim() || null,
      qualification_expiry: qualification_expiry || null,
      vat_number: vat_number?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return serverError(error)
  return NextResponse.json({ supplier: data }, { status: 201 })
}
