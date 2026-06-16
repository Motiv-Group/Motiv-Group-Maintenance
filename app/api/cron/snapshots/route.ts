import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runDailySnapshots } from '@/lib/dashboards/snapshots'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/snapshots — daily health snapshot job.
// Authorised by the Vercel Cron secret (Authorization: Bearer $CRON_SECRET)
// or by a signed-in executive (manual trigger).
export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const summary = await runDailySnapshots()
    return NextResponse.json({ ok: true, summary })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Snapshot failed' }, { status: 500 })
  }
}

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true
  // manual trigger by an executive
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'executive'
}
