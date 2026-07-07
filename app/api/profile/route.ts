import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { serverError } from '@/lib/api-error'
import { parseJsonBody } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`
  if (raw.trim().startsWith('+')) return `+${digits}`
  return `+${digits}`
}


export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('*').eq('id', user.id).single()
  return NextResponse.json({ profile })
}

const PatchSchema = z.object({
  full_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  company_name: z.string().optional().nullable(),
  sub_store: z.string().optional().nullable(),
  branch_code: z.string().optional().nullable(),
  requested_region_code: z.string().optional().nullable(),
})

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`profile:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, PatchSchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  // SECURITY: `role` is NOT accepted here. Letting a user set their own role via
  // this service-role update was a privilege-escalation hole (anyone could PATCH
  // {role:'system_admin'}). Role is owned by the signup trigger ('individual' only)
  // and the trusted admin invite / onboard paths — never by self-service.
  const { full_name, phone, address, company_name, sub_store, branch_code, requested_region_code } = body
  const updateData: Record<string, unknown> = { full_name, phone: normalisePhone(phone) }
  // optional profile fields — only set when provided so partial saves don't blank them
  if (typeof address === 'string') updateData.address = address
  if (typeof company_name === 'string') updateData.company_name = company_name
  if (typeof sub_store === 'string') updateData.sub_store = sub_store
  if (typeof branch_code === 'string') updateData.branch_code = branch_code
  // RM can correct the region code they used at signup, while still pending
  if (typeof requested_region_code === 'string') updateData.requested_region_code = requested_region_code.trim().toUpperCase()

  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('user_profiles').update(updateData).eq('id', user.id).select().single()
  if (error) return serverError(error)
  return NextResponse.json({ profile })
}
