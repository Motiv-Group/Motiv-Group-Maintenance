import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToUser, sendPushToMany } from '@/lib/push'

// POST /api/regional/decline-ticket — RM declines a stale/unwanted ticket.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!rateLimit(`decline-ticket:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })
  }

  const { ticketId, reason } = await request.json()
  if (!ticketId) return NextResponse.json({ error: 'Missing ticket' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })

  const adminClient = createAdminClient()

  const { data: ticket } = await adminClient
    .from('tickets')
    .select('id, title, status, client_id, profiles(regional_manager_id)')
    .eq('id', ticketId)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  if ((ticket as any).profiles?.regional_manager_id !== user.id) {
    return NextResponse.json({ error: 'This ticket is not in your region.' }, { status: 403 })
  }

  const { error } = await adminClient
    .from('tickets').update({ status: 'declined' }).eq('id', ticketId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reasonNote = ` Reason: "${reason.trim()}".`
  const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'supplier')

  // Notify the store manager + all suppliers.
  await Promise.all([
    adminClient.from('notifications').insert({
      user_id: ticket.client_id,
      type: 'ticket_declined',
      title: 'Ticket Declined',
      message: `Your ticket "${ticket.title}" was declined by your regional manager.${reasonNote}`,
      link: `/client/tickets/${ticket.id}`,
    }),
    admins?.length
      ? adminClient.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.id,
            type: 'ticket_declined',
            title: 'Ticket Declined',
            message: `Regional manager declined the ticket "${ticket.title}".${reasonNote}`,
            link: `/supplier/tickets/${ticket.id}`,
          }))
        )
      : Promise.resolve(),
  ])

  void sendPushToUser(ticket.client_id, {
    title: 'Ticket Declined',
    body: `"${ticket.title}" was declined by your regional manager.`,
    url: `/client/tickets/${ticket.id}`,
  })
  if (admins?.length) {
    void sendPushToMany(admins.map((a: any) => a.id), {
      title: 'Ticket Declined',
      body: `Regional manager declined "${ticket.title}".`,
      url: `/supplier/tickets/${ticket.id}`,
    })
  }

  return NextResponse.json({ success: true })
}
