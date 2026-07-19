// ============================================================
// MOTIV — Supplier ticket-detail data loader (server-only).
// Extracted from app/supplier/tickets/[id]/page.tsx so the page is mostly JSX.
// Runs the auth gate, fetches every row the detail page renders, signs private
// URLs, and computes the derived flags / maps / next-action the JSX consumes.
// Returns a discriminated result — the page handles redirect(); the guard's own
// auth redirects (to /auth/login) still throw from inside requireSupplierV3.
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { signedUrl, signManyUrls } from '@/lib/storage'
import { requireSupplierV3 } from '@/lib/health/guard'
import { chatUnreadCounts } from '@/lib/chat-unread'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { buildTicketTimeline } from '@/lib/ticket-timeline'
import { supplierStatusMeta, storeLabel } from '@/lib/utils'
import type { QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import type { Database } from '@/lib/database.types'

// Newer per-dispute columns fetched by the second ticket_disputes query below.
// supplier_id = the org that raised the dispute (drives cross-supplier isolation).
type DisputeExtra = Pick<Database['public']['Tables']['ticket_disputes']['Row'], 'id' | 'signoff_id' | 'pending_outcome' | 'pending_by' | 'supplier_id'>

// Shown when the RM declined a quote without typing a reason.
const DEFAULT_DECLINE_REASON = 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'

export type SupplierTicketDetailResult = Awaited<ReturnType<typeof loadSupplierTicketDetail>>

export async function loadSupplierTicketDetail(ticketId: string) {
  // Overlap the auth gate with the ticket fetch (admin client needs no user ctx)
  // — one round-trip wave instead of two on every detail-page load.
  const admin = createAdminClient()
  const [{ supplierIds, userId }, { data: t }] = await Promise.all([
    requireSupplierV3(),
    admin.from('tickets').select('*').eq('id', ticketId).single(),
  ])
  // Access is by ASSIGNMENT, not company (a Motiv/pool supplier works client tickets
  // they don't belong to). The awarded/invite check below is the real gate.
  if (!t) return { kind: 'redirect' as const, to: '/supplier/tickets' }
  const [{ data: store }, { data: updates }, { data: invite }, { data: myQuotes }, { data: technicianRows }, { data: signoffRows }, { data: snagRows }, { data: companyRow }, { data: variationRows }, { data: viewRows }, { data: declineRows }, { data: requoteRows }, { data: roundRows }, { data: disputeRows }, { data: disputeMsgRows }, { data: snagEventRows }, { data: disputeExtra }, { data: ticketEdits }] = await Promise.all([
    admin.from('stores').select('name, sub_store, branch_code').eq('id', t.store_id ?? '').single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, responded_at, declined_by, requote_requested_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, decline_reason, created_at, updated_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('technicians').select('id, name').in('supplier_id', supplierIds).eq('active', true).order('name'),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('snags').select('description, required_correction, severity, status, scheduled_at, schedule_status, assigned_at, schedule_agreed_at, schedule_declined_at, schedule_decline_reason, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('companies').select('name').eq('id', t.company_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
    admin.from('ticket_variations').select('description, amount, warranty, status, reject_reason, reviewed_at, created_at, file_urls').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    // Only THIS supplier's own view events — so their trail shows the photos /
    // attachments they opened, without ever exposing another supplier's activity.
    admin.from('ticket_views').select('viewer_role, item_type, item_label, first_viewed_at').eq('ticket_id', t.id).eq('viewer_id', userId),
    // This supplier's OWN durable request-declines — kept even after the RM
    // re-assigns them (which resets the ticket_suppliers row), so the history block
    // survives across re-quote rounds.
    admin.from('ticket_supplier_declines').select('reason, declined_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('declined_at', { ascending: true }),
    // This supplier's OWN re-quote requests (RM asked them to re-quote) — durable per
    // round, so every re-quote stays logged on their trail across re-assignments.
    // Every quote-request round on the ticket. The INITIAL request has supplier_id
    // NULL (applies to all invited); re-quotes are attributed to a supplier. Load
    // both the NULL initial and this supplier's rounds so the trail shows each one.
    admin.from('ticket_quote_requests').select('supplier_id, requested_at').eq('ticket_id', t.id).order('requested_at', { ascending: true }),
    // Durable COC/POC review-round log — drives the "Submission #N" number + sent-back
    // reason on the archived round cards (falls back to the signoff row if unmigrated).
    admin.from('signoff_rounds').select('signoff_id, round_no, kind, reason').eq('ticket_id', t.id),
    // Snag / evidence disputes on this ticket + their message threads (chronological).
    admin.from('ticket_disputes').select('id, origin, status, outcome, resolution_note, created_at, resolved_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    admin.from('ticket_dispute_messages').select('id, dispute_id, author_role, body, evidence_urls, created_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    // Durable snag-fix schedule rounds → every proposal / approval / decline on the trail.
    admin.from('snag_schedule_events').select('kind, scheduled_for, reason, created_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
    // Newer per-dispute columns (signoff link + pending proposal + raising org)
    // fetched separately so the dispute block still works if those columns aren't
    // migrated yet (query fails → null).
    admin.from('ticket_disputes').select('id, signoff_id, pending_outcome, pending_by, supplier_id').eq('ticket_id', t.id),
    // Durable per-edit log → one "Ticket edited"/"Extra work added" timeline event
    // per edit (the single-slot edited_at/edit_note columns remain the fallback).
    admin.from('ticket_edits').select('editor_id, editor_role, note, created_at').eq('ticket_id', t.id).order('created_at', { ascending: true }),
  ])
  // Private-bucket signing: rewrite every stored ticket-photo / COC / attachment /
  // evidence URL to a short-lived signed URL in place, so all the render sites below
  // (ticket photos, signoff cards, quotes, variations, disputes) get readable links.
  if (Array.isArray(t.photo_urls)) t.photo_urls = await signManyUrls(t.photo_urls)
  await Promise.all([
    ...(signoffRows ?? []).map(async s => {
      if (Array.isArray(s.before_urls)) s.before_urls = await signManyUrls(s.before_urls)
      if (Array.isArray(s.after_urls)) s.after_urls = await signManyUrls(s.after_urls)
      s.coc_url = await signedUrl(s.coc_url)
      s.invoice_url = await signedUrl(s.invoice_url)
    }),
    ...(myQuotes ?? []).map(async q => { q.file_url = await signedUrl(q.file_url) }),
    ...(variationRows ?? []).map(async v => { if (Array.isArray(v.file_urls)) v.file_urls = await signManyUrls(v.file_urls) }),
    // evidence_urls is a Json column that always stores a string[] of URLs.
    ...(disputeMsgRows ?? []).map(async m => { if (Array.isArray(m.evidence_urls)) m.evidence_urls = await signManyUrls(m.evidence_urls as string[]) }),
  ])
  // Client organisation that owns the store (shown in the ticket detail).
  const companyName = companyRow?.name ?? null
  // This supplier's own trade-company name — used in the "declined by …" block.
  const myInviteSupplierId = invite?.supplier_id ?? null
  const supplierCompanyName = myInviteSupplierId
    ? ((await admin.from('suppliers').select('company_name').eq('id', myInviteSupplierId).maybeSingle()).data?.company_name ?? null)
    : null
  // When this supplier was requested to quote (their invite, else the ticket's request time).
  const quoteRequestedAt = invite?.invited_at ?? t.quote_requested_at ?? null
  // Latest completion the supplier submitted (COC + proof-of-completion photos).
  // Most recent snag — explains why a completion was rejected / sent back.
  const latestSnag = (snagRows ?? [])[0] ?? null
  const snagScheduledAt = (snagRows ?? []).find(s => s.scheduled_at)?.scheduled_at ?? null
  // Snag-fix callout shows ONLY once the RM has approved the date (then it replaces the
  // original Scheduled callout). The original visit is hidden while any snag schedule is
  // in play (proposed or agreed). Latest declined schedule feeds the audit trail + Archive.
  const snagFixApproved = !!latestSnag?.scheduled_at && latestSnag.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(latestSnag.status)
  const snagScheduleActive = !!latestSnag?.scheduled_at && ['proposed', 'agreed'].includes(latestSnag.schedule_status ?? '') && ['assigned', 'in_progress'].includes(latestSnag.status)
  // Predicate narrows schedule_declined_at to string — the render site formats it directly.
  type SnagRow = NonNullable<typeof snagRows>[number]
  const declinedSnag = (snagRows ?? []).find((s): s is SnagRow & { schedule_declined_at: string } => !!s.schedule_declined_at) ?? null
  const technicians = technicianRows ?? []
  // Access: the awarded supplier OR a supplier invited to quote (competitive model).
  const awarded = !!t.supplier_id && supplierIds.includes(t.supplier_id)
  // Per-ticket RM↔supplier chat is available to the awarded supplier's users. The
  // count feeds the floating chat button's badge; the boolean the header icon's dot.
  const chatUnreadCount = awarded ? ((await chatUnreadCounts(admin, userId, [t.id]))[t.id] ?? 0) : 0
  const chatUnread = chatUnreadCount > 0
  if (!awarded && !invite) return { kind: 'redirect' as const, to: '/supplier/tickets' }
  // Declined off the ticket (not re-invited) — show "Declined" to the supplier.
  const declinedForMe = !awarded && !!invite && ['declined', 'closed'].includes(invite.status)
  const storeName = storeLabel(store?.name, store?.sub_store)
  // "Store · Branch" label shown on the raise-dispute pop-up's subject card.
  const disputeStore = [storeName, store?.branch_code].filter(Boolean).join(' · ') || null
  // Editor display names — one batched lookup covers the single-slot edited_by
  // fallback and every distinct editor in the durable ticket_edits log.
  const editorIds = [...new Set([t.edited_by, ...(ticketEdits ?? []).map(r => r.editor_id)].filter((x): x is string => !!x))]
  const editorProfiles = editorIds.length ? ((await admin.from('user_profiles').select('id, full_name').in('id', editorIds)).data ?? []) : []
  const editorNameById = new Map(editorProfiles.map(p => [p.id, p.full_name ?? null]))
  const editorName = t.edited_by ? (editorNameById.get(t.edited_by) ?? null) : null
  // Durable per-edit events for the timeline (note 'added extra work' gets its own
  // wording there, so the supplier sees every scope change on the ticket).
  const ticketEditEvents = (ticketEdits ?? []).map(r => ({ at: r.created_at, note: r.note, byName: r.editor_id ? (editorNameById.get(r.editor_id) ?? null) : null, byRole: r.editor_role }))
  // Standalone Individual (home) job — no company/store. Load the customer's name +
  // contact so the supplier can arrange the home visit.
  const customer = (!t.company_id && t.created_by)
    ? (await admin.from('user_profiles').select('full_name, phone, address').eq('id', t.created_by).maybeSingle()).data
    : null

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Shared detail bundle for the "Decline quote request" pop-up.
  const declineDetails = { jobRef: t.job_ref, title: t.category ?? t.title, storeName: store?.name ?? null, dueAt }
  // Supplier-side SLA breach + the pending action that ran past its deadline.
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && sla.supplierBreached

  // Their latest submitted quote (if any) for this ticket.
  const latestQuote = (myQuotes ?? [])[0] ?? null
  // The scheduled visit shows neatly inside the accepted quote (below) and as the
  // indigo callout in the ticket detail; the technician name rides along with it.
  const scheduledTechName = t.technician_id ? (technicians.find(x => x.id === t.technician_id)?.name ?? null) : null
  // A quote can be (re)submitted while the ticket is in a quote-requesting state
  // (covers both the competitive 'assigned' invite and the legacy 'quote_requested'
  // path) and the invitation isn't closed. Once submitted the ticket moves to
  // 'quoted' and the quote is shown read-only — re-submission only on a revision.
  const revisionRequested = t.status === 'quote_revision'
  // Pre-award commercial phase where an invited supplier may still quote. 'quoted' is
  // included so a supplier can quote even after ANOTHER supplier has already quoted
  // (the global ticket flips to 'quoted' on the first quote) — they're independent.
  const quoteableStatus = ['assigned', 'assessment', 'quote_requested', 'quote_revision', 'quoted'].includes(t.status)
  const inviteOpen = !invite || !['declined', 'closed', 'awarded'].includes(invite.status)
  // Allow a fresh quote, a revision, or a re-quote after the RM declined-to-requote.
  const canSubmitQuote = quoteableStatus && inviteOpen && (!latestQuote || revisionRequested || latestQuote.status === 'declined')
  const declineReason = invite?.decline_reason ?? null
  // declined_by is a plain text column holding one of these two role strings.
  const declinedBy = (invite?.declined_by ?? null) as 'supplier' | 'regional_manager' | null
  // Who declined → shown in the "Quote request declined by …" block title. The
  // client's manager declining shows as "the client" from the supplier's side.
  const declinedByLabel = declinedBy === 'supplier'
    ? (supplierCompanyName ? ` by ${supplierCompanyName}` : ' by you')
    : declinedBy === 'regional_manager' ? ' by the client' : ''
  // Show the actual decline reason (the RM's reason for a declined quote, or the
  // supplier's own reason if they declined the request), falling back to the
  // courteous "not selected" message when no reason was captured.
  const declineMessage = declineReason || DEFAULT_DECLINE_REASON
  // This supplier's OWN view of the status — never leak another supplier's progress
  // (e.g. the ticket reading "Quoted" because a different supplier quoted). Awarded →
  // the real status; their own quote in → "Quoted"; nothing submitted → "Quote requested".
  const supplierStatus = awarded ? t.status : (latestQuote?.status === 'pending' ? 'quoted' : 'quote_requested')
  // The RM asked this supplier to (re-)submit a quote — either a soft decline of their
  // quote, or a re-assign after they'd previously declined (requote_requested_at).
  const reQuoteByRm = !!invite?.requote_requested_at && invite?.status === 'invited'
  // Map a quote's DB status to the read-only summary tone (accepted shows "Approved").
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'
  // Active quotes stay in the Quotes block; declined ones (by the RM or the supplier)
  // move to a collapsed "Archived quotes" block below.
  const myQuoteRows = myQuotes ?? []
  const activeQuotes = myQuoteRows.filter(q => q.status !== 'declined')
  const declinedMyQuotes = myQuoteRows.filter(q => q.status === 'declined')
  // Reason the RM declined the previous quote — shown on the re-quote prompt.
  const requoteReason = declinedMyQuotes[0]?.decline_reason ?? declineReason
  // The Quotes block is open through quoting / scheduling, then collapses once the
  // job is marked in progress (and every stage after). A phase-specific id + key
  // forces the collapse on the transition even though the section otherwise
  // remembers its open state across a refresh.
  const quotesLivePhase = ['assigned', 'assessment', 'quote_requested', 'quote_revision', 'quoted', 'accepted', 'scheduled'].includes(t.status)
  // Durable audit events for THIS supplier: every request-decline (survives re-invite)
  // and every quote-request round. RM quote-declines already come from the quote rows.
  const myDeclines = (declineRows ?? []).map(d => ({ name: supplierCompanyName ?? 'you', at: d.declined_at })).filter(d => d.at)
  // Each quote-request round shown once as "Quote requested". Rounds attributed to
  // this supplier are theirs; unattributed (legacy NULL) rounds only count as the
  // INITIAL invite (the earliest one) — later NULL rounds were re-assigns of OTHER
  // suppliers and must not show a spurious "Quote requested" on this supplier's trail.
  const allRequestRows = requoteRows ?? []
  const earliestRequestAt = allRequestRows.reduce<string | null>((m, r) => (r.requested_at && (!m || r.requested_at < m) ? r.requested_at : m), null)
  const myQuoteRequests = allRequestRows
    .filter(r => (r.supplier_id !== null && supplierIds.includes(r.supplier_id)) || (r.supplier_id === null && r.requested_at === earliestRequestAt))
    .map(r => r.requested_at).filter(Boolean)
  // Trail starts at this supplier's EARLIEST involvement (first request / quote /
  // decline) — a re-invite resets invited_at to "now", so anchoring to it would hide
  // durable events from earlier rounds; the first quote request is the true start.
  const trailStartMs = [invite?.invited_at, ...myDeclines.map(d => d.at), ...myQuoteRequests, ...myQuoteRows.map(q => q.created_at)]
    .filter(Boolean).map(x => +new Date(x as string)).sort((a, b) => a - b)[0]
  const trailStartAt = trailStartMs ? new Date(trailStartMs).toISOString() : (invite?.invited_at ?? t.quote_requested_at)

  // COC/POC submissions split across blocks by state: under review → COC & POC,
  // rejected/snagged → Snag (kept for traceability), accepted → Completion.
  const allSignoffs = signoffRows ?? []
  const pendingSignoffs = allSignoffs.filter(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status))
  const rejectedSignoffs = allSignoffs.filter(s => s.status === 'rejected')
  const evidenceRequestedSignoffs = allSignoffs.filter(s => s.status === 'evidence_requested')
  const acceptedSignoff = allSignoffs.find(s => s.status === 'accepted') ?? null
  // Stable "Submission #N" numbers, oldest = #1. Superseded submissions (sent back for
  // more evidence OR snagged) move to the Archived block as collapsed round cards, so
  // the full history is kept — mirroring the RM page. The live under-review one stays
  // in COC & POC; the approved one in Completion.
  const submissionNo = new Map<string, number>()
  ;[...allSignoffs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).forEach((s, i) => submissionNo.set(s.id, i + 1))
  const supersededSubmissions = [...evidenceRequestedSignoffs, ...rejectedSignoffs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  const roundBySignoff = new Map<string, { round_no: number; kind: string; reason: string | null }>()
  for (const r of (roundRows ?? [])) if (r.signoff_id) roundBySignoff.set(r.signoff_id, { round_no: r.round_no, kind: r.kind, reason: r.reason ?? null })
  const submissionLabel = (s: { id: string }) => `Submission #${roundBySignoff.get(s.id)?.round_no ?? submissionNo.get(s.id) ?? '?'}`
  // While the ticket is actively snagged, the latest snagged submission is the LIVE
  // snag — shown in its own block above Quotes so the supplier sees what to fix. Older
  // superseded rounds (and the snag once resubmitted) stay in the Archived block.
  const liveSnag = ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? (rejectedSignoffs[0] ?? null) : null
  // An outstanding "more evidence" request stays in the Completion tab (not History)
  // until the supplier re-submits — then it's superseded and moves to the Archive.
  const liveEvidence = t.status === 'evidence_requested' ? (evidenceRequestedSignoffs[0] ?? null) : null
  const archivedSuperseded = supersededSubmissions.filter(s => s.id !== liveSnag?.id && s.id !== liveEvidence?.id)

  // Variation orders raised on this ticket (drives the scheduled-phase VO gate and
  // the "no more variation orders" label). The most recent decline reason feeds the
  // vo_declined banner.
  const variations = variationRows ?? []
  const variationCount = variations.length
  const latestVoRejectReason = variations.find(v => v.status === 'rejected')?.reject_reason ?? null

  // Decline the work — offered before award only (invite still invited/quoted).
  const canDecline = !awarded && !declinedForMe && !!invite && ['invited', 'quoted'].includes(invite.status)

  // Snag / evidence disputes. While one is OPEN the snag/evidence step is paused;
  // resolved ones live in the Archive. Messages are grouped by their dispute.
  const disputeExtraById = new Map((disputeExtra ?? []).map((x): [string, DisputeExtra] => [x.id, x]))
  // Cross-supplier isolation: only THIS org's disputes — theirs by supplier_id
  // (e.g. a quote-decline dispute raised while declined off the ticket), or legacy
  // null-supplier_id rows when they are the awarded org. Several competing orgs on
  // one ticket must never see each other's disputes or threads.
  const disputes = (disputeRows ?? [])
    .map(d => ({ ...d, ...disputeExtraById.get(d.id) }))
    .filter(d => d.supplier_id ? supplierIds.includes(d.supplier_id) : awarded)
  const myDisputeIds = new Set(disputes.map(d => d.id))
  const disputeMsgs = (disputeMsgRows ?? []).filter(m => myDisputeIds.has(m.dispute_id))
  // evidence_urls is a Json column that always stores a string[] of URLs.
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id).map(m => ({ ...m, evidence_urls: Array.isArray(m.evidence_urls) ? m.evidence_urls as string[] : [] }))
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')
  // What each dispute is about — the disputed "Submission #N" + snag / evidence request.
  const disputeSubject = (d: { origin: string; signoff_id?: string | null }) => {
    if (d.origin === 'variation') return 'Variation order · declined'
    if (d.origin === 'quote_declined') return 'Quote declined'
    const n = d.signoff_id ? submissionNo.get(d.signoff_id) : null
    const what = d.origin === 'snag' ? 'snag' : 'evidence request'
    return n ? `Submission #${n} · ${what}` : what
  }

  // The supplier's single most important pending step — the "Next action" signpost
  // that mirrors the RM/SM ticket. The real controls live in the forms/callouts
  // below; this just tells the supplier (or reassures them) what's next. `act` =
  // needs the supplier, `wait` = waiting on the client, `done`/`closed` = finished.
  // Where a standing coloured callout below already states the situation, the
  // signpost line is left blank so it isn't said twice.
  const nextAction: { mode: 'act' | 'wait' | 'done' | 'closed'; msg: string; sub: string } = (() => {
    if (t.status === 'completed') return { mode: 'done', msg: 'Job complete', sub: 'The completion certificate and proof of completion have been approved and signed off. No further action is needed.' }
    if (t.status === 'cancelled' || t.status === 'declined') return { mode: 'closed', msg: `Ticket ${t.status}`, sub: t.cancellation_reason || 'No further action needed.' }
    // Commercial phase — a quote can be (re)submitted with the form below. The
    // RM-requested re-quote case has its own standing callout stating the reason.
    if (canSubmitQuote) return { mode: 'act', msg: 'Submit a quote', sub: reQuoteByRm ? '' : 'Review the job and send the client your quote below.' }
    // Quote submitted, still competing — the standing amber "under review" callout
    // below carries the message, so the signpost line is blank.
    if (!awarded && latestQuote?.status === 'pending') return { mode: 'wait', msg: '', sub: '' }
    // From here the supplier is awarded the job. An open dispute pauses the snag /
    // evidence step — the standing red callout below states it, so the signpost is blank.
    if (awarded && openDispute) return { mode: 'wait', msg: '', sub: '' }
    if (awarded && (t.status === 'accepted' || t.status === 'scheduled')) return { mode: 'act', msg: 'Mark the job in progress', sub: 'Your quote was approved — start the job and mark it in progress below.' }
    if (awarded && t.status === 'snag') return { mode: 'act', msg: 'Accept and schedule the snag fix', sub: 'The completion was snagged — accept the snag and propose a date to carry out the corrective work.' }
    if (awarded && t.status === 'snag_assigned') return latestSnag?.schedule_status === 'agreed'
      ? { mode: 'act', msg: 'Start the snag fix', sub: 'The snag-fix date is approved — start the corrective work below.' }
      : { mode: 'wait', msg: '', sub: '' }
    if (awarded && t.status === 'evidence_requested') return { mode: 'act', msg: 'Add the requested evidence', sub: '' }
    if (awarded && ['in_progress', 'snag_in_progress', 'snag_resolved'].includes(t.status)) return { mode: 'act', msg: 'Upload the COC & POC', sub: 'Once the work is done, upload the certificate of completion and proof-of-completion photos below.' }
    if (awarded && t.status === 'submitted_for_signoff') return { mode: 'wait', msg: '', sub: '' }
    if (awarded && t.status === 'variation_review') return { mode: 'wait', msg: '', sub: '' }
    if (awarded && (t.status === 'approved_closeout' || t.status === 'vo_declined')) return { mode: 'act', msg: 'Raise any variation orders', sub: 'Your COC & POC were approved — raise a variation order for any extra work, or confirm there are none so the manager can close out.' }
    return { mode: 'wait', msg: supplierStatusMeta(supplierStatus).label, sub: 'No action needed from you right now.' }
  })()

  // ── Lower tabbed section (mirrors the RM ticket detail). Data the tab JSX consumes. ──
  const totalPhotos = Array.isArray(t.photo_urls) ? t.photo_urls.length : 0
  // Quotes tab: active quotes (pending / approved). While the supplier is still
  // (re-)quoting, also show the declined quote(s) with the reason; once a quote is
  // approved or the request closes, declined quotes move to History instead.
  const quoteTabRows = canSubmitQuote ? [...activeQuotes, ...declinedMyQuotes] : activeQuotes
  const historyDeclinedQuotes = canSubmitQuote ? [] : declinedMyQuotes

  // Full life-of-ticket timeline — same shared layout as the RM detail (dot +
  // connecting line, friendly SM-style voice). Built from the same audit inputs
  // that used to feed AuditTrail.
  const supplierTimelineInput = !awarded
    ? {
        createdAt: t.created_at, startAt: trailStartAt,
        quoteRequestedAt: invite?.invited_at ?? t.quote_requested_at,
        quoteRequests: myQuoteRequests.map(at => ({ at })),
        requoteRequestedAt: invite?.requote_requested_at ?? null,
        quoteSubmittedAt: latestQuote?.created_at ?? null,
        editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, edits: ticketEditEvents,
        infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
        quotes: myQuotes ?? [], supplierDeclines: myDeclines, views: viewRows ?? [],
        supplierDeclinedAt: declinedForMe ? (invite?.responded_at ?? latestQuote?.updated_at ?? t.updated_at) : null,
      }
    : {
        createdAt: t.created_at, status: t.status, updatedAt: t.updated_at, startAt: trailStartAt,
        quoteRequestedAt: t.quote_requested_at, quoteRequests: myQuoteRequests.map(at => ({ at })),
        requoteRequestedAt: invite?.requote_requested_at ?? null,
        quoteSubmittedAt: latestQuote?.created_at ?? t.quote_submitted_at,
        quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
        scheduledAt: t.scheduled_at, completedAt: t.completed_at,
        infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
        editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, edits: ticketEditEvents, cancellationReason: t.cancellation_reason,
        snagScheduledAt, workStartedAt: t.attended_at ?? null,
        snagAcceptedAt: latestSnag?.assigned_at ?? null, snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
        snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
        snagScheduleEvents: snagEventRows ?? [],
        quotes: myQuotes ?? [], variations: variationRows ?? [],
        disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
        disputeMessages: disputeMsgs.map(m => ({ author_role: m.author_role, body: m.body, created_at: m.created_at })),
        supplierDeclines: myDeclines, signoffs: signoffRows ?? [],
        updates: (updates ?? []).map(u => ({ body: u.body ?? '', author_role: u.author_role, created_at: u.created_at })),
        views: viewRows ?? [],
      }
  // Default (neutral) labels + actor — the RM-voice rmFriendlyLabel says "You
  // requested quotes", which is wrong from the supplier's side (the client/RM
  // requested them). The default labels read "Quote requested" with the actor.
  const timelineItems = buildTicketTimeline(supplierTimelineInput)

  const data = {
    t, store, storeName, disputeStore, companyName, supplierCompanyName, customer, editorName, quoteRequestedAt,
    latestSnag, snagFixApproved, snagScheduleActive, declinedSnag, scheduledTechName,
    awarded, chatUnread, chatUnreadCount, declinedForMe, dueAt, overdue, declineDetails, sla, breached, now,
    latestQuote, canSubmitQuote, declineReason, declinedBy, declinedByLabel, declineMessage, supplierStatus, reQuoteByRm,
    quoteStatusOf, requoteReason,
    pendingSignoffs, rejectedSignoffs, acceptedSignoff, submissionLabel, roundBySignoff, liveSnag, liveEvidence, archivedSuperseded,
    variations, variationCount, latestVoRejectReason, canDecline,
    disputes, msgsByDispute, openDispute, resolvedDisputes, disputeSubject,
    nextAction, timelineItems,
    totalPhotos, quoteTabRows, historyDeclinedQuotes, updates: updates ?? [], declineRows: declineRows ?? [],
  }
  return { kind: 'ok' as const, data }
}
