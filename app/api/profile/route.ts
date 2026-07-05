import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

import { serverError } from '@/lib/api-error'
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`
  if (raw.trim().startsWith('+')) return `+${digits}`
  return `+${digits}`
}

const ROLES = ['store_manager', 'regional_manager', 'supplier', 'executive', 'system_admin']

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('*').eq('id', user.id).single()
  return NextResponse.json({ profile })
}

export async function PATCH(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json()
  const { full_name, phone, role, address, company_name, sub_store, branch_code, requested_region_code } = body
  const updateData: Record<string, unknown> = { full_name, phone: normalisePhone(phone) }
  // optional profile fields — only set when provided so partial saves don't blank them
  if (typeof address === 'string') updateData.address = address
  if (typeof company_name === 'string') updateData.company_name = company_name
  if (typeof sub_store === 'string') updateData.sub_store = sub_store
  if (typeof branch_code === 'string') updateData.branch_code = branch_code
  // RM can correct the region code they used at signup, while still pending
  if (typeof requested_region_code === 'string') updateData.requested_region_code = requested_region_code.trim().toUpperCase()
  // role self-selectable on first signup (company assigned by an admin)
  if (typeof role === 'string' && ROLES.includes(role)) updateData.role = role

  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('user_profiles').update(updateData).eq('id', user.id).select().single()
  if (error) return serverError(error)
  return NextResponse.json({ profile })
}
