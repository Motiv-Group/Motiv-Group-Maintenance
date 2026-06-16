import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { assembleEstateDashboard } from '@/lib/dashboards/data'

export const dynamic = 'force-dynamic'

// GET /api/dashboards/executive — full estate dashboard payload (executives only).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'executive') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await assembleEstateDashboard()
  return NextResponse.json(data)
}
