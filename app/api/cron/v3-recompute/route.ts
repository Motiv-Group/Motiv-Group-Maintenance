import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { runRepeatDefectRecompute } from '@/lib/health/recompute'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/cron/v3-recompute — recompute persisted repeat-defect flags (all companies)
// and purge old archived notifications. Auth: Vercel cron secret OR a signed-in
// executive / system_admin.
export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const summary = await runRepeatDefectRecompute()
    // Delete completed-ticket notifications (archived) more than 3 days ago, globally.
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { count: purgedNotifications } = await createAdminClient()
      .from('notifications').delete({ count: 'exact' })
      .not('archived_at', 'is', null).lt('archived_at', cutoff)
    return NextResponse.json({ ok: true, summary, purgedNotifications: purgedNotifications ?? 0 })
  } catch (e) {
    console.error('[cron]', e)
    Sentry.captureException(e)   // SEC-040: handled 500s must reach Sentry
    return NextResponse.json({ ok: false, error: 'Recompute failed' }, { status: 500 })
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
