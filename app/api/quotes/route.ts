import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { serverError, parseAmount } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

// POST /api/quotes — admin (contractor) only.
// Handles both normal quotes (type 'quote') and mid-job variation orders
// (type 'variation'). A variation goes to the regional manager only and parks
// the ticket in 'variation_pending' until approved.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!(await rateLimit(`quotes:${user.id}`, 30, 60_000)))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const callerCompanyId = profile?.company_id ?? null

  const body = await request.json()
  const { ticket_id, amount, amount_incl_vat, description, valid_until, file_url } = body
  const isVariation = body.type === 'variation'

  const validAmount = parseAmount(amount)
  if (validAmount === null) return NextResponse.json({ error: 'Enter a valid quote amount.' }, { status: 400 })

  // valid_until may be null when admin explicitly selects N/A (no expiry)
  // amount_incl_vat is null when supplier is not VAT-registered

  const adminClient = createAdminClient()

  // Enforce a single main quote per ticket. Variation orders are exempt.
  if (!isVariation) {
    const { data: existing } = await adminClient
      .from('quotes').select('id').eq('ticket_id', ticket_id).eq('type', 'quote').limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A quote already exists for this ticket. Edit the existing quote instead.' },
        { status: 409 },
      )
    }
  }

  const { data: quote, error } = await adminClient
    .from('quotes')
    .insert({
      ticket_id,
      admin_id: user.id,
      type: isVariation ? 'variation' : 'quote',
      amount: validAmount,
      ...(amount_incl_vat != null ? { amount_incl_vat } : {}),
      description,
      valid_until,
      ...(file_url ? { file_url } : {}),
    })
    .select()
    .single()

  if (error) return serverError(error)

  // A variation parks the job in 'variation_pending'; a normal quote moves it to 'quoted'.
  const newTicketStatus = isVariation ? 'variation_pending' : 'quoted'

  const [, { data: ticket }] = await Promise.all([
    adminClient.from('tickets').update({ status: newTicketStatus }).eq('id', ticket_id),
    adminClient.from('tickets').select('store_id, company_id, region_id, title').eq('id', ticket_id).single(),
  ])

  if (ticket) {
    // v3: a store links to its RM(s) through its region. Look up every RM for the
    // ticket's region and notify them all (may be 0, 1, or many).
    const { data: rms } = ticket.region_id
      ? await adminClient.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
      : { data: [] as { user_id: string }[] }
    const rmIds = (rms ?? []).map(r => r.user_id)

    if (isVariation) {
      // Variation order → regional manager(s) only (client is not involved in approval)
      if (rmIds.length) {
        await adminClient.from('notifications').insert(rmIds.map(rmId => ({
          user_id: rmId,
          type: 'new_variation',
          title: 'Variation Order Awaiting Approval',
          message: `A variation order has been raised for "${ticket.title}" and requires your approval before work continues.`,
          link: `/regional/tickets/${ticket_id}`,
        })))
        void sendPushToMany(rmIds, {
          title: 'Variation Order Awaiting Approval',
          body: `A variation order has been raised for "${ticket.title}".`,
          url: `/regional/tickets/${ticket_id}`,
        })
      }
    } else {
      // Normal quote → notify the store's manager(s) + regional manager(s).
      // v3: the ticket is for a STORE; its manager users are found via store_users.
      const { data: sm } = await adminClient.from('store_users').select('user_id').eq('store_id', ticket.store_id)
      const smIds = (sm ?? []).map(r => r.user_id)

      await Promise.all([
        smIds.length
          ? adminClient.from('notifications').insert(smIds.map(smId => ({
              company_id: ticket.company_id ?? callerCompanyId,
              user_id: smId,
              type: 'new_quote',
              title: 'Quote Received',
              message: `A quote has been submitted for your ticket: "${ticket.title}". Please await regional manager approval.`,
              link: `/client/tickets/${ticket_id}`,
            })))
          : Promise.resolve(),
        rmIds.length
          ? adminClient.from('notifications').insert(rmIds.map(rmId => ({
              user_id: rmId,
              type: 'new_quote',
              title: 'Quote Awaiting Your Approval',
              message: `A quote has been submitted for "${ticket.title}" and requires your approval.`,
              link: `/regional/tickets/${ticket_id}`,
            })))
          : Promise.resolve(),
      ])

      if (smIds.length) {
        void sendPushToMany(smIds, {
          title: 'Quote Received',
          body: `A quote has been submitted for your ticket: "${ticket.title}"`,
          url: `/client/tickets/${ticket_id}`,
        })
      }
      if (rmIds.length) {
        void sendPushToMany(rmIds, {
          title: 'Quote Awaiting Your Approval',
          body: `A quote has been submitted for "${ticket.title}" and requires your approval.`,
          url: `/regional/tickets/${ticket_id}`,
        })
      }
    }
  }

  revalidatePath('/client')
  revalidatePath('/supplier/tickets/' + ticket_id)
  revalidatePath('/supplier/tickets')
  revalidatePath('/supplier')
  revalidatePath('/regional/tickets/' + ticket_id)
  return NextResponse.json({ quote }, { status: 201 })
}
