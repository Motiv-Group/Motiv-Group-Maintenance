import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToUser, sendPushToMany } from '@/lib/push'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!rateLimit(`review:${user.id}`, 20, 60_000))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { status, reject_reason, score, comment } = body

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 })
  }
  if (status === 'rejected' && !reject_reason?.trim()) {
    return NextResponse.json({ error: 'Reject reason is required' }, { status: 400 })
  }
  if (status === 'approved' && (!score || score < 1 || score > 5)) {
    return NextResponse.json({ error: 'A rating (1-5) is required when approving' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: completion } = await adminClient
    .from('completions')
    .select('ticket_id, admin_id, tickets(title, client_id)')
    .eq('id', params.id)
    .single()

  if (!completion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ticket = (completion as any).tickets
  const ticketStatus = status === 'approved' ? 'completed' : 'snag'

  // Write completion update, ticket status, rating, and fetch admins — all in parallel
  const [, , , { data: admins }] = await Promise.all([
    adminClient.from('completions').update({
      status,
      reject_reason: status === 'rejected' ? reject_reason : null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', params.id),
    adminClient.from('tickets').update({ status: ticketStatus }).eq('id', completion.ticket_id),
    status === 'approved' && score
      ? adminClient.from('ratings').insert({
          ticket_id:     completion.ticket_id,
          completion_id: params.id,
          rated_by:      user.id,
          contractor_id: completion.admin_id,
          score,
          comment:       comment || null,
        })
      : Promise.resolve(),
    adminClient.from('profiles').select('id').eq('role', 'supplier'),
  ])

  // Fire all notifications in parallel
  await Promise.all([
    admins?.length && ticket
      ? adminClient.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.id,
            type: status === 'approved' ? 'sign_off_approved' : 'sign_off_rejected',
            title: status === 'approved' ? 'Sign-off Approved' : 'Sign-off Rejected — Snag',
            message: status === 'approved'
              ? `Regional manager approved the COC/POC for "${ticket.title}". Rated ${score}/5.`
              : `Regional manager rejected the COC/POC for "${ticket.title}". Reason: "${reject_reason}". Ticket moved to Snag.`,
            link: `/supplier/tickets/${completion.ticket_id}`,
          }))
        )
      : Promise.resolve(),
    status === 'approved' && ticket?.client_id
      ? adminClient.from('notifications').insert({
          user_id: ticket.client_id,
          type: 'sign_off_approved',
          title: 'Job Completed & Signed Off',
          message: `Your ticket "${ticket.title}" has been approved and marked as completed.`,
          link: `/client/tickets/${completion.ticket_id}`,
        })
      : Promise.resolve(),
  ])

  // Fire push — non-blocking
  if (admins?.length && ticket) {
    void sendPushToMany(admins.map((a: any) => a.id), {
      title: status === 'approved' ? 'Sign-off Approved' : 'Sign-off Rejected — Snag',
      body: status === 'approved'
        ? `COC/POC approved for "${ticket.title}". Rated ${score}/5.`
        : `COC/POC rejected for "${ticket.title}". Moved to Snag.`,
      url: `/supplier/tickets/${completion.ticket_id}`,
    })
  }
  if (status === 'approved' && ticket?.client_id) {
    void sendPushToUser(ticket.client_id, {
      title: 'Job Completed & Signed Off',
      body: `Your ticket "${ticket.title}" has been approved and marked as completed.`,
      url: `/client/tickets/${completion.ticket_id}`,
    })
  }

  revalidatePath('/supplier/tickets/' + completion.ticket_id)
  revalidatePath('/supplier/tickets')
  revalidatePath('/supplier')
  revalidatePath('/supplier/snag')
  revalidatePath('/regional/signoff')
  revalidatePath('/regional/snag')

  return NextResponse.json({ success: true })
}
