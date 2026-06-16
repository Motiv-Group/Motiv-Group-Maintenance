import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { recomputeActiveTickets } from '@/lib/dashboards/recompute'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/recompute — refresh active-ticket SLA/health caches (hourly).
export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const result = await recomputeActiveTickets()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Recompute failed' }, { status: 500 })
  }
}

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'executive'
}
