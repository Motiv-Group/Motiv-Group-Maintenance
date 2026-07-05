import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sendPushToMany } from '@/lib/push'
import { rateLimit } from '@/lib/rate-limit'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`quote-respond:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role, company_id').eq('id', user.id).single()

  const role = profile?.role ?? ''
  const callerCompanyId = profile?.company_id ?? null
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
    .select('ticket_id, amount, type, tickets(store_id, company_id, region_id, title)')
    .eq('id', params.id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isVariation = (quote as any).type === 'variation'
  const ticket = quote.tickets as any

  // Tenant guard — the quote's ticket must belong to the caller's company. The
  // admin client bypasses RLS, so without this an RM/supplier could act on any
  // company's quote by id.
  if (!ticket || !callerCompanyId || ticket.company_id !== callerCompanyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Variation orders are approved by the regional manager only — never the client/store.
  if (isVariation && !isRM && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Store managers may only respond to their own store's ticket. v3: the store's
  // manager users are linked via store_users(user_id, store_id).
  if (isStoreManager) {
    const { data: link } = await adminClient
      .from('store_users').select('user_id').eq('store_id', ticket.store_id).eq('user_id', user.id).maybeSingle()
    if (!link) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Regional managers may only act on tickets in a region they manage.
  if (isRM) {
    const { data: links } = await adminClient
      .from('regional_users').select('region_id').eq('user_id', user.id)
    const regionIds = (links ?? []).map(l => l.region_id)
    if (!ticket.region_id || !regionIds.includes(ticket.region_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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

  // v3: the ticket is for a STORE; its manager user(s) are found via store_users.
  // Notified for normal quotes only — variations are an RM↔contractor matter.
  const notifyStoreManagers = !isStoreManager && !isVariation
  const { data: sm } = notifyStoreManagers
    ? await adminClient.from('store_users').select('user_id').eq('store_id', ticket.store_id)
    : { data: [] as { user_id: string }[] }
  const smIds = (sm ?? []).map(r => r.user_id)

  // Fire all notifications in parallel.
  await Promise.all([
    smIds.length
      ? adminClient.from('notifications').insert(smIds.map(smId => ({
          company_id: ticket.company_id,
          user_id: smId,
          type:    status === 'accepted' ? 'quote_accepted' : 'quote_declined',
          title:   status === 'accepted' ? 'Quote Approved' : 'Quote Declined',
          message: status === 'accepted'
            ? `Your quote for "${ticket.title}" has been approved and work will proceed.`
            : `The quote for "${ticket.title}" was declined.${reasonNote} A new quote will follow.`,
          link: `/client/tickets/${quote.ticket_id}`,
        })))
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
  if (smIds.length) {
    void sendPushToMany(smIds, {
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
