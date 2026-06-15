import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToUser } from '@/lib/push'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!rateLimit(`completions:${user.id}`, 10, 60_000))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'supplier') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { ticket_id, coc_url, poc_urls, notes } = body

  if (!ticket_id) return NextResponse.json({ error: 'ticket_id required' }, { status: 400 })
  if (!poc_urls || poc_urls.length < 2) {
    return NextResponse.json({ error: 'At least 2 proof of completion photos required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: completion, error } = await adminClient
    .from('completions')
    .insert({ ticket_id, admin_id: user.id, coc_url: coc_url || null, poc_urls, notes: notes || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update ticket status and fetch ticket info in parallel
  const [, { data: ticket }] = await Promise.all([
    adminClient.from('tickets').update({ status: 'pending_sign_off' }).eq('id', ticket_id),
    adminClient.from('tickets').select('title, client_id').eq('id', ticket_id).single(),
  ])

  if (ticket) {
    const { data: storeProfile } = await adminClient
      .from('profiles').select('regional_manager_id').eq('id', ticket.client_id).single()

    // Fire both notifications in parallel
    await Promise.all([
      storeProfile?.regional_manager_id
        ? adminClient.from('notifications').insert({
            user_id: storeProfile.regional_manager_id,
            type: 'sign_off_request',
            title: 'Sign-off Required',
            message: `COC/POC submitted for "${ticket.title}". Please review and sign off.`,
            link: `/regional/tickets/${ticket_id}`,
          })
        : Promise.resolve(),
      adminClient.from('notifications').insert({
        user_id: ticket.client_id,
        type: 'sign_off_request',
        title: 'Job Submitted for Sign-off',
        message: `Work on "${ticket.title}" has been completed and submitted for regional sign-off.`,
        link: `/client/tickets/${ticket_id}`,
      }),
    ])

    // Fire push — non-blocking (inside if(ticket) so storeProfile is in scope)
    if (storeProfile?.regional_manager_id) {
      void sendPushToUser(storeProfile.regional_manager_id, {
        title: 'Sign-off Required',
        body: `COC/POC submitted for "${ticket.title}". Please review and sign off.`,
        url: `/regional/tickets/${ticket_id}`,
      })
    }
    void sendPushToUser(ticket.client_id, {
      title: 'Job Submitted for Sign-off',
      body: `Work on "${ticket.title}" has been submitted for regional sign-off.`,
      url: `/client/tickets/${ticket_id}`,
    })
  }

  revalidatePath('/supplier/tickets/' + ticket_id)
  revalidatePath('/supplier/tickets')
  revalidatePath('/supplier')

  return NextResponse.json({ completion }, { status: 201 })
}
