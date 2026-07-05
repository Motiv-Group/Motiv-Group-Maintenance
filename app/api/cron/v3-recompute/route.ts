import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runRepeatDefectRecompute } from '@/lib/health/recompute'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/v3-recompute — recompute persisted repeat-defect flags (all companies).
// Auth: Vercel cron secret OR a signed-in executive / system_admin.
export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const summary = await runRepeatDefectRecompute()
    return NextResponse.json({ ok: true, summary })
  } catch (e) {
    console.error('[cron]', e)
    return NextResponse.json({ ok: false, error: 'Recompute failed' }, { status: 500 })
  }
}

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: p } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  return p?.role === 'executive' || p?.role === 'system_admin'
}
