import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
  const { full_name, phone, role } = body
  const updateData: Record<string, unknown> = { full_name, phone: normalisePhone(phone) }
  // role self-selectable on first signup (company assigned by an admin)
  if (typeof role === 'string' && ROLES.includes(role)) updateData.role = role

  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('user_profiles').update(updateData).eq('id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile })
}
