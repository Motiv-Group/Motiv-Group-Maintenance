import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runEstateSnapshots } from '@/lib/health/snapshots'
import { runRepeatDefectRecompute } from '@/lib/health/recompute'
import { runMorningBriefingPush } from '@/lib/briefing/push'

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
    // Morning briefing push (folded in to fit the Hobby 2-cron limit). Runs at
    // ~07:00 SAST via this cron's schedule. Isolated so it can't fail the snapshot.
    let briefings: { users: number; sent: number; skipped: number } | { error: string } | null = null
    try { briefings = await runMorningBriefingPush() }
    catch (e: any) { briefings = { error: e?.message ?? 'briefing push failed' } }
    // Purge archived completed-ticket notifications older than 3 days (folded in
    // here — previously only in the unscheduled v3-recompute route, so it never
    // ran). Isolated so a purge failure can't fail the snapshot.
    let purgedNotifications = 0
    try {
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await createAdminClient()
        .from('notifications').delete({ count: 'exact' })
        .not('archived_at', 'is', null).lt('archived_at', cutoff)
      purgedNotifications = count ?? 0
    } catch (e) { console.error('[cron] notification purge failed', e) }
    return NextResponse.json({ ok: true, repeat, summary, briefings, purgedNotifications })
  } catch (e) {
    console.error('[cron]', e)
    return NextResponse.json({ ok: false, error: 'Snapshot failed' }, { status: 500 })
  }
}

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: p } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  return p?.role === 'executive' || p?.role === 'system_admin'
}
