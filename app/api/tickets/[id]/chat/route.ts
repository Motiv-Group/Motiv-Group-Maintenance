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

// Per-ticket RM ↔ awarded-supplier chat. Deny-all RLS on ticket_chat_messages /
// ticket_chat_reads → all access via the service-role client; the checks below are
// the real guard. Two sides: the awarded supplier's users, and the region's RM(s).
// The chat only exists once a supplier is awarded (tickets.supplier_id set) — before
// then there is no single counterpart. Mirrors app/api/tickets/[id]/dispute.

type Admin = ReturnType<typeof createAdminClient>
// The ticket columns both handlers select and the helpers below read.
type ChatTicket = Pick<Database['public']['Tables']['tickets']['Row'], 'id' | 'company_id' | 'region_id' | 'store_id' | 'supplier_id' | 'title'>

const BodySchema = z.object({
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
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 10) : []
}
async function notify(admin: Admin, ids: string[], companyId: string | null, ticketId: string, title: string, message: string, link: string) {
  const others = [...new Set(ids)]
  if (!others.length) return
  await admin.from('notifications').insert(others.map(id => ({ company_id: companyId, user_id: id, ticket_id: ticketId, type: 'ticket_update', title, message, link })))
  void sendPushToMany(others, { title, body: message, url: link })
}

// Resolve the caller's side of the chat. Suppliers must be a user of the awarded
// supplier; RM/executive/system_admin act as the manager side.
async function resolveViewer(admin: Admin, userId: string, role: string | undefined, companyId: string | null | undefined, ticket: ChatTicket): Promise<'supplier' | 'regional_manager' | null> {
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
  return null
}

// GET /api/tickets/:id/chat → the ticket's chat messages (signed attachments) +
// the viewer's side. Opening the thread marks it read for the caller.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, supplier_id, title').eq('id', id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const viewerRole = await resolveViewer(admin, user.id, prof?.role, prof?.company_id, ticket)
  if (!viewerRole) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  // No awarded supplier yet → no counterpart, so no thread.
  if (!ticket.supplier_id) return NextResponse.json({ messages: [], viewerRole, available: false })

  const { data: msgs } = await admin.from('ticket_chat_messages')
    .select('id, author_id, author_role, body, attachment_urls, created_at')
    .eq('ticket_id', id).order('created_at', { ascending: true })
  const messages = await Promise.all((msgs ?? []).map(async m => ({
    id: m.id, author_role: m.author_role, body: m.body, created_at: m.created_at,
    mine: m.author_id === user.id,
    // attachment_urls is a JSON column that stores an array of storage URL strings.
    attachment_urls: Array.isArray(m.attachment_urls) ? await signManyUrls(m.attachment_urls as string[]) : [],
  })))

  // Mark read for this viewer (upsert the read cursor).
  await admin.from('ticket_chat_reads').upsert({ ticket_id: id, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'ticket_id,user_id' })

  return NextResponse.json({ messages, viewerRole, available: true })
}

// POST /api/tickets/:id/chat  { body, attachmentUrls } → post a message + notify the
// other side.
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
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, supplier_id, title').eq('id', ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const viewerRole = await resolveViewer(admin, user.id, prof?.role, prof?.company_id, ticket)
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

  const title = `${ticket.title ?? 'Untitled'}`
  if (viewerRole === 'supplier') {
    await notify(admin, await regionRmIds(admin, ticket), ticket.company_id, ticketId, title, 'New message from the supplier.', `/regional/tickets/${ticketId}`)
  } else {
    await notify(admin, await supplierUserIds(admin, ticket.supplier_id), ticket.company_id, ticketId, title, 'New message from the regional manager.', `/supplier/tickets/${ticketId}`)
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath(`/regional/tickets/${ticketId}`)
  return NextResponse.json({ ok: true })
}
