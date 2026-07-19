// ============================================================
// MOTIV — Regional ticket-detail data loader (server-only).
// Extracted from app/regional/tickets/[id]/page.tsx so the page is mostly JSX.
// Runs the auth gate, fetches every row the detail page renders, signs private
// URLs, and computes the derived flags / maps / next-action the JSX consumes.
// Returns a discriminated result — the page handles redirect(); the guard's own
// auth redirects (to /auth/login, /regional) still throw from inside requireRegionalV3.
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { signedUrl } from '@/lib/storage'
import { requireRegionalV3 } from '@/lib/health/guard'
import { chatUnreadCounts } from '@/lib/chat-unread'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { buildTicketTimeline, rmFriendlyLabel } from '@/lib/ticket-timeline'
import { rmStatusMeta, storeLabel } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

// Row aliases for the column-list selects below (typed Supabase client infers the
// same shapes; these names are for the function params / helpers that receive them).
type Tables = Database['public']['Tables']
type TicketRow = Tables['tickets']['Row']
type StoreSel = Pick<Tables['stores']['Row'], 'name' | 'sub_store' | 'region_id' | 'company_id'>
type QuoteSel = Pick<Tables['quotes']['Row'], 'id' | 'supplier_id' | 'amount' | 'amount_incl_vat' | 'description' | 'file_url' | 'status' | 'valid_until' | 'proposed_schedule_at' | 'decline_reason' | 'created_at' | 'updated_at'>
type SupplierSel = Pick<Tables['suppliers']['Row'], 'id' | 'company_name' | 'trade' | 'trades'>
type SnagSel = Pick<Tables['snags']['Row'], 'description' | 'status' | 'scheduled_at' | 'schedule_status' | 'assigned_at' | 'schedule_agreed_at' | 'schedule_declined_at' | 'schedule_decline_reason' | 'created_at'>

// Professional "what we're waiting on" copy while a snag works its way through.
export const SNAG_WAIT_MSG: Record<string, string> = {
  snag: 'This completion has been snagged. Awaiting the supplier to accept the snag and propose a date to carry out the corrective work.',
  snag_assigned: 'The snag schedule is approved. The supplier will carry out the corrective work on the agreed date and resubmit the completion for sign-off.',
  snag_in_progress: 'The supplier is carrying out the corrective work and will resubmit the completion for sign-off.',
  snag_resolved: 'The snag has been resolved. Awaiting the resubmitted completion for sign-off.',
}

export type RegionalTicketDetailResult =
  | { kind: 'redirect'; to: string }
  | { kind: 'ok'; data: Awaited<ReturnType<typeof buildRegionalTicketDetail>> }

export async function loadRegionalTicketDetail(ticketId: string): Promise<RegionalTicketDetailResult> {
  // Overlap the auth gate with the ticket fetch (admin client needs no user ctx)
  // — one round-trip wave instead of two on every detail-page load.
  const admin = createAdminClient()
  const [{ companyId, regionIds, userId }, { data: t }] = await Promise.all([
    requireRegionalV3(),
    admin.from('tickets').select('*').eq('id', ticketId).single(),
  ])
  if (!t) return { kind: 'redirect', to: '/regional/tickets' }
  // Authorise by the ticket's STORE being in one of the RM's regions (the durable
  // store→region link) rather than the denormalised tickets.region_id — so a ticket
  // logged before its store was linked to the region (region_id still null/stale)
  // still opens for the RM instead of bouncing back to the list.
  const { data: store } = await admin.from('stores').select('name, sub_store, region_id, company_id').eq('id', t.store_id ?? '').maybeSingle()
  if (!store || store.company_id !== companyId || !store.region_id || !regionIds.includes(store.region_id)) return { kind: 'redirect', to: '/regional/tickets' }

  const data = await buildRegionalTicketDetail(admin, t, store, companyId, userId)
  return { kind: 'ok', data }
}

async function buildRegionalTicketDetail(
  admin: ReturnType<typeof createAdminClient>,
  t: TicketRow,
  store: StoreSel,
  companyId: string,
  userId: string,
) {
  const [{ data: quotes }, { data: updates }, { data: signoffs }, { data: suppliers }, { data: variations }, { data: snags }, { data: invites }, { data: ratingRows }, { data: roundRows }] = await Promise.all([
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, decline_reason, created_at, updated_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, status, before_urls, after_urls, coc_url, invoice_url, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('suppliers').select('id, company_name, trade, trades').eq('company_id', companyId).eq('active', true).order('company_name'),
    admin.from('ticket_variations').select('description, amount, warranty, status, reject_reason, reviewed_at, created_at, file_urls').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('snags').select('description, status, scheduled_at, schedule_status, assigned_at, schedule_agreed_at, schedule_declined_at, schedule_decline_reason, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, responded_at, decline_reason, declined_by, suppliers(company_name)').eq('ticket_id', t.id),
    admin.from('ratings').select('supplier_id, score').eq('company_id', companyId),
    // Durable COC/POC review-round log — drives the "Submission #N" numbers + the
    // sent-back reason on the archived round cards (falls back to the signoff rows
    // for tickets predating this table). Null if the table isn't migrated yet.
    admin.from('signoff_rounds').select('signoff_id, round_no, kind, reason').eq('ticket_id', t.id),
  ])
  const storeName = store ? storeLabel(store.name, store.sub_store) : 'Store'
  const editorName = t.edited_by ? ((await admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single()).data?.full_name ?? null) : null
  // Motiv-curated supplier pool (assign pop-up) + who has viewed this ticket's items.
  const [{ data: motivSuppliers }, { data: viewRows }, { data: declineRows }, { data: requestRows }, { data: readRow }, { data: disputeRows }, { data: disputeMsgRows }, { data: snagEventRows }, { data: disputeExtra }] = await Promise.all([
    admin.from('suppliers').select('id, company_name, trade, trades').eq('is_motiv', true).eq('active', true).order('company_name'),
    admin.from('ticket_views').select('viewer_role, item_type, item_label, first_viewed_at').eq('ticket_id', t.id),
    // Durable supplier request-declines — kept even after the supplier is re-invited.
    admin.from('ticket_supplier_declines').select('supplier_id, reason, declined_at').eq('ticket_id', t.id).order('declined_at', { ascending: true }),
    // Durable quote-request rounds — each (re)assignment adds a "Quote requested"
    // event, attributed to the supplier so the trail reads "Quote requested from X".
    admin.from('ticket_quote_requests').select('supplier_id, requested_at').eq('ticket_id', t.id).order('requested_at', { ascending: true }),
    // THIS RM's "last seen this ticket" watermark → which supplier updates are new.
    admin.from('ticket_reads').select('last_seen_at').eq('user_id', userId).eq('ticket_id', t.id).maybeSingle(),
    // Snag / evidence disputes on this ticket + their message threads (chronological).
    admin.from('ticket_disputes').select('id, origin, status, outcome, resolution_note, created_at, resolved_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    admin.from('ticket_dispute_messages').select('id, dispute_id, author_role, body, evidence_urls, created_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    // Durable snag-fix schedule rounds → every proposal / approval / decline on the trail.
    admin.from('snag_schedule_events').select('kind, scheduled_for, reason, created_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    // Newer per-dispute columns (signoff link + pending proposal) fetched separately so
    // the dispute block still works if those columns aren't migrated yet (query fails → null).
    admin.from('ticket_disputes').select('id, signoff_id, pending_outcome, pending_by').eq('ticket_id', t.id),
  ])
  // Private-bucket signing. The "new evidence" green-highlight compares URLs across
  // signoff rounds by equality, so each DISTINCT stored URL is signed exactly once
  // (shared map) → identical stored URLs still map to identical signed URLs. Every
  // render site below reads the rewritten rows.
  const _signCache = new Map<string, Promise<string | null>>()
  const signOne = (u: string | null | undefined): Promise<string | null> => {
    if (!u) return Promise.resolve(null)
    let p = _signCache.get(u)
    if (!p) { p = signedUrl(u); _signCache.set(u, p) }
    return p
  }
  // `unknown` input: evidence_urls is a JSON column — non-array values pass through unchanged.
  const signList = async (list: unknown): Promise<string[] | null> =>
    Array.isArray(list) ? (await Promise.all(list.map(signOne))).filter((x): x is string => !!x) : (list as string[] | null)
  if (Array.isArray(t.photo_urls)) t.photo_urls = await signList(t.photo_urls)
  await Promise.all([
    ...(signoffs ?? []).map(async s => {
      s.before_urls = await signList(s.before_urls)
      s.after_urls = await signList(s.after_urls)
      s.coc_url = await signOne(s.coc_url)
      s.invoice_url = await signOne(s.invoice_url)
    }),
    ...(quotes ?? []).map(async q => { q.file_url = await signOne(q.file_url) }),
    ...(variations ?? []).map(async v => { v.file_urls = (await signList(v.file_urls)) ?? [] }),
    ...(disputeMsgRows ?? []).map(async m => { m.evidence_urls = await signList(m.evidence_urls) }),
    // Supplier progress-photo updates embed the URL in the body ("📷 Progress photo: <url>").
    ...(updates ?? []).map(async u => {
      const match = String(u.body).match(/^(📷\s*Progress photo:\s*)(\S+)([\s\S]*)$/)
      if (match) u.body = `${match[1]}${await signOne(match[2])}${match[3]}`
    }),
  ])
  // Full COC/POC history — every submission, split by state (mirrors the supplier
  // view). Each sent-back card carries the reason it was rejected.
  const allSignoffs = signoffs ?? []
  const pendingSignoffs = allSignoffs.filter(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status))
  const acceptedSignoff = allSignoffs.find(s => s.status === 'accepted') ?? null
  const rejectedSignoffs = allSignoffs.filter(s => s.status === 'rejected')
  // Submissions sent back for more evidence (not snagged) — kept in the history with
  // the reason the RM asked for more.
  const evidenceRequestedSignoffs = allSignoffs.filter(s => s.status === 'evidence_requested')
  // A pending submission that follows an earlier "more evidence" request is the
  // supplier's resubmission — flag it so the new COC/POC/notes highlight in green.
  const isEvidenceResubmission = pendingSignoffs.length > 0 && evidenceRequestedSignoffs.length > 0

  // Snag / evidence disputes. An OPEN one shows a live thread the RM resolves;
  // resolved ones live in the Archive (read-only). Messages grouped by dispute.
  const disputeExtraById = new Map((disputeExtra ?? []).map(x => [x.id, x] as const))
  // Spreading a possibly-undefined extra row is a runtime no-op → the extra columns type as optional.
  const disputes = (disputeRows ?? []).map(d => ({ ...d, ...disputeExtraById.get(d.id) }))
  const disputeMsgs = disputeMsgRows ?? []
  // evidence_urls is a JSON column that stores an array of (now signed) URL strings.
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id).map(m => ({ ...m, evidence_urls: Array.isArray(m.evidence_urls) ? (m.evidence_urls as string[]) : [] }))
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')
  // Stable "Submission #N" numbers across live + archived, ordered by when each
  // COC/POC was submitted (oldest = #1). Shown in the card titles.
  const submissionNo = new Map<string, number>()
  ;[...allSignoffs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).forEach((s, i) => submissionNo.set(s.id, i + 1))
  // Superseded submissions (sent back for more evidence OR snagged) → collapsed round
  // cards in the Archive, newest first. The live under-review one stays in COC & POC;
  // the approved one in Completion.
  // A submission with an OUTSTANDING request (more evidence, or a raised snag) stays
  // live in the Completion tab until the supplier re-submits — only then is it
  // superseded and moved to the Archive. Mirrors the supplier's ticket view.
  const liveEvidence = t.status === 'evidence_requested' ? (evidenceRequestedSignoffs[0] ?? null) : null
  const liveSnagSubmission = ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? (rejectedSignoffs[0] ?? null) : null
  const supersededSubmissions = [...evidenceRequestedSignoffs, ...rejectedSignoffs]
    .filter(s => s.id !== liveEvidence?.id && s.id !== liveSnagSubmission?.id)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  // Durable review-round log drives the number / kind / reason on each round card;
  // falls back to the signoff row (submission ordinal + reject_reason + status) for
  // tickets that predate the signoff_rounds table.
  const roundBySignoff = new Map<string, { round_no: number; kind: string; reason: string | null }>()
  for (const r of roundRows ?? []) if (r.signoff_id) roundBySignoff.set(r.signoff_id, { round_no: r.round_no, kind: r.kind, reason: r.reason ?? null })
  const submissionLabel = (s: { id: string }) => `Submission #${roundBySignoff.get(s.id)?.round_no ?? submissionNo.get(s.id) ?? '?'}`
  const submissionTone = (s: { id: string; status: string }): 'snag' | 'evidence' => (roundBySignoff.get(s.id)?.kind ?? (s.status === 'rejected' ? 'snag' : 'evidence')) === 'snag' ? 'snag' : 'evidence'
  // What each dispute is about — the disputed "Submission #N" + snag / evidence request.
  const disputeSubject = (d: { origin: string; signoff_id?: string | null }) => {
    if (d.origin === 'variation') return 'Variation order · declined'
    const n = d.signoff_id ? submissionNo.get(d.signoff_id) : null
    const what = d.origin === 'snag' ? 'snag' : 'evidence request'
    return n ? `Submission #${n} · ${what}` : what
  }
  // Snag scheduling — the supplier's proposed fix date (separate from the original
  // job schedule) and whether it's still awaiting the RM's approval.
  // scheduled_at typed non-null: every render read is behind a guard (snagAwaitingApproval /
  // snagFixApproved / `?.scheduled_at`) that ensures it's set; the raw row allows null.
  const latestSnag = (((snags ?? [])[0] ?? null) as (SnagSel & { scheduled_at: string }) | null)
  const snagScheduledAt = (snags ?? []).find(s => s.scheduled_at)?.scheduled_at ?? null
  const snagAwaitingApproval = t.status === 'snag_assigned' && latestSnag?.schedule_status === 'proposed' && !!latestSnag?.scheduled_at
  // Snag-fix callout in the ticket detail shows ONLY once the RM has approved the date;
  // it then replaces the original "Scheduled" callout. While a snag schedule is in
  // play (proposed or agreed) the original visit callout is hidden (it's stale).
  const snagFixApproved = !!latestSnag?.scheduled_at && latestSnag.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(latestSnag.status)
  const snagScheduleActive = !!latestSnag?.scheduled_at && ['proposed', 'agreed'].includes(latestSnag.schedule_status ?? '') && ['assigned', 'in_progress'].includes(latestSnag.status)
  // Most recent declined snag-fix date (for the audit trail + Archive note).
  const declinedSnag = (snags ?? []).find((s): s is SnagSel & { schedule_declined_at: string } => !!s.schedule_declined_at) ?? null

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Dual-SLA result → breach reason (which pending action ran past its deadline).
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && (sla.supplierBreached || sla.internalBreached)

  // Avg star rating per supplier, so the RM sees each contractor's record when assigning.
  const ratingAgg = new Map<string, { sum: number; n: number }>()
  for (const r of ratingRows ?? []) {
    if (!r.supplier_id) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  const toSupplierCard = (s: SupplierSel) => {
    const ra = ratingAgg.get(s.id)
    const category = Array.isArray(s.trades) && s.trades.filter(Boolean).length ? s.trades.filter(Boolean).join(', ') : (s.trade ?? null)
    return { id: s.id, name: s.company_name, category, avgRating: ra ? ra.sum / ra.n : 5, ratingCount: ra ? ra.n : 0 }
  }
  const supplierList = (suppliers ?? []).map(toSupplierCard)
  // The Motiv directory is gated: a company sees the shared Motiv pool only after
  // an RM requests access and a system_admin approves it. Until then, no Motiv
  // suppliers are exposed and the assign pop-up shows a "request access" step.
  const { data: motivAccessRow } = await admin.from('company_motiv_access').select('status').eq('company_id', companyId).maybeSingle()
  const motivAccess = (motivAccessRow?.status ?? 'none') as 'none' | 'pending' | 'approved' | 'rejected'
  const motivSupplierList = motivAccess === 'approved'
    ? (motivSuppliers ?? []).filter(s => !supplierList.some(m => m.id === s.id)).map(toSupplierCard)
    : []
  const nameById = new Map<string, string>([...supplierList, ...motivSupplierList].map(s => [s.id, s.name]))
  for (const inv of invites ?? []) if (inv.suppliers?.company_name) nameById.set(inv.supplier_id, inv.suppliers.company_name)
  const declineReasonBy = new Map<string, string>()
  for (const inv of invites ?? []) if (inv.decline_reason) declineReasonBy.set(inv.supplier_id, inv.decline_reason)
  const supplierRows = (invites ?? []).map(inv => ({ id: inv.supplier_id, name: inv.suppliers?.company_name ?? nameById.get(inv.supplier_id) ?? 'Supplier', status: inv.status, invitedAt: inv.invited_at ?? null, respondedAt: inv.responded_at ?? null, declineReason: inv.decline_reason ?? null, declinedBy: (inv.declined_by ?? null) as 'supplier' | 'regional_manager' | null }))
  // Suppliers who previously declined/were-declined on this ticket — the assign
  // pop-up warns before re-sending them the quote request.
  const declinedSupplierIds = (invites ?? []).filter(i => ['declined', 'closed'].includes(i.status)).map(i => i.supplier_id)
  const activeSupplierRows = supplierRows.filter(r => !['declined', 'closed'].includes(r.status))
  // Suppliers already engaged on this ticket (awaiting their quote, or already
  // quoted) — the assign pop-up shows them non-selectable so the RM can't re-invite
  // someone they're already waiting on (a no-op).
  const engagedSupplierIds: Record<string, 'invited' | 'quoted'> = {}
  for (const r of activeSupplierRows) if (r.status === 'invited' || r.status === 'quoted') engagedSupplierIds[r.id] = r.status
  // Freshly (re)assigned and awaiting quotes → a clean "new suppliers assigned" note.
  const awaitingSupplierQuotes = ['assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(t.status) && activeSupplierRows.some(r => r.status === 'invited')
  // A quote has been approved → the ticket is awarded and the round is over.
  const awarded = (quotes ?? []).some(q => q.status === 'accepted') || !!t.supplier_id
  // Per-ticket RM↔supplier chat is available once a supplier is awarded. One
  // count drives both the header icon's unread dot and the floating chat button.
  const chatUnreadCount = t.supplier_id ? ((await chatUnreadCounts(admin, userId, [t.id]))[t.id] ?? 0) : 0
  const chatUnread = chatUnreadCount > 0
  // Round boundary = the most recent quote-request round (assign / re-assign). A
  // decline (quote or request) is "live" only if it happened in this current round;
  // everything from earlier rounds moves to the Archive so nothing is ever dropped.
  // Once a quote is awarded the whole thing is over → nothing is live.
  const lastRequestMs = Math.max(0,
    ...(requestRows ?? []).map(r => +new Date(r.requested_at)),
    ...supplierRows.map(r => (r.invitedAt ? +new Date(r.invitedAt) : 0)),
    t.quote_requested_at ? +new Date(t.quote_requested_at) : 0,
  )
  const isCurrentRound = (at: string | null | undefined) => !awarded && !!at && +new Date(at) >= lastRequestMs
  // Supplier request-declines from the durable log (survive re-invite). Current-round
  // ones show live in the Quotes block; earlier ones go to the Archive.
  const supplierDeclines = (declineRows ?? [])
    .map(d => ({ supplierId: d.supplier_id as string, name: nameById.get(d.supplier_id ?? '') ?? 'Supplier', reason: d.reason ?? null, at: d.declined_at }))
    .filter(d => d.at)
  // Courteous "not selected" note for the losing suppliers once the job is awarded —
  // matches the supplier-side wording. Shown on auto-declined quotes (no explicit
  // reason) and on still-waiting suppliers that were auto-closed on award.
  const COURTESY_NOTE = 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'
  // Suppliers auto-closed when the job was awarded to someone else, who never
  // submitted a quote (they were still waiting). Losing quoters instead surface as
  // declined quote cards below. 'closed' status only ever happens on award.
  const quotedSupplierIds = new Set((quotes ?? []).map(q => q.supplier_id))
  const closedWaitingRows = supplierRows.filter(r => r.status === 'closed' && !quotedSupplierIds.has(r.id))
  const mapQuote = (q: QuoteSel) => ({
    id: q.id, supplierId: q.supplier_id as string, supplierName: nameById.get(q.supplier_id ?? '') ?? 'Supplier', amount: q.amount,
    amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null,
    // Prefer the durable per-quote reason; fall back to the invite's (mutable) reason,
    // then to the courteous "not selected" note for quotes auto-declined on award.
    validUntil: q.valid_until ?? null, createdAt: q.created_at, declineReason: q.decline_reason ?? declineReasonBy.get(q.supplier_id ?? '') ?? (awarded ? COURTESY_NOTE : null),
    proposedScheduleAt: q.proposed_schedule_at ?? null, declinedAt: q.updated_at ?? null,
  })
  const reviewQuotes = (quotes ?? []).filter(q => q.status === 'pending').map(mapQuote)
  const acceptedQuotes = (quotes ?? []).filter(q => q.status === 'accepted').map(mapQuote)
  const declinedQuotes = (quotes ?? []).filter(q => q.status === 'declined').map(mapQuote)
  // Current-round declines stay in the Quotes block; earlier rounds go to the Archive
  // (a new supplier was assigned, or a quote was approved).
  const liveDeclinedQuotes = declinedQuotes.filter(q => isCurrentRound(q.declinedAt))
  const archivedDeclinedQuotes = declinedQuotes.filter(q => !isCurrentRound(q.declinedAt))
  const archivedRequestDeclines = supplierDeclines.filter(d => !isCurrentRound(d.at))
  // A supplier shown as a full live declined-quote card drops out of the red-dot
  // "Suppliers requested" list, which holds active invites + current-round request-
  // declines. A supplier whose decline is from an earlier round moves to the Archive.
  const liveDeclinedQuoteIds = new Set(liveDeclinedQuotes.map(q => q.supplierId))
  const requestedRows = supplierRows.filter(r =>
    r.status !== 'closed'
    && !(awarded && r.status === 'declined')
    && !liveDeclinedQuoteIds.has(r.id)
    && !(r.status === 'declined' && !isCurrentRound(r.respondedAt)))
  const isTerminal = ['completed', 'cancelled', 'declined'].includes(t.status)
  // "Ask to re-quote" re-invites that supplier (same effect as assigning them
  // again). Offered on a live declined quote whenever the ticket is still in a
  // re-assignable commercial phase and no quote has been awarded — including when
  // every supplier declined (the ticket is back to Open). Mirrors the /assign statuses.
  const canReQuote = acceptedQuotes.length === 0 && ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined'].includes(t.status)
  // Assigning / adding work / requesting info is available before a supplier is on
  // the ticket — incl. when every invited supplier declined (suppliers_declined).
  const canAssign = ['open', 'info_requested', 'suppliers_declined'].includes(t.status)
  // Cancelling is only allowed up to (and including) quote review — once a quote
  // is accepted (status 'accepted' or later), the job is committed.
  const canCancel = ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined'].includes(t.status)
  const canEdit = ['open', 'info_requested'].includes(t.status)
  // The RM's quoting workspace rows, rendered inside the "Next action" block: each
  // requested supplier, with any submitted quote attached so its status becomes a
  // clickable item that pops up the full quote (+ Approve / Decline).
  const quoteBySupplier = new Map<string, { kind: 'received' | 'accepted' | 'declined'; q: ReturnType<typeof mapQuote> }>()
  for (const q of acceptedQuotes) quoteBySupplier.set(q.supplierId, { kind: 'accepted', q })
  for (const q of reviewQuotes) if (!quoteBySupplier.has(q.supplierId)) quoteBySupplier.set(q.supplierId, { kind: 'received', q })
  for (const q of liveDeclinedQuotes) if (!quoteBySupplier.has(q.supplierId)) quoteBySupplier.set(q.supplierId, { kind: 'declined', q })
  const toPanelQuote = (q: ReturnType<typeof mapQuote>) => ({ id: q.id, amount: q.amount, amountInclVat: q.amountInclVat ?? null, description: q.description ?? null, fileUrl: q.fileUrl ?? null, createdAt: q.createdAt, validUntil: q.validUntil ?? null, proposedScheduleAt: q.proposedScheduleAt ?? null })
  const quotePanelSeen = new Set<string>()
  const quotePanelRows: { supplierId: string; name: string; requestedAt: string | null; kind: 'waiting' | 'received' | 'accepted' | 'declined'; declineReason: string | null; quote: ReturnType<typeof toPanelQuote> | null }[] = []
  for (const r of requestedRows) {
    const qs = quoteBySupplier.get(r.id)
    quotePanelRows.push({ supplierId: r.id, name: r.name, requestedAt: r.invitedAt ?? null, kind: qs?.kind ?? 'waiting', declineReason: r.declineReason ?? qs?.q?.declineReason ?? null, quote: qs ? toPanelQuote(qs.q) : null })
    quotePanelSeen.add(r.id)
  }
  for (const [sid, qs] of quoteBySupplier) if (!quotePanelSeen.has(sid)) quotePanelRows.push({ supplierId: sid, name: qs.q.supplierName, requestedAt: qs.q.createdAt, kind: qs.kind, declineReason: qs.q.declineReason ?? null, quote: toPanelQuote(qs.q) })
  // The "Assign supplier" button stays available through the whole commercial phase —
  // the RM can add / re-assign suppliers at any time until a quote is approved
  // (awarded). Mirrors the /assign route's allowed statuses.
  const canAssignSupplier = acceptedQuotes.length === 0 && ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined'].includes(t.status)
  // "Info added" = the SM resubmitted after an info request (back at open, reason kept).
  const rmInfoAdded = t.status === 'open' && !!t.info_request_reason

  // Supplier progress updates (notes / photos). "New" = posted since THIS RM last
  // OPENED the ticket (the ticket_reads watermark, bumped by MarkTicketSeen on open).
  // New updates surface prominently just below the ticket detail; once seen, on the
  // next open they fold into a collapsible history above the audit trail. The full
  // history is always kept (ticket_updates rows are never deleted).
  // body is never null on a real update row (narrow cast so the page's Update props typecheck).
  const supplierUpdates = (updates ?? []).filter(u => u.author_role === 'supplier') as { body: string; author_role: string | null; created_at: string }[]
  const lastSeenMs = readRow?.last_seen_at ? +new Date(readRow.last_seen_at) : 0
  const newSupplierUpdates = supplierUpdates.filter(u => +new Date(u.created_at) > lastSeenMs)

  // The RM's single most important pending step — the "Next action" signpost that
  // mirrors the SM ticket's flavor. The real controls live in the Actions card
  // below; this just tells the RM (or reassures them) what's next. `act` = needs
  // the RM, `wait` = waiting on someone else, `done`/`closed` = finished.
  const nextAction: { mode: 'act' | 'wait' | 'done' | 'closed'; msg: string; sub: string } = (() => {
    // Completed — the standing green callout below carries the message; the
    // signpost line is blank so it isn't said twice.
    if (t.status === 'completed') return { mode: 'done', msg: '', sub: '' }
    if (t.status === 'cancelled' || t.status === 'declined') return { mode: 'closed', msg: `Ticket ${t.status}`, sub: t.cancellation_reason || 'No further action needed.' }
    if (openDispute) return { mode: 'act', msg: 'Resolve the open dispute', sub: 'A dispute is paused on this ticket — review the thread and resolve it in the Dispute section.' }
    if (snagAwaitingApproval) return { mode: 'act', msg: 'Approve the snag-fix date', sub: 'The supplier proposed a date to carry out the corrective work — approve it below.' }
    if (pendingSignoffs.length > 0) return { mode: 'act', msg: '', sub: 'The supplier submitted the COC & POC — approve it, request more evidence, or raise a snag.' }
    if (t.status === 'variation_review') return { mode: 'act', msg: 'Review the variation order', sub: 'A variation order for extra work is awaiting your approval below.' }
    if (reviewQuotes.length > 0) return { mode: 'act', msg: 'Quotes received', sub: '' }
    if (t.status === 'scheduled' && t.schedule_status === 'proposed' && t.scheduled_at) return { mode: 'act', msg: 'Accept the proposed visit time', sub: 'The supplier proposed a time beyond the SLA window — accept it below.' }
    // Approved — awaiting close-out: the standing callout below carries the detail,
    // so the signpost line is blank (not said twice).
    if (t.status === 'approved_closeout') return { mode: 'act', msg: '', sub: '' }
    if (rmInfoAdded) return { mode: 'act', msg: 'Review the added information', sub: 'The store manager answered your request — assign a supplier or move the ticket on.' }
    if (canAssign) return { mode: 'act', msg: 'Assign a supplier', sub: 'Send this job to one or more suppliers to request quotes.' }
    if (awaitingSupplierQuotes) return { mode: 'wait', msg: 'Waiting on supplier quotes', sub: '' }
    // Evidence-requested / snagged — the standing callout below carries the detail;
    // the signpost line is blank so it isn't said twice.
    if (t.status === 'evidence_requested') return { mode: 'wait', msg: '', sub: '' }
    if (SNAG_WAIT_MSG[t.status]) return { mode: 'wait', msg: '', sub: '' }
    if (t.status === 'vo_declined') return { mode: 'wait', msg: 'Waiting on the supplier', sub: 'You declined the variation order — the supplier can revise it or message you.' }
    // Quote approved / job awarded (accepted or scheduled) — the standing callout
    // below carries the message; the signpost line is blank so it isn't said twice.
    if (['accepted', 'scheduled'].includes(t.status)) return { mode: 'wait', msg: '', sub: '' }
    // In progress — the standing "…on site or en route…" callout below carries the
    // message; the signpost line is intentionally blank to avoid saying it twice.
    if (t.status === 'in_progress') return { mode: 'wait', msg: '', sub: '' }
    return { mode: 'wait', msg: rmStatusMeta(t.status).label, sub: 'No action needed from you right now.' }
  })()

  // Every image on the ticket, aggregated into one bottom gallery (SM-style),
  // grouped + labelled by source so the before/after and submission context
  // survives. Documents (COC/invoice/VO PDFs) stay as links in their own cards;
  // the completion before/after ALSO remain in the sign-off card for in-context
  // review — so a few images intentionally appear in both places.
  const photoGroups: { label: string; urls: string[] }[] = []
  if (Array.isArray(t.photo_urls) && t.photo_urls.length) photoGroups.push({ label: 'Logged photos', urls: t.photo_urls })
  for (const s of [...allSignoffs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    const n = submissionNo.get(s.id)
    const before = (s.before_urls ?? []).filter(Boolean)
    const after = (s.after_urls ?? []).filter(Boolean)
    if (before.length) photoGroups.push({ label: `Completion #${n} · Before`, urls: before })
    if (after.length) photoGroups.push({ label: `Completion #${n} · After`, urls: after })
  }
  const progressPhotoUrls = supplierUpdates
    .map(u => { const m = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/); return m ? m[1] : null })
    .filter((x): x is string => !!x)
  if (progressPhotoUrls.length) photoGroups.push({ label: 'Supplier progress', urls: progressPhotoUrls })

  // Full life-of-ticket timeline (status changes, edits, attachments/photos
  // viewed, quotes, sign-offs, disputes…) for the bottom "Timeline" tab. Restated
  // in a friendly, SM-style voice (actor baked into the sentence → the "who" line
  // drops away) while keeping every detail.
  const timelineItems = buildTicketTimeline({
    createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
    quoteRequestedAt: t.first_quote_requested_at ?? t.quote_requested_at,
    quoteRequests: (requestRows ?? []).map(r => ({ at: r.requested_at, supplierName: r.supplier_id ? (nameById.get(r.supplier_id) ?? null) : null })),
    quoteSubmittedAt: t.quote_submitted_at,
    quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
    scheduledAt: t.scheduled_at, completedAt: t.completed_at,
    editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, cancellationReason: t.cancellation_reason,
    infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
    snagScheduledAt,
    snagAcceptedAt: latestSnag?.assigned_at ?? null,
    snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
    snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
    snagScheduleEvents: snagEventRows ?? [],
    workStartedAt: t.attended_at ?? null,
    quotes: (quotes ?? []).map(q => ({ ...q, supplierName: nameById.get(q.supplier_id ?? '') ?? 'Supplier' })),
    variations: variations ?? [],
    disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
    disputeMessages: disputeMsgs.map(m => ({ author_role: m.author_role, body: m.body, created_at: m.created_at })),
    // body is never null on a real update row; TimelineInput expects string (narrow cast, no runtime change).
    signoffs: allSignoffs, updates: (updates ?? []) as { body: string; author_role: string | null; created_at: string }[], views: viewRows ?? [],
    supplierDeclines,
  }).map(e => ({ ...e, label: rmFriendlyLabel(e), who: null }))

  // "History" tab archived groups (superseded / not-selected quotes, declined quote
  // requests, sent-back submissions, a declined snag-fix date, variation orders).
  const archivedGroups = { archivedDeclinedQuotes, archivedRequestDeclines, closedWaitingRows, supersededSubmissions, declinedSnag, variations: variations ?? [] }

  // "Documents" tab — every document (PDF) on the ticket in one place: the approved
  // quote, the COC & invoice, and any variation-order attachments.
  type DocLink = { label: string; href: string; itemType: 'quote' | 'coc' | 'invoice' | 'attachment' }
  const documentLinks: DocLink[] = []
  for (const q of acceptedQuotes) if (q.fileUrl) documentLinks.push({ label: `${q.supplierName}'s quote`, href: q.fileUrl, itemType: 'quote' })
  for (const s of [acceptedSignoff, ...pendingSignoffs].filter(s => s !== null)) {
    if (s.coc_url) documentLinks.push({ label: 'Certificate of Completion (COC)', href: s.coc_url, itemType: 'coc' })
    if (s.invoice_url) documentLinks.push({ label: 'Invoice', href: s.invoice_url, itemType: 'invoice' })
  }
  ;(variations ?? []).forEach((v, i) => {
    if (Array.isArray(v.file_urls)) v.file_urls.forEach((u, j) => documentLinks.push({ label: `Variation order ${i + 1} · Attachment ${j + 1}`, href: u, itemType: 'attachment' }))
  })

  // "Quotes" tab — a read-only record of the quotes on the ticket: the approved one
  // plus any still under review.
  const quotesTabList = [...acceptedQuotes, ...reviewQuotes]
  const acceptedQuoteIds = new Set(acceptedQuotes.map(q => q.id))

  // The COC & POC submission currently awaiting the RM's sign-off (if any).
  const reviewSignoff = t.status === 'submitted_for_signoff' ? (pendingSignoffs[0] ?? null) : null

  const pendingVariation = (variations ?? []).find(v => v.status === 'pending') ?? null

  return {
    t, storeName, editorName, dueAt, overdue, now, sla, breached, chatUnread, chatUnreadCount, nextAction,
    COURTESY_NOTE,
    disputes, openDispute, resolvedDisputes, disputeSubject, msgsByDispute,
    roundBySignoff, submissionLabel, submissionTone,
    allSignoffs, pendingSignoffs, acceptedSignoff, liveEvidence, liveSnagSubmission, isEvidenceResubmission,
    reviewSignoff, reviewQuotes,
    // Narrow cast: the page only dereferences latestSnag behind guards (snagFixApproved /
    // snagAwaitingApproval / `?.`) that imply the snag row exists; it can be null at runtime.
    latestSnag: latestSnag as SnagSel & { scheduled_at: string },
    snagScheduledAt, snagAwaitingApproval, snagFixApproved, snagScheduleActive, declinedSnag,
    supplierList, motivSupplierList, motivAccess, declinedSupplierIds, engagedSupplierIds, nameById,
    quotePanelRows, requestedRows,
    isTerminal, awarded, canReQuote, canAssign, canCancel, canEdit, canAssignSupplier, rmInfoAdded,
    supplierUpdates, newSupplierUpdates, photoGroups, timelineItems,
    archivedGroups, documentLinks, quotesTabList, acceptedQuoteIds, pendingVariation,
    variations: variations ?? [],
  }
}
