import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'

type Admin = ReturnType<typeof createAdminClient>

async function push(admin: Admin, ids: string[], companyId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, type: 'ticket_update', title, message, link })))
  void sendPushToMany(ids, { title, body: message, url: link })
}
async function regionIds(admin: Admin, regionId: string | null): Promise<string[]> {
  if (!regionId) return []
  const { data } = await admin.from('regional_users').select('user_id').eq('region_id', regionId)
  return (data ?? []).map(r => r.user_id)
}
async function supplierIds(admin: Admin, supplierId: string | null): Promise<string[]> {
  if (!supplierId) return []
  const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', supplierId)
  return (data ?? []).map(r => r.user_id)
}
// Notify the "resolver / client" side of a dispute: the region's RM(s), or — on a
// standalone Individual (company-null) ticket — the owner, who plays the resolver.
async function notifyResolver(admin: Admin, ticket: any, title: string, message: string) {
  if (ticket.region_id) {
    await push(admin, await regionIds(admin, ticket.region_id), ticket.company_id, title, message, `/regional/tickets/${ticket.id}`)
  } else if (ticket.created_by) {
    await push(admin, [ticket.created_by], ticket.company_id, title, message, `/individual/tickets/${ticket.id}`)
  }
}
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 10) : []
}
const originWord = (o: string) => o === 'snag' ? 'snag' : o === 'variation' ? 'variation order' : 'evidence request'
const roleName = (r: string) => r === 'supplier' ? 'Supplier' : 'Regional Manager'

// Resolve a dispute. outcome 'withdrawn' = the RM's request is DROPPED/retracted;
// 'upheld' = it STANDS. Applies the origin-specific effect (snag/evidence → accept the
// latest submission and move to close-out; variation → reopen the declined VO for
// review), clears any pending proposal, records a closing message and notifies the
// other side. `actorRole` is who triggered the resolution.
async function resolveDispute(admin: Admin, ticket: any, dispute: any, outcome: 'withdrawn' | 'upheld', note: string | null, actorId: string, actorRole: 'supplier' | 'regional_manager', now: string) {
  const ticketId = ticket.id as string
  const what = originWord(dispute.origin)
  const isVariation = dispute.origin === 'variation'
  const title = `Ticket: ${ticket.title ?? 'Untitled'}`
  await admin.from('ticket_disputes').update({ status: 'resolved', outcome, resolved_by: actorId, resolved_at: now, resolution_note: note, pending_outcome: null, pending_by: null, pending_at: null }).eq('id', dispute.id)
  const label = outcome === 'withdrawn'
    ? (isVariation ? 'Variation-order decline retracted — reopened for review' : `${what[0].toUpperCase()}${what.slice(1)} dropped — the submission is back under review for approval`)
    : (isVariation ? 'Variation-order decline upheld — stays declined' : `${what[0].toUpperCase()}${what.slice(1)} upheld — stands`)
  await admin.from('ticket_dispute_messages').insert({ dispute_id: dispute.id, ticket_id: ticketId, author_id: actorId, author_role: actorRole, body: `Dispute resolved — ${label}${note ? `: ${note}` : '.'}`, evidence_urls: [], created_at: now })
  if (outcome === 'withdrawn') {
    if (isVariation) {
      // Reopen the latest declined variation for the RM to re-decide.
      const { data: v } = await admin.from('ticket_variations').select('id').eq('ticket_id', ticketId).eq('status', 'rejected').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if ((v as any)?.id) await admin.from('ticket_variations').update({ status: 'pending', reject_reason: null, reviewed_at: null, reviewed_by: null }).eq('id', (v as any).id)
      await admin.from('tickets').update({ status: 'variation_review', updated_at: now, last_internal_update_at: now }).eq('id', ticketId)
    } else {
      // Drop the snag / evidence request → put the submission back UNDER REVIEW so the
      // RM approves it manually (do NOT auto-accept the COC/POC).
      const { data: latest } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if ((latest as any)?.id) await admin.from('signoffs').update({ status: 'submitted', reject_reason: null, reviewed_by: null, reviewed_at: null }).eq('id', (latest as any).id)
      await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['open', 'assigned', 'in_progress'])
      await admin.from('tickets').update({ status: 'submitted_for_signoff', signoff_status: 'submitted', evidence_request_reason: null, updated_at: now, last_internal_update_at: now }).eq('id', ticketId)
    }
  } else {
    // Upheld — the request stands; the ticket keeps its state so the supplier resumes.
    await admin.from('tickets').update({ updated_at: now, ...(actorRole === 'supplier' ? { last_supplier_update_at: now } : { last_internal_update_at: now }) }).eq('id', ticketId)
  }
  // Notify the party who didn't trigger this.
  const summary = outcome === 'withdrawn'
    ? (isVariation ? 'the variation order reopens for review' : `the ${what} was dropped — the submission is back under review for the manager's approval`)
    : (isVariation ? 'the variation-order decline stands' : `the ${what} stands`)
  if (actorRole === 'regional_manager') await push(admin, await supplierIds(admin, ticket.supplier_id), ticket.company_id, title, `Dispute resolved — ${summary}.`, `/supplier/tickets/${ticketId}`)
  else await notifyResolver(admin, ticket, title, `Dispute resolved — ${summary}.`)
}

// POST /api/tickets/:id/dispute  { action: 'raise' | 'reply' | 'resolve', ... }
// Supplier↔RM dispute thread over a snag or a "more evidence" request. A dispute
// pauses the snag/evidence step (enforced in the transition route) until the RM
// resolves it as 'upheld' (requirement stands) or 'withdrawn' (dropped → close-out).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`dispute:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ticketId = params.id
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = prof?.role
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const isIndividual = role === 'individual'
  // Everyone but an Individual must belong to a company.
  if (!isIndividual && !prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // The dispute has two sides: the supplier, and the "resolver / client". The
  // resolver is the RM/executive — or, on a standalone Individual ticket, the
  // owner themselves (they play the resolver role).
  const actingRole: 'supplier' | 'regional_manager' | null =
    role === 'supplier' ? 'supplier'
    : (role === 'regional_manager' || role === 'executive' || isIndividual) ? 'regional_manager'
    : null
  if (!actingRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  // Company isolation only for a REAL RM/executive; suppliers work across companies,
  // and an Individual owns their (company-null) ticket via created_by (checked below).
  if (actingRole === 'regional_manager' && !isIndividual && ticket.company_id !== prof.company_id) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Access: the awarded supplier's users, the Individual owner, or an RM of the region.
  if (actingRole === 'supplier') {
    const mine = await supplierIds(admin, ticket.supplier_id)
    if (!mine.includes(user.id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else if (isIndividual) {
    if (ticket.created_by !== user.id) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else {
    const rms = await regionIds(admin, ticket.region_id)
    if (!rms.includes(user.id)) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const { data: openDispute } = await admin.from('ticket_disputes').select('*').eq('ticket_id', ticketId).eq('status', 'open').maybeSingle()
  const title = `Ticket: ${ticket.title ?? 'Untitled'}`

  if (action === 'raise') {
    if (actingRole !== 'supplier') return NextResponse.json({ error: 'Only the supplier can raise a dispute.' }, { status: 403 })
    if (!['snag', 'evidence_requested', 'vo_declined'].includes(ticket.status)) return NextResponse.json({ error: 'A dispute can only be raised on a snag, an evidence request, or a declined variation order.' }, { status: 400 })
    if (openDispute) return NextResponse.json({ error: 'A dispute is already open on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    const origin = ticket.status === 'snag' ? 'snag' : ticket.status === 'vo_declined' ? 'variation' : 'evidence_requested'
    const { data: disp, error } = await admin.from('ticket_disputes')
      .insert({ company_id: ticket.company_id, ticket_id: ticketId, origin, status: 'open', raised_by: user.id, created_at: now })
      .select('id').single()
    if (error || !disp) return NextResponse.json({ error: 'Could not raise the dispute.' }, { status: 500 })
    // Link a snag/evidence dispute to the submission it concerns (the latest signoff).
    // Best-effort, separate update so raising works before the signoff_id column exists.
    if (origin !== 'variation') {
      const { data: latestSignoff } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if ((latestSignoff as any)?.id) await admin.from('ticket_disputes').update({ signoff_id: (latestSignoff as any).id }).eq('id', disp.id)
    }
    await admin.from('ticket_dispute_messages').insert({ dispute_id: disp.id, ticket_id: ticketId, author_id: user.id, author_role: 'supplier', body: messageBody || null, evidence_urls: evidence, created_at: now })
    await admin.from('tickets').update({ last_supplier_update_at: now, updated_at: now }).eq('id', ticketId)
    await notifyResolver(admin, ticket, title, 'The supplier has raised a dispute — review and respond.')
  } else if (action === 'reply') {
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: messageBody || null, evidence_urls: evidence, created_at: now })
    if (actingRole === 'supplier') {
      await admin.from('tickets').update({ last_supplier_update_at: now }).eq('id', ticketId)
      await notifyResolver(admin, ticket, title, 'New reply on the dispute.')
    } else {
      await push(admin, await supplierIds(admin, ticket.supplier_id), ticket.company_id, title, 'The manager replied on your dispute.', `/supplier/tickets/${ticketId}`)
    }
  } else if (action === 'withdraw') {
    // Supplier concedes → the request STANDS (outcome 'upheld').
    if (actingRole !== 'supplier') return NextResponse.json({ error: 'Only the supplier can withdraw the dispute.' }, { status: 403 })
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    await resolveDispute(admin, ticket, openDispute, 'upheld', String(body.note ?? '').trim() || null, user.id, 'supplier', now)
  } else if (action === 'retract') {
    // RM concedes → the request is DROPPED (outcome 'withdrawn').
    if (actingRole !== 'regional_manager') return NextResponse.json({ error: 'Only the manager can retract the request.' }, { status: 403 })
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    await resolveDispute(admin, ticket, openDispute, 'withdrawn', String(body.note ?? '').trim() || null, user.id, 'regional_manager', now)
  } else if (action === 'propose') {
    // Supplier proposes to RESOLVE (drop → 'withdrawn'); RM proposes to UPHOLD (keep →
    // 'upheld'). The other party must confirm. A new proposal replaces any pending one.
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    const proposed = actingRole === 'supplier' ? 'withdrawn' : 'upheld'
    const note = String(body.note ?? '').trim() || null
    const what = originWord(openDispute.origin)
    const { error: pErr } = await admin.from('ticket_disputes').update({ pending_outcome: proposed, pending_by: actingRole, pending_at: now }).eq('id', openDispute.id)
    if (pErr) return NextResponse.json({ error: 'Proposals are not available yet — the latest database migration needs to be applied.' }, { status: 503 })
    const label = proposed === 'withdrawn' ? `proposed to resolve the dispute — drop the ${what}` : `proposed to uphold the ${what} — it stands`
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: `${roleName(actingRole)} ${label}. Awaiting the other party's agreement.${note ? ` — ${note}` : ''}`, evidence_urls: [], created_at: now })
    await admin.from('tickets').update({ updated_at: now, ...(actingRole === 'supplier' ? { last_supplier_update_at: now } : { last_internal_update_at: now }) }).eq('id', ticketId)
    if (actingRole === 'supplier') await notifyResolver(admin, ticket, title, 'The supplier proposed to resolve the dispute — confirm to drop the request.')
    else await push(admin, await supplierIds(admin, ticket.supplier_id), ticket.company_id, title, 'The manager proposed to uphold the request — confirm to agree.', `/supplier/tickets/${ticketId}`)
  } else if (action === 'confirm') {
    // The OTHER party agrees to the pending proposal → resolve with its outcome.
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    if (!openDispute.pending_outcome || !openDispute.pending_by) return NextResponse.json({ error: 'There is no proposal to confirm.' }, { status: 400 })
    if (openDispute.pending_by === actingRole) return NextResponse.json({ error: 'The other party needs to confirm your proposal.' }, { status: 403 })
    await resolveDispute(admin, ticket, openDispute, openDispute.pending_outcome === 'withdrawn' ? 'withdrawn' : 'upheld', null, user.id, actingRole, now)
  } else if (action === 'cancel') {
    // The proposer withdraws their pending proposal.
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    if (openDispute.pending_by !== actingRole) return NextResponse.json({ error: 'Only the party who proposed can cancel it.' }, { status: 403 })
    await admin.from('ticket_disputes').update({ pending_outcome: null, pending_by: null, pending_at: null }).eq('id', openDispute.id)
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: `${roleName(actingRole)} cancelled their proposal.`, evidence_urls: [], created_at: now })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  revalidatePath(`/supplier/tickets/${ticketId}`); revalidatePath(`/regional/tickets/${ticketId}`)
  revalidatePath('/supplier'); revalidatePath('/regional')
  return NextResponse.json({ ok: true })
}
