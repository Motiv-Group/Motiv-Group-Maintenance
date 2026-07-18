import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/notifications — the current user's notifications, enriched with the
// linked ticket's job_ref (for compact display + grouping).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  // Housekeeping: a completed ticket's notifications are archived; 3 days later
  // they're deleted for good. Clean this user's own on load (the daily cron does
  // it globally). archived_at is only set once the ticket completes.
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  await admin.from('notifications').delete().eq('user_id', user.id).not('archived_at', 'is', null).lt('archived_at', cutoff)

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(80)

  const rows = data ?? []
  const ticketIds = Array.from(new Set(rows.map(n => n.ticket_id).filter((v): v is string => Boolean(v))))
  const jobRef = new Map<string, string | null>()
  if (ticketIds.length) {
    const { data: tks } = await admin.from('tickets').select('id, job_ref').in('id', ticketIds)
    for (const t of tks ?? []) jobRef.set(t.id, t.job_ref ?? null)
  }
  const notifications = rows.map(n => ({ ...n, job_ref: n.ticket_id ? (jobRef.get(n.ticket_id) ?? null) : null }))

  return NextResponse.json({ notifications })
}

// PATCH /api/notifications
//   { id, read }  → set one notification's read state (allows marking unread)
//   {} (no body)  → mark all of the user's notifications as read
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`notifications:${user.id}`, 120, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => null)

  if (body && typeof body.id === 'string') {
    const read = body.read !== false // default true; pass read:false to mark unread
    await supabase.from('notifications').update({ read }).eq('user_id', user.id).eq('id', body.id)
    return NextResponse.json({ success: true })
  }

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  return NextResponse.json({ success: true })
}
