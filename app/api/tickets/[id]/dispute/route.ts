import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { sendPushToMany } from '@/lib/push'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { rmOwnsTicket } from '@/lib/rm-ticket-access'
import { signManyUrls } from '@/lib/storage'
import { stampFreshness } from '@/lib/workflow'
import type { Database } from '@/lib/database.types'

const BodySchema = z.object({
  action: z.string().optional(),
  body: z.any().optional(),
  evidenceUrls: z.array(z.any()).optional(),
  note: z.any().optional(),
})

type Admin = ReturnType<typeof createAdminClient>
type TicketRow = Database['public']['Tables']['tickets']['Row']
type DisputeRow = Database['public']['Tables']['ticket_disputes']['Row']

async function push(admin: Admin, ids: string[], companyId: string | null, ticketId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, ticket_id: ticketId, type: 'ticket_update', title, message, link })))
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
// B19 note: dispute notifications stay inline (NOT notifyNextActors) — the service
// is keyed by transition actions with fixed copy, while every dispute message is
// bespoke, and the resolver side may be the Individual owner (notifyResolver's
// company-null branch). Preserved verbatim pending dedupe.
// Notify the "resolver / client" side of a dispute: the region's RM(s), or — on a
// standalone Individual (company-null) ticket — the owner, who plays the resolver.
async function notifyResolver(admin: Admin, ticket: TicketRow, title: string, message: string) {
  if (ticket.region_id) {
    await push(admin, await regionIds(admin, ticket.region_id), ticket.company_id, ticket.id, title, message, `/regional/tickets/${ticket.id}`)
  } else if (ticket.created_by) {
    await push(admin, [ticket.created_by], ticket.company_id, ticket.id, title, message, `/individual/tickets/${ticket.id}`)
  }
}
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 10) : []
}
const originWord = (o: string) => o === 'snag' ? 'snag' : o === 'variation' ? 'variation order' : o === 'quote_declined' ? 'quote decline' : 'evidence request'
const roleName = (r: string) => r === 'supplier' ? 'Supplier' : 'Regional Manager'

// The caller's supplier orgs (a user can belong to more than one). Rows are
// re-checked in JS as well as filtered at the DB — authZ decisions here never
// trust the filter alone (mirrors the other membership checks in this route).
async function callerSupplierOrgs(admin: Admin, userId: string): Promise<string[]> {
  const { data } = await admin.from('supplier_users').select('user_id, supplier_id').eq('user_id', userId)
  return (data ?? []).filter(r => r.user_id === userId).map(r => r.supplier_id).filter((s): s is string => !!s)
}
// The org (if any) whose quote/invite the RM declined on this ticket, restricted
// to the caller's orgs — the seat for a 'quote_declined' dispute. The decline
// nulls tickets.supplier_id, so this is resolved from ticket_suppliers / quotes.
async function declinedOrgFor(admin: Admin, ticketId: string, orgIds: string[]): Promise<string | null> {
  if (!orgIds.length) return null
  // Fresh RM decline that was NOT asked to re-quote: the invite still reads 'declined'.
  const { data } = await admin.from('ticket_suppliers')
    .select('supplier_id, status, declined_by').eq('ticket_id', ticketId).in('supplier_id', orgIds)
  const invite = (data ?? []).find(r => r.supplier_id && orgIds.includes(r.supplier_id) && r.status === 'declined' && r.declined_by === 'regional_manager')
  if (invite?.supplier_id) return invite.supplier_id
  // Re-quote path: the RM decline resets ticket_suppliers.status back to 'invited',
  // so the declined-invite evidence is gone — but the RM-declined QUOTE row survives.
  // Fall back to it, still scoped to the caller's OWN orgs (cross-supplier isolation holds).
  const { data: q } = await admin.from('quotes')
    .select('supplier_id, status').eq('ticket_id', ticketId).eq('status', 'declined').in('supplier_id', orgIds)
  const quote = (q ?? []).find(r => r.supplier_id && orgIds.includes(r.supplier_id))
  return quote?.supplier_id ?? null
}

// Resolve a dispute. outcome 'withdrawn' = the RM's request is DROPPED/retracted;
// 'upheld' = it STANDS. Applies the origin-specific effect (snag/evidence → accept the
// latest submission and move to close-out; variation → reopen the declined VO for
// review), clears any pending proposal, records a closing message and notifies the
// other side. `actorRole` is who triggered the resolution.
async function resolveDispute(admin: Admin, ticket: TicketRow, dispute: DisputeRow, outcome: 'withdrawn' | 'upheld', note: string | null, actorId: string, actorRole: 'supplier' | 'regional_manager', now: string) {
  const ticketId = ticket.id
  const what = originWord(dispute.origin)
  const isVariation = dispute.origin === 'variation'
  const isQuoteDecline = dispute.origin === 'quote_declined'
  const title = `${ticket.title ?? 'Untitled'}`
  await admin.from('ticket_disputes').update({ status: 'resolved', outcome, resolved_by: actorId, resolved_at: now, resolution_note: note, pending_outcome: null, pending_by: null, pending_at: null }).eq('id', dispute.id)
  const label = outcome === 'withdrawn'
    ? (isVariation ? 'Variation-order decline retracted — reopened for review'
      : isQuoteDecline ? 'Quote decline retracted — the manager will revisit the quote'
      : `${what[0].toUpperCase()}${what.slice(1)} dropped — the submission is back under review for approval`)
    : (isVariation ? 'Variation-order decline upheld — stays declined'
      : isQuoteDecline ? 'Quote decline upheld — the decision stands'
      : `${what[0].toUpperCase()}${what.slice(1)} upheld — stands`)
  await admin.from('ticket_dispute_messages').insert({ dispute_id: dispute.id, ticket_id: ticketId, author_id: actorId, author_role: actorRole, body: `Dispute resolved — ${label}${note ? `: ${note}` : '.'}`, evidence_urls: [], created_at: now })
  // B19 note: blocker columns stay inline-absent (NOT resolveBlockerState) — these
  // status writes historically touch NO blocker/pause columns, while the shared
  // helper would stamp the internalDecision/signoff blocker sets (incl. an
  // internal_action_due_at from SLA targets this route doesn't load). Behaviour is
  // preserved verbatim pending dedupe. A 'withdrawn' outcome is always applied by
  // the resolver side, so the freshness stamp is the fixed internal one.
  if (isQuoteDecline) {
    // A quote-decline dispute is a thread + flag only — it never moves the ticket
    // (the job may already be awarded elsewhere; the RM re-quotes separately if
    // they change their mind). Just refresh the freshness stamp.
    await admin.from('tickets').update({ updated_at: now, ...stampFreshness(actorRole, now) }).eq('id', ticketId)
  } else if (outcome === 'withdrawn') {
    if (isVariation) {
      // Reopen the latest declined variation for the RM to re-decide.
      const { data: v } = await admin.from('ticket_variations').select('id').eq('ticket_id', ticketId).eq('status', 'rejected').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (v?.id) await admin.from('ticket_variations').update({ status: 'pending', reject_reason: null, reviewed_at: null, reviewed_by: null }).eq('id', v.id)
      await admin.from('tickets').update({ status: 'variation_review', updated_at: now, ...stampFreshness('regional_manager', now) }).eq('id', ticketId)
    } else {
      // Drop the snag / evidence request → put the submission back UNDER REVIEW so the
      // RM approves it manually (do NOT auto-accept the COC/POC).
      const { data: latest } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (latest?.id) await admin.from('signoffs').update({ status: 'submitted', reject_reason: null, reviewed_by: null, reviewed_at: null }).eq('id', latest.id)
      await admin.from('snags').update({ status: 'resolved' }).eq('ticket_id', ticketId).in('status', ['open', 'assigned', 'in_progress'])
      await admin.from('tickets').update({ status: 'submitted_for_signoff', signoff_status: 'submitted', evidence_request_reason: null, updated_at: now, ...stampFreshness('regional_manager', now) }).eq('id', ticketId)
    }
  } else {
    // Upheld — the request stands; the ticket keeps its state so the supplier resumes.
    await admin.from('tickets').update({ updated_at: now, ...stampFreshness(actorRole, now) }).eq('id', ticketId)
  }
  // Notify the party who didn't trigger this. The supplier side is the dispute's
  // own org when bound (quote-decline disputes belong to a NON-awarded org).
  const summary = outcome === 'withdrawn'
    ? (isVariation ? 'the variation order reopens for review'
      : isQuoteDecline ? 'the manager retracted the decline and will revisit your quote'
      : `the ${what} was dropped — the submission is back under review for the manager's approval`)
    : (isVariation ? 'the variation-order decline stands'
      : isQuoteDecline ? 'the quote decline stands'
      : `the ${what} stands`)
  const supplierOrg = dispute.supplier_id ?? ticket.supplier_id
  if (actorRole === 'regional_manager') await push(admin, await supplierIds(admin, supplierOrg), ticket.company_id, ticketId, title, `This dispute has been resolved — ${summary}.`, `/supplier/tickets/${ticketId}`)
  else await notifyResolver(admin, ticket, title, `This dispute has been resolved — ${summary}.`)
}

// POST /api/tickets/:id/dispute  { action: 'raise' | 'reply' | 'resolve', ... }
// Supplier↔RM dispute thread over a snag or a "more evidence" request. A dispute
// pauses the snag/evidence step (enforced in the transition route) until the RM
// resolves it as 'upheld' (requirement stands) or 'withdrawn' (dropped → close-out).
// GET — the ticket's OPEN dispute + its messages, for the Today-queue "View
// dispute" pop-up (RM + supplier). Access mirrors the POST gate.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = prof?.role
  const isIndividual = role === 'individual'
  const { data: ticket } = await admin.from('tickets').select('id, company_id, region_id, store_id, supplier_id, created_by, job_ref').eq('id', id).single()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let ok = false
  let viewerRole: 'supplier' | 'regional_manager' = 'regional_manager'
  let viewerOrgs: string[] = []
  if (role === 'supplier') {
    // The awarded org, or an org holding its own (quote-decline) dispute on this ticket.
    viewerOrgs = await callerSupplierOrgs(admin, user.id)
    const { data: orgDisputes } = await admin.from('ticket_disputes').select('supplier_id').eq('ticket_id', id)
    ok = (!!ticket.supplier_id && viewerOrgs.includes(ticket.supplier_id))
      || (orgDisputes ?? []).some(d => d.supplier_id && viewerOrgs.includes(d.supplier_id))
    viewerRole = 'supplier'
  } else if (isIndividual) {
    ok = ticket.created_by === user.id
  } else if (role === 'regional_manager') {
    ok = await rmOwnsTicket(admin, user.id, ticket)
  } else if (role === 'executive') {
    ok = ticket.company_id === prof?.company_id
  }
  if (!ok) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })

  const { data: disputes } = await admin.from('ticket_disputes')
    .select('id, origin, status, outcome, resolution_note, pending_outcome, pending_by, created_at, resolved_at, supplier_id')
    .eq('ticket_id', id).eq('status', 'open').order('created_at', { ascending: false })
  // Cross-supplier isolation: a supplier sees only THEIR org's dispute (legacy rows
  // with no supplier_id belong to the awarded org). Managers see the workflow
  // dispute first (it pauses steps), else the latest quote-decline thread.
  const open = (disputes ?? []).filter(d =>
    viewerRole !== 'supplier'
    || (d.supplier_id ? viewerOrgs.includes(d.supplier_id) : (!!ticket.supplier_id && viewerOrgs.includes(ticket.supplier_id))))
  const dispute = open.find(d => d.origin !== 'quote_declined') ?? open[0] ?? null
  if (!dispute) return NextResponse.json({ dispute: null, viewerRole })

  const { data: msgs } = await admin.from('ticket_dispute_messages')
    .select('id, author_role, body, evidence_urls, created_at').eq('dispute_id', dispute.id).order('created_at', { ascending: true })
  const messages = await Promise.all((msgs ?? []).map(async m => ({
    // evidence_urls is a JSON column that stores an array of storage URL strings.
    ...m, evidence_urls: Array.isArray(m.evidence_urls) ? await signManyUrls(m.evidence_urls as string[]) : [],
  })))

  // Header context for the conversation pop-up — the disputing org's name, the
  // job ref + store, and (variation disputes) the disputed VO's amount. Null-safe:
  // legacy disputes carry no supplier_id (→ the awarded org), standalone tickets
  // have no store, and old VOs have no amount_incl_vat. The org is the DISPUTE's
  // own org, so a supplier only ever sees their own name (cross-supplier isolation
  // holds — the dispute itself was already scoped above).
  const orgId = dispute.supplier_id ?? ticket.supplier_id
  const { data: org } = orgId ? await admin.from('suppliers').select('company_name').eq('id', orgId).maybeSingle() : { data: null }
  const { data: storeRow } = ticket.store_id ? await admin.from('stores').select('name').eq('id', ticket.store_id).maybeSingle() : { data: null }
  let voAmount: number | null = null
  let voAmountInclVat: number | null = null
  if (dispute.origin === 'variation') {
    // The disputed VO is the latest DECLINED one (mirrors the resolve/reopen logic).
    const { data: vo } = await admin.from('ticket_variations').select('amount, amount_incl_vat').eq('ticket_id', id).eq('status', 'rejected').order('created_at', { ascending: false }).limit(1).maybeSingle()
    voAmount = vo?.amount ?? null
    voAmountInclVat = vo?.amount_incl_vat ?? null
  }
  const context = { supplierName: org?.company_name ?? null, jobRef: ticket.job_ref ?? null, store: storeRow?.name ?? null, amount: voAmount, amountInclVat: voAmountInclVat }

  const what = originWord(dispute.origin)
  return NextResponse.json({ dispute, messages, viewerRole, subject: `${what[0].toUpperCase()}${what.slice(1)}`, context })
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`dispute:${user.id}`, 40, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ticketId = params.id
  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const action = String(body.action ?? '')

  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('role, company_id').eq('id', user.id).single()
  const role = prof?.role
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const isIndividual = role === 'individual'
  // Everyone but an Individual or a supplier (pool suppliers have no company_id;
  // gated by the awarded-supplier check below) must belong to a company.
  if (!isIndividual && role !== 'supplier' && !prof?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // The dispute has two sides: the supplier, and the "resolver / client". The
  // resolver is the RM/executive — or, on a standalone Individual ticket, the
  // owner themselves (they play the resolver role).
  // SEC-045: executive is read-only — it can VIEW a dispute (GET) but not raise/
  // resolve/post to one. The resolver side is the RM, or the Individual owner.
  const actingRole: 'supplier' | 'regional_manager' | null =
    role === 'supplier' ? 'supplier'
    : (role === 'regional_manager' || isIndividual) ? 'regional_manager'
    : null
  if (!actingRole) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  // Company isolation only for a REAL RM/executive; suppliers work across companies,
  // and an Individual owns their (company-null) ticket via created_by (checked below).
  if (actingRole === 'regional_manager' && !isIndividual && ticket.company_id !== prof.company_id) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Access: the awarded supplier's users, a declined org's users (quote-decline
  // disputes only — resolved below), the Individual owner, or an RM of the region.
  let actorOrgs: string[] = []
  let isAwardedSupplier = false
  let declinedOrg: string | null = null
  if (actingRole === 'supplier') {
    actorOrgs = await callerSupplierOrgs(admin, user.id)
    isAwardedSupplier = !!ticket.supplier_id && actorOrgs.includes(ticket.supplier_id)
    declinedOrg = await declinedOrgFor(admin, ticketId, actorOrgs)
    if (!isAwardedSupplier && !declinedOrg) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else if (isIndividual) {
    if (ticket.created_by !== user.id) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  } else {
    if (!(await rmOwnsTicket(admin, user.id, ticket))) return NextResponse.json({ error: 'Not your ticket' }, { status: 403 })
  }

  const now = new Date().toISOString()
  // A ticket can hold several open disputes now (the awarded org's workflow dispute
  // + declined orgs' quote-decline threads). Pick the one THIS actor acts on:
  // suppliers act on their own org's dispute (legacy null supplier_id = awarded
  // org's); managers act on the workflow dispute first, else the latest thread.
  const { data: openDisputes } = await admin.from('ticket_disputes').select('*').eq('ticket_id', ticketId).eq('status', 'open').order('created_at', { ascending: false })
  const visibleOpen = (openDisputes ?? []).filter(d =>
    actingRole !== 'supplier'
    || (d.supplier_id ? actorOrgs.includes(d.supplier_id) : isAwardedSupplier))
  const openDispute = visibleOpen.find(d => d.origin !== 'quote_declined') ?? visibleOpen[0] ?? null
  const title = `${ticket.title ?? 'Untitled'}`

  if (action === 'raise') {
    if (actingRole !== 'supplier') return NextResponse.json({ error: 'Only the supplier can raise a dispute.' }, { status: 403 })
    // Two raise paths: the awarded org disputes the current step (snag / evidence /
    // declined VO), or a DECLINED org disputes the RM's quote decline (thread +
    // flag only — the ticket may already be awarded elsewhere).
    const workflowRaise = isAwardedSupplier && ['snag', 'evidence_requested', 'vo_declined'].includes(ticket.status)
    if (!workflowRaise && !declinedOrg) {
      return NextResponse.json({ error: 'A dispute can only be raised on a snag, an evidence request, a declined variation order, or a declined quote.' }, { status: 400 })
    }
    if (openDispute) return NextResponse.json({ error: 'A dispute is already open on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    const origin = workflowRaise
      ? (ticket.status === 'snag' ? 'snag' : ticket.status === 'vo_declined' ? 'variation' : 'evidence_requested')
      : 'quote_declined'
    const orgId = workflowRaise ? ticket.supplier_id : declinedOrg
    let { data: disp, error } = await admin.from('ticket_disputes')
      .insert({ company_id: ticket.company_id, ticket_id: ticketId, origin, status: 'open', raised_by: user.id, supplier_id: orgId, created_at: now })
      .select('id').single()
    if (error) {
      // Pre-migration fallback: supplier_id may not exist yet (20260721). A workflow
      // dispute binds to the awarded org implicitly, so retry unbound; a quote-decline
      // dispute NEEDS the binding (its visibility keys on it) — surface the migration.
      if (origin === 'quote_declined') {
        return NextResponse.json({ error: 'Quote-decline disputes are not available yet — the latest database migration needs to be applied.' }, { status: 503 })
      }
      ;({ data: disp, error } = await admin.from('ticket_disputes')
        .insert({ company_id: ticket.company_id, ticket_id: ticketId, origin, status: 'open', raised_by: user.id, created_at: now })
        .select('id').single())
    }
    if (error || !disp) return NextResponse.json({ error: 'Could not raise the dispute.' }, { status: 500 })
    // Link a snag/evidence dispute to the submission it concerns (the latest signoff).
    // Best-effort, separate update so raising works before the signoff_id column exists.
    if (origin === 'snag' || origin === 'evidence_requested') {
      const { data: latestSignoff } = await admin.from('signoffs').select('id').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (latestSignoff?.id) await admin.from('ticket_disputes').update({ signoff_id: latestSignoff.id }).eq('id', disp.id)
    }
    await admin.from('ticket_dispute_messages').insert({ dispute_id: disp.id, ticket_id: ticketId, author_id: user.id, author_role: 'supplier', body: messageBody || null, evidence_urls: evidence, created_at: now })
    await admin.from('tickets').update({ ...stampFreshness(actingRole, now), updated_at: now }).eq('id', ticketId)
    await notifyResolver(admin, ticket, title, origin === 'quote_declined'
      ? 'A supplier has disputed your quote decline. Please review it and respond.'
      : 'The supplier has raised a dispute. Please review it and respond.')
  } else if (action === 'reply') {
    if (!openDispute) return NextResponse.json({ error: 'No open dispute on this ticket.' }, { status: 409 })
    const messageBody = String(body.body ?? '').trim()
    const evidence = cleanUrls(body.evidenceUrls)
    if (!messageBody && !evidence.length) return NextResponse.json({ error: 'Add a message or attach evidence.' }, { status: 400 })
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: messageBody || null, evidence_urls: evidence, created_at: now })
    if (actingRole === 'supplier') {
      await admin.from('tickets').update(stampFreshness(actingRole, now)).eq('id', ticketId)
      await notifyResolver(admin, ticket, title, 'The supplier added a new reply to the dispute.')
    } else {
      await push(admin, await supplierIds(admin, openDispute.supplier_id ?? ticket.supplier_id), ticket.company_id ?? '', ticketId, title, 'The manager has replied to your dispute.', `/supplier/tickets/${ticketId}`)
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
    const label = proposed === 'withdrawn' ? `proposed to resolve the dispute — drop the ${what}` : `proposed to keep the ${what} — it stands`
    await admin.from('ticket_dispute_messages').insert({ dispute_id: openDispute.id, ticket_id: ticketId, author_id: user.id, author_role: actingRole, body: `${roleName(actingRole)} ${label}. Awaiting the other party's agreement.${note ? ` — ${note}` : ''}`, evidence_urls: [], created_at: now })
    await admin.from('tickets').update({ updated_at: now, ...stampFreshness(actingRole, now) }).eq('id', ticketId)
    if (actingRole === 'supplier') await notifyResolver(admin, ticket, title, 'The supplier has proposed resolving the dispute. Confirm to drop the request.')
    else await push(admin, await supplierIds(admin, openDispute.supplier_id ?? ticket.supplier_id), ticket.company_id ?? '', ticketId, title, 'The manager has proposed keeping the request. Confirm to agree.', `/supplier/tickets/${ticketId}`)
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

  revalidatePath(`/supplier/tickets/${ticketId}`);revalidatePath(`/regional/tickets/${ticketId}`)
  revalidatePath('/supplier');revalidatePath('/regional')
  return NextResponse.json({ ok: true })
}
