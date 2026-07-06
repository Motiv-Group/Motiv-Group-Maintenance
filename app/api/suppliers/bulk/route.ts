import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({
  suppliers: z.array(z.any()).optional(),
})

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!(await rateLimit(`suppliers-bulk:${user.id}`, 5, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { suppliers } = body
  if (!Array.isArray(suppliers) || suppliers.length === 0)
    return NextResponse.json({ error: 'No suppliers provided' }, { status: 400 })
  if (suppliers.length > 500)
    return NextResponse.json({ error: 'Maximum 500 suppliers per upload' }, { status: 400 })

  const rows = suppliers
    .filter((s: any) => s.company_name?.trim())
    .map((s: any) => ({
      company_name:          s.company_name.trim(),
      contact_name:          s.contact_name?.trim() || null,
      email:                 s.email?.trim() || null,
      phone:                 s.phone?.trim() || null,
      address:               s.address?.trim() || null,
      trade:                 s.trade?.trim() || null,
      qualified:             ['yes', 'true', '1'].includes(String(s.qualified ?? '').toLowerCase()),
      qualification_number:  s.qualification_number?.trim() || null,
      qualification_expiry:  s.qualification_expiry || null,
      vat_number:            s.vat_number?.trim() || null,
      notes:                 s.notes?.trim() || null,
    }))

  if (rows.length === 0)
    return NextResponse.json({ error: 'No valid rows — Company Name is required for each row' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.from('suppliers').insert(rows).select()

  if (error) return serverError(error)
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}
