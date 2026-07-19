import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'
import { signManyUrls } from '@/lib/storage'
import type { Database } from '@/lib/database.types'

// Per-ticket chat. Deny-all RLS on ticket_chat_messages / ticket_chat_reads /
// ticket_chat_settings → all access via the service-role client; the checks below
// are the real guard. Participants:
//   • the awarded supplier's users        (author_role 'supplier')
//   • the region's RM(s) / exec / admin   (author_role 'regional_manager')
//   • the ticket's Store Manager(s) — ONLY once the RM adds them (ticket_chat_settings.
//     sm_added_at). sm_history_from is the visibility cutoff the RM chose at add-time
//     (NULL = full history).                (author_role 'store_manager')
//   • the individual owner of a standalone ticket (tickets.created_by; no RM exists
//     there — they hold the manager seat)   (author_role 'individual')
// The chat only exists once a supplier is awarded (tickets.supplier_id set) — before
// then there is no counterpart. Mirrors app/api/tickets/[id]/dispute.

type Admin = ReturnType<typeof createAdminClient>
// The ticket columns both handlers select and the helpers below read.
type ChatTicket = Pick<Database['public']['Tables']['tickets']['Row'], 'id' | 'company_id' | 'region_id' | 'store_id' | 'supplier_id' | 'title' | 'created_by'>
type ChatSettings = { sm_added_at: string | null; sm_history_from: string | null }
type ViewerRole = 'supplier' | 'regional_manager' | 'store_manager' | 'individual'

const BodySchema = z.object({
  action: z.enum(['send', 'add_sm', 'remove_sm']).optional(), // default 'send'
  history: z.enum(['full', 'from_now']).optional(),           // add_sm only
  body: z.any().optional(),
  attachmentUrls: z.array(z.any()).optional(),
})

// Awarded-supplier's user ids (supplier_users → user_profiles.id).
async function supplierUserIds(admin: Admin, supplierId: string | null | undefined): Promise<string[]> {
  if (!supplierId) return []
  const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', supplierId)
  return (data ?? []).map(r => r.user_id)
}
// The region's RM users. Falls back to the ticket's store region when tickets.region_id
// is NULL/stale (same reason rmOwnsTicket does).
async function regionRmIds(admin: Admin, ticket: ChatTicket): Promise<string[]> {
  let regionId: string | null = ticket.region_id ?? null
  if (!regionId && ticket.store_id) {
    const { data: store } = await admin.from('stores').select('region_id').eq('id', ticket.store_id).maybeSingle()
    regionId = store?.region_id ?? null
  }
  if (!regionId) return []
  const { data } = await admin.from('regional_users').select('user_id').eq('region_id', regionId)
  return (data ?? []).map(r => r.user_id)
}
// The ticket's store SM user ids (store_users → user_profiles.id).
async function storeSmIds(admin: Admin, storeId: string | null | undefined): Promise<string[]> {
  if (!storeId) return []
  const { data } = await admin.from('store_users').select('user_id').eq('store_id', storeId)
  return (data ?? []).map(r => r.user_id)
}
async function chatSettings(admin: Admin, ticketId: string): Promise<ChatSettings> {
  const { data } = await admin.from('ticket_chat_settings').select('sm_added_at, sm_history_from').eq('ticket_id', ticketId).maybeSingle()
  return { sm_added_at: data?.sm_added_at ?? null, sm_history_from: data?.sm_history_from ?? null }
}
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 10) : []
}
async function notify(admin: Admin, ids: string[], companyId: string | null, ticketId: string, title: string, message: string, link: string) {
  const others = [...new Set(ids)]
  if (!others.length) return
  await admin.from('notifications').insert(others.map(id => ({ company_id: companyId, user_id: id, ticket_id: ticketId, type: 'ticket_update', title, message, link })))
  void sendPushToMany(others, { title, body: message, url: link })
}

// Resolve the caller's seat in the chat. Suppliers must be a user of the awarded
// supplier; RM/executive/system_admin act as the manager side; the ticket's SMs
// join only once added; individual owners hold the manager seat on standalone tickets.
async function resolveViewer(admin: Admin, userId: string, role: string | undefined, companyId: string | null | undefined, ticket: ChatTicket, settings: ChatSettings): Promise<ViewerRole | null> {
  if (role === 'supplier') {
    const mine = await supplierUserIds(admin, ticket.supplier_id)
    return mine.includes(userId) ? 'supplier' : null
  }
  if (role === 'regional_manager') {
    return (ticket.company_id === companyId && await rmOwnsTicket(admin, userId, ticket)) ? 'regional_manager' : null
  }
  if (role === 'executive') {
    return ticket.company_id && ticket.company_id === companyId ? 'regional_manager' : null
  }
  if (role === 'system_admin') return 'regional_manager'
  if (role === 'store_manager' || role === 'client') {
    if (!settings.sm_added_at) return null
    const smIds = await storeSmIds(admin, ticket.store_id)
    return smIds.includes(userId) ? 'store_manager' : null
  }
  if (role === 'individual') {
    return ticket.created_by === userId ? 'individual' : null
  }
  return null
}

// GET /api/tickets/:id/chat → the ticket's chat messages (signed attachments) +
// the viewer's seat + SM participation state. Opening the thread marks it read.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, supplier_id, title, created_by').eq('id', id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await chatSettings(admin, id)
  const viewerRole = await resolveViewer(admin, user.id, prof?.role, prof?.company_id, ticket, settings)
  if (!viewerRole) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  // No awarded supplier yet → no counterpart, so no thread.
  if (!ticket.supplier_id) return NextResponse.json({ messages: [], viewerRole, available: false, smAdded: false, canManageSm: false })

  let query = admin.from('ticket_chat_messages')
    .select('id, author_id, author_role, body, attachment_urls, created_at')
    .eq('ticket_id', id).order('created_at', { ascending: true })
  // The RM chose "from now on" when adding the SM — hide the earlier thread from them.
  if (viewerRole === 'store_manager' && settings.sm_history_from) {
    query = query.gte('created_at', settings.sm_history_from)
  }
  const { data: msgs } = await query
  const messages = await Promise.all((msgs ?? []).map(async m => ({
    id: m.id, author_role: m.author_role, body: m.body, created_at: m.created_at,
    mine: m.author_id === user.id,
    // attachment_urls is a JSON column that stores an array of storage URL strings.
    attachment_urls: Array.isArray(m.attachment_urls) ? await signManyUrls(m.attachment_urls as string[]) : [],
  })))

  // Mark read for this viewer (upsert the read cursor).
  await admin.from('ticket_chat_reads').upsert({ ticket_id: id, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'ticket_id,user_id' })

  // Only a real RM (or the platform admin) manages participants — and only on
  // tickets that HAVE a store SM side (standalone individual tickets don't).
  const canManageSm = (prof?.role === 'regional_manager' || prof?.role === 'system_admin') && !!ticket.store_id
  return NextResponse.json({ messages, viewerRole, available: true, smAdded: !!settings.sm_added_at, canManageSm })
}

// POST /api/tickets/:id/chat
//   { body, attachmentUrls }            → post a message + notify every other participant
//   { action: 'add_sm', history }       → RM adds the ticket's SM(s) ('full' | 'from_now')
//   { action: 'remove_sm' }             → RM removes them again
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`chat:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, supplier_id, title, created_by').eq('id', ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const settings = await chatSettings(admin, ticketId)
  const viewerRole = await resolveViewer(admin, user.id, prof?.role, prof?.company_id, ticket, settings)
  const action = parsed.data.action ?? 'send'

  // ── Participant management (RM / platform admin only) ────────────────────
  if (action === 'add_sm' || action === 'remove_sm') {
    const isManager = prof?.role === 'regional_manager' || prof?.role === 'system_admin'
    if (!isManager || (prof?.role === 'regional_manager' && !(ticket.company_id === prof.company_id && await rmOwnsTicket(admin, user.id, ticket)))) {
      return NextResponse.json({ error: 'Only the regional manager can manage chat participants.' }, { status: 403 })
    }
    if (!ticket.store_id) return NextResponse.json({ error: 'This ticket has no store manager side.' }, { status: 400 })

    if (action === 'add_sm') {
      const now = new Date().toISOString()
      const { error } = await admin.from('ticket_chat_settings').upsert({
        ticket_id: ticketId,
        sm_added_at: now,
        sm_history_from: parsed.data.history === 'from_now' ? now : null,
        sm_added_by: user.id,
        updated_at: now,
      }, { onConflict: 'ticket_id' })
      if (error) return NextResponse.json({ error: 'Could not add the store manager.' }, { status: 500 })
      await notify(admin, await storeSmIds(admin, ticket.store_id), ticket.company_id, ticketId,
        ticket.title ?? 'Ticket', 'You have been added to this ticket’s conversation.', `/client/tickets/${ticketId}`)
    } else {
      const { error } = await admin.from('ticket_chat_settings').upsert({
        ticket_id: ticketId, sm_added_at: null, sm_history_from: null, sm_added_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'ticket_id' })
      if (error) return NextResponse.json({ error: 'Could not remove the store manager.' }, { status: 500 })
    }
    revalidatePath(`/client/tickets/${ticketId}`)
    return NextResponse.json({ ok: true, smAdded: action === 'add_sm' })
  }

  // ── Send a message ────────────────────────────────────────────────────────
  if (!viewerRole) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  if (!ticket.supplier_id) return NextResponse.json({ error: 'No supplier is assigned to this ticket yet.' }, { status: 400 })

  const messageBody = String(parsed.data.body ?? '').trim().slice(0, 2000)
  const attachments = cleanUrls(parsed.data.attachmentUrls)
  if (!messageBody && !attachments.length) return NextResponse.json({ error: 'Add a message or attach a file.' }, { status: 400 })

  const now = new Date().toISOString()
  const { error } = await admin.from('ticket_chat_messages').insert({
    ticket_id: ticketId, company_id: ticket.company_id, author_id: user.id, author_role: viewerRole,
    body: messageBody || null, attachment_urls: attachments, created_at: now,
  })
  if (error) return NextResponse.json({ error: 'Could not send the message.' }, { status: 500 })
  // The sender has by definition read up to their own message.
  await admin.from('ticket_chat_reads').upsert({ ticket_id: ticketId, user_id: user.id, last_read_at: now }, { onConflict: 'ticket_id,user_id' })

  // Fan out to every OTHER participant group with a role-appropriate link.
  const title = `${ticket.title ?? 'Untitled'}`
  const fromLabel = viewerRole === 'supplier' ? 'the supplier'
    : viewerRole === 'store_manager' ? 'the store manager'
    : viewerRole === 'individual' ? 'the client'
    : 'the regional manager'
  const message = `New message from ${fromLabel}.`
  const exclude = new Set([user.id])
  const groups: { ids: string[]; link: string }[] = [
    { ids: await supplierUserIds(admin, ticket.supplier_id), link: `/supplier/tickets/${ticketId}` },
    { ids: await regionRmIds(admin, ticket), link: `/regional/tickets/${ticketId}` },
    ...(settings.sm_added_at ? [{ ids: await storeSmIds(admin, ticket.store_id), link: `/client/tickets/${ticketId}` }] : []),
    // Standalone tickets: the individual owner is the manager side.
    ...(!ticket.store_id && ticket.created_by ? [{ ids: [ticket.created_by], link: `/individual/tickets/${ticketId}` }] : []),
  ]
  const seen = new Set<string>()
  for (const g of groups) {
    const ids = g.ids.filter(uid => !exclude.has(uid) && !seen.has(uid))
    ids.forEach(uid => seen.add(uid))
    await notify(admin, ids, ticket.company_id, ticketId, title, message, g.link)
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath(`/regional/tickets/${ticketId}`); revalidatePath(`/client/tickets/${ticketId}`)
  return NextResponse.json({ ok: true })
}
