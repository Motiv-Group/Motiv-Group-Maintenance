// Morning briefing push — sends each push-subscribed user their daily briefing
// as a web-push notification. Triggered once a day from the v3-snapshots cron
// (folded in to fit the Vercel Hobby 2-cron limit). Shares the daily_briefings
// cache, so users on the same scope only cost one Groq call.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'
import { getBriefingForUser } from './generate'

const ROLE_HOME: Record<string, string> = {
  store_manager: '/client', client: '/client', supplier: '/supplier',
  regional_manager: '/regional', executive: '/executive', system_admin: '/executive',
}

const TIME_BUDGET_MS = 50_000 // stay under the cron's 60s maxDuration

export async function runMorningBriefingPush(now: Date = new Date()): Promise<{ users: number; sent: number; skipped: number }> {
  const db = createAdminClient()
  const { data: subs } = await db.from('push_subscriptions').select('user_id')
  const userIds = Array.from(new Set((subs ?? []).map(s => s.user_id).filter(Boolean)))
  if (!userIds.length) return { users: 0, sent: 0, skipped: 0 }

  const { data: profiles } = await db.from('user_profiles').select('id, role, company_id').in('id', userIds)
  const start = Date.now()
  let sent = 0, skipped = 0
  for (const p of (profiles ?? [])) {
    if (Date.now() - start > TIME_BUDGET_MS) { skipped++; continue }
    if (!p.company_id || !p.role) { skipped++; continue }
    try {
      const briefing = await getBriefingForUser({ userId: p.id, role: p.role, companyId: p.company_id, now })
      if (!briefing?.body) { skipped++; continue }
      await sendPushToUser(p.id, {
        title: briefing.headline || 'Your Motiv briefing',
        body: briefing.body,
        url: ROLE_HOME[p.role] ?? '/',
      })
      sent++
    } catch {
      skipped++
    }
  }
  return { users: userIds.length, sent, skipped }
}
