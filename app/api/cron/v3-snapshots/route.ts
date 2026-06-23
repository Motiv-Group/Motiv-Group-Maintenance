import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runEstateSnapshots } from '@/lib/health/snapshots'
import { runRepeatDefectRecompute } from '@/lib/health/recompute'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/v3-snapshots — daily v3 health maintenance (all companies):
// recompute repeat-defect flags, then snapshot health for trend history.
// (Bundled into one daily job so it fits the Vercel Hobby 2-cron / daily limit.)
// Auth: Vercel cron secret OR a signed-in executive / system_admin.
export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const repeat = await runRepeatDefectRecompute()
    const summary = await runEstateSnapshots()
    return NextResponse.json({ ok: true, repeat, summary })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Snapshot failed' }, { status: 500 })
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
