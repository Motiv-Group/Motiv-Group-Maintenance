import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToUser, sendPushToMany } from '@/lib/push'

// POST /api/tickets — create a new ticket
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!rateLimit(`tickets:${user.id}`, 10, 60_000))
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Closed stores cannot submit new tickets.
  const { data: me } = await supabase.from('profiles').select('closed_at').eq('id', user.id).single()
  if (me?.closed_at) {
    return NextResponse.json({
      error: 'Your store has been closed by your regional manager. You can no longer submit new tickets.',
    }, { status: 403 })
  }

  const body = await request.json()
  const { title, description, priority, photo_urls } = body

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({ client_id: user.id, title, description, priority, photo_urls })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const adminClient = createAdminClient()

  // Fetch admins and store profile in parallel
  const [{ data: adminProfiles }, { data: storeProfile }] = await Promise.all([
    adminClient.from('profiles').select('id').eq('role', 'supplier'),
    adminClient.from('profiles').select('regional_manager_id, company_name, sub_store').eq('id', user.id).single(),
  ])

  // Fire all notifications in parallel
  await Promise.all([
    adminProfiles?.length
      ? adminClient.from('notifications').insert(
          adminProfiles.map(admin => ({
            user_id: admin.id,
            type: 'new_ticket',
            title: 'New Maintenance Ticket',
            message: `A new ${priority} priority ticket has been submitted: "${title}"`,
            link: `/supplier/tickets/${ticket.id}`,
          }))
        )
      : Promise.resolve(),
    storeProfile?.regional_manager_id
      ? adminClient.from('notifications').insert({
          user_id: storeProfile.regional_manager_id,
          type: 'new_ticket',
          title: 'New Ticket from Your Region',
          message: `${storeProfile.company_name ?? 'A store'} (${storeProfile.sub_store ?? ''}) submitted a new ${priority} priority ticket: "${title}"`,
          link: `/regional/tickets/${ticket.id}`,
        })
      : Promise.resolve(),
  ])

  // Fire push notifications — non-blocking
  if (adminProfiles?.length) {
    void sendPushToMany(
      adminProfiles.map((a: any) => a.id),
      { title: 'New Maintenance Ticket', body: `A new ${priority} ticket: "${title}"`, url: `/supplier/tickets/${ticket.id}` }
    )
  }
  if (storeProfile?.regional_manager_id) {
    void sendPushToUser(storeProfile.regional_manager_id, {
      title: 'New Ticket from Your Region',
      body: `${storeProfile.company_name ?? 'A store'} submitted a new ${priority} ticket: "${title}"`,
      url: `/regional/tickets/${ticket.id}`,
    })
  }

  revalidatePath('/client')
  revalidatePath('/supplier')
  return NextResponse.json({ ticket }, { status: 201 })
}
