import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// PATCH /api/tickets/[id] — admin updates status OR store manager edits their own open ticket
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase    = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const body = await request.json()

  // Admin updating status only
  if (profile?.role === 'supplier') {
    const { status } = body
    if (!['in_progress', 'completed', 'pending_sign_off', 'snag', 'snag_in_progress', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const { data, error } = await adminClient
      .from('tickets').update({ status }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidatePath('/supplier/tickets')
    revalidatePath(`/supplier/tickets/${params.id}`)
    revalidatePath('/supplier')
    return NextResponse.json({ ticket: data })
  }

  // Store manager editing their own open ticket
  const { data: ticket } = await adminClient
    .from('tickets').select('client_id, status').eq('id', params.id).single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ticket.client_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open') return NextResponse.json({ error: 'Can only edit open tickets' }, { status: 400 })

  const { title, description, priority } = body
  const { data, error } = await adminClient
    .from('tickets').update({ title, description, priority }).eq('id', params.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ticket: data })
}

// DELETE /api/tickets/[id] — store manager deletes a ticket (only if status = open)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const adminClient = createAdminClient()

  const { data: ticket } = await adminClient
    .from('tickets')
    .select('client_id, status')
    .eq('id', params.id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ticket.client_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (ticket.status !== 'open') return NextResponse.json({ error: 'Can only delete open tickets' }, { status: 400 })

  const { error } = await adminClient
    .from('tickets')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
