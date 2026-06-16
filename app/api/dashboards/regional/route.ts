import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { assembleRegionalDashboard } from '@/lib/dashboards/data'

export const dynamic = 'force-dynamic'

// GET /api/dashboards/regional — full regional dashboard payload for the
// signed-in regional manager.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await assembleRegionalDashboard(user.id)
  return NextResponse.json(data)
}
