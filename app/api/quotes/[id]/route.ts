import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToUser, sendPushToMany } from '@/lib/push'

// PATCH /api/quotes/[id] — supplier edits their own MAIN quote.
// Allowed only while the quote is 'pending' or 'declined'; editing re-opens it
// as 'pending' for regional-manager approval. (Variation orders are not edited.)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!(await rateLimit(`quote-edit:${user.id}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { amount, amount_incl_vat, description, valid_until, file_url } = body

  const adminClient = createAdminClient()
  const { data: quote } = await adminClient
    .from('quotes')
    .select('id, admin_id, ticket_id, type, status')
    .eq('id', params.id)
    .single()

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (quote.admin_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (quote.type !== 'quote') return NextResponse.json({ error: 'Only the main quote can be edited' }, { status: 400 })
  if (!['pending', 'declined'].includes(quote.status))
    return NextResponse.json({ error: 'This quote can no longer be edited' }, { status: 409 })

  const { error } = await adminClient
    .from('quotes')
    .update({
      amount,
      amount_incl_vat: amount_incl_vat ?? null,
      description,
      valid_until,
      ...(file_url ? { file_url } : {}),
      status: 'pending',
      decline_reason: null,
    })
    .eq('id', params.id)

  if (error) return serverError(error)

  // Re-open for approval: ticket → quoted, re-notify client + RM.
  const [, { data: ticket }] = await Promise.all([
    adminClient.from('tickets').update({ status: 'quoted' }).eq('id', quote.ticket_id),
    adminClient.from('tickets').select('client_id, region_id, title').eq('id', quote.ticket_id).single(),
  ])

  if (ticket) {
    // v3: a store links to its RM(s) through its region. Notify every RM for the
    // ticket's region (may be 0, 1, or many).
    const { data: rms } = ticket.region_id
      ? await adminClient.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
      : { data: [] as { user_id: string }[] }
    const rmIds = (rms ?? []).map(r => r.user_id)

    await Promise.all([
      adminClient.from('notifications').insert({
        user_id: ticket.client_id,
        type: 'quote_updated',
        title: 'Quote Updated',
        message: `The quote for "${ticket.title}" was updated. Please await regional manager approval.`,
        link: `/client/tickets/${quote.ticket_id}`,
      }),
      rmIds.length
        ? adminClient.from('notifications').insert(rmIds.map(rmId => ({
            user_id: rmId,
            type: 'quote_updated',
            title: 'Updated Quote Awaiting Approval',
            message: `An updated quote for "${ticket.title}" requires your approval.`,
            link: `/regional/tickets/${quote.ticket_id}`,
          })))
        : Promise.resolve(),
    ])

    if (rmIds.length) {
      void sendPushToMany(rmIds, {
        title: 'Updated Quote Awaiting Approval',
        body: `An updated quote for "${ticket.title}" requires your approval.`,
        url: `/regional/tickets/${quote.ticket_id}`,
      })
    }
  }

  revalidatePath('/client')
  revalidatePath('/supplier/tickets/' + quote.ticket_id)
  revalidatePath('/supplier/tickets')
  revalidatePath('/supplier')
  revalidatePath('/regional/tickets/' + quote.ticket_id)
  return NextResponse.json({ success: true })
}
