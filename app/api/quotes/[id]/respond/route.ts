import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sendPushToUser, sendPushToMany } from '@/lib/push'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()

  const role = profile?.role ?? ''
  const isStoreManager = role === 'store_manager' || role === 'client'
  const isRM            = role === 'regional_manager'
  const isAdmin         = role === 'supplier'

  if (!isStoreManager && !isRM && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { status, decline_reason } = body

  const allowedStatuses = isStoreManager
    ? ['accepted', 'declined']
    : ['accepted', 'declined', 'pending']

  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: quote } = await adminClient
    .from('quotes')
    .select('ticket_id, amount, type, tickets(client_id, title)')
    .eq('id', params.id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isVariation = (quote as any).type === 'variation'
  const ticket = quote.tickets as any

  // Variation orders are approved by the regional manager only — never the client/store.
  if (isVariation && !isRM && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isStoreManager && ticket?.client_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const quoteUpdate: Record<string, unknown> = { status }
  if (status === 'declined' && decline_reason) {
    quoteUpdate.decline_reason = decline_reason
  } else if (status !== 'declined') {
    quoteUpdate.decline_reason = null
  }

  // Variation: approve → 'variation_accepted' (badge reads "Variation Accepted",
  // work continues); decline → back to 'in_progress' (proceed on original scope);
  // revert → re-parks it as 'variation_pending'.
  const ticketStatus = isVariation
    ? (status === 'pending' ? 'variation_pending' : status === 'accepted' ? 'variation_accepted' : 'in_progress')
    : status === 'accepted' ? 'accepted'
    : status === 'pending'  ? 'quoted'
    : isRM                  ? 'declined'
    : 'open'

  const reasonNote = decline_reason ? ` Reason: "${decline_reason}".` : ''
  const actorLabel = isRM ? 'Regional manager' : isStoreManager ? 'Store manager' : 'supplier'
  const noun       = isVariation ? 'variation order' : 'quote'

  // Update quote + ticket status + fetch admins in parallel
  const [, , { data: admins }] = await Promise.all([
    adminClient.from('quotes').update(quoteUpdate).eq('id', params.id),
    adminClient.from('tickets').update({ status: ticketStatus }).eq('id', quote.ticket_id),
    adminClient.from('user_profiles').select('id').eq('role', 'supplier'),
  ])

  const titleNoun = isVariation ? 'Variation Order' : 'Quote'

  // Fire all notifications in parallel.
  // Client is notified for normal quotes only — variations are an RM↔contractor matter.
  await Promise.all([
    ticket?.client_id && !isStoreManager && !isVariation
      ? adminClient.from('notifications').insert({
          user_id: ticket.client_id,
          type:    status === 'accepted' ? 'quote_accepted' : 'quote_declined',
          title:   status === 'accepted' ? 'Quote Approved' : 'Quote Declined',
          message: status === 'accepted'
            ? `Your quote for "${ticket.title}" has been approved and work will proceed.`
            : `The quote for "${ticket.title}" was declined.${reasonNote} A new quote will follow.`,
          link: `/client/tickets/${quote.ticket_id}`,
        })
      : Promise.resolve(),
    admins?.length
      ? adminClient.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.id,
            type:    status === 'accepted' ? 'quote_accepted' : 'quote_declined',
            title:   status === 'accepted' ? `${titleNoun} Accepted` : `${titleNoun} Declined`,
            message: status === 'accepted'
              ? `${actorLabel} accepted the ${noun} of R${quote.amount} for "${ticket?.title}".`
              : `${actorLabel} declined the ${noun} of R${quote.amount} for "${ticket?.title}".${reasonNote}`,
            link: `/supplier/tickets/${quote.ticket_id}`,
          }))
        )
      : Promise.resolve(),
  ])

  // Fire push — non-blocking
  if (ticket?.client_id && !isStoreManager && !isVariation) {
    void sendPushToUser(ticket.client_id, {
      title: status === 'accepted' ? 'Quote Approved' : 'Quote Declined',
      body: status === 'accepted'
        ? `Your quote for "${ticket.title}" has been approved.`
        : `The quote for "${ticket.title}" was declined.${reasonNote}`,
      url: `/client/tickets/${quote.ticket_id}`,
    })
  }
  if (admins?.length) {
    void sendPushToMany(admins.map((a: any) => a.id), {
      title: status === 'accepted' ? `${titleNoun} Accepted` : `${titleNoun} Declined`,
      body: `${actorLabel} ${status === 'accepted' ? 'accepted' : 'declined'} the ${noun} for "${ticket?.title}".`,
      url: `/supplier/tickets/${quote.ticket_id}`,
    })
  }

  revalidatePath('/supplier/tickets')
  revalidatePath(`/supplier/tickets/${quote.ticket_id}`)
  revalidatePath('/supplier')
  return NextResponse.json({ success: true })
}
