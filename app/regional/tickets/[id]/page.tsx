export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { CheckCircle2, FileText, Calendar, CalendarClock, Clock, MessageSquare, Camera } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { signedUrl } from '@/lib/storage'
import { requireRegionalV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { BreachReason } from '@/components/workflow/BreachReason'
import { QuoteSummary } from '@/components/workflow/QuoteSummary'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { RmQuotePanel, RmReviewPanel, ReQuoteButton, AcceptScheduleCard, AcceptSnagScheduleCard, VariationReviewCard, CloseOutButton, RmTicketActionBar, RmCompletionReview } from '@/components/regional/RmTicketActions'
import { CompletionBody } from '@/components/workflow/CompletionBody'
import { EditedLine } from '@/components/ui/EditedLine'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { RmTicketTabs } from '@/components/regional/RmTicketTabs'
import { buildTicketTimeline, rmFriendlyLabel } from '@/lib/ticket-timeline'
import { priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import type { StoreManagerTicket } from '@/lib/health/data'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { MarkTicketSeen } from '@/components/ui/MarkTicketSeen'
import { DisputeThread } from '@/components/dispute/DisputeBox'
import { formatCurrency, formatDateTime, formatDate, rmStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS, humanizeDuration } from '@/lib/utils'

// Professional "what we're waiting on" copy while a snag works its way through.
const SNAG_WAIT_MSG: Record<string, string> = {
  snag: 'This completion has been snagged. Awaiting the supplier to accept the snag and propose a date to carry out the corrective work.',
  snag_assigned: 'The snag schedule is approved. The supplier will carry out the corrective work on the agreed date and resubmit the completion for sign-off.',
  snag_in_progress: 'The supplier is carrying out the corrective work and will resubmit the completion for sign-off.',
  snag_resolved: 'The snag has been resolved. Awaiting the resubmitted completion for sign-off.',
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

// A declined-quote card (RM- or supplier-declined) — click to expand. Used both in
// the Quotes block (live declines, with the "Ask to re-quote" action) and the Archive
// (superseded declines).
function RmDeclinedQuoteCard({ q, ticketId, canReQuote, open = false }: { q: any; ticketId: string; canReQuote: boolean; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
      <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
        <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{q.supplierName}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-[var(--text)] tabular-nums">{formatCurrency(q.amount)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5">Declined</span>
        </span>
      </summary>
      <div className="border-t border-[var(--border)] p-4 space-y-3">
        {q.declineReason && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
            <p className="text-sm text-[var(--text)]">{q.declineReason}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Excl. VAT" value={formatCurrency(q.amount)} />
          <DetailItem label="Incl. VAT" value={q.amountInclVat ? formatCurrency(q.amountInclVat) : '—'} />
          <DetailItem label="Received" value={formatDateTime(q.createdAt)} />
          <DetailItem label="Declined" value={q.declinedAt ? formatDateTime(q.declinedAt) : '—'} />
        </div>
        {q.description && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>
          </div>
        )}
        {/* Last row: the attachment link on the left, the "Ask to re-quote" button
            inline on the right (only while the ticket is live and un-awarded). */}
        {(q.fileUrl || canReQuote) && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {q.fileUrl
              ? <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View attached quote</a>
              : <span />}
            {canReQuote && <ReQuoteButton ticketId={ticketId} quoteId={q.id} />}
          </div>
        )}
      </div>
    </details>
  )
}

// One COC/POC submission card — reused across the under-review, sent-back (snag)
// and approved blocks so the RM sees the full submission history. A sent-back card
// shows the reason it was returned (why another COC/POC was needed).
function RmSignoffCard({ s, tone, ticketId, collapsible = false, defaultOpen = false, title, reason, freshEvidence = false }: { s: any; tone: 'review' | 'snag' | 'approved' | 'evidence'; ticketId: string; collapsible?: boolean; defaultOpen?: boolean; title?: string; reason?: string | null; freshEvidence?: boolean }) {
  // Prefer the durable round reason; fall back to the reason stored on the signoff.
  const reasonText = reason ?? s.reject_reason
  const meta = tone === 'approved'
    ? { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'Approved', Icon: CheckCircle2, iconCls: 'text-emerald-500', title: 'Approved completion' }
    : tone === 'snag'
    ? { ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Sent back', Icon: FileText, iconCls: 'text-red-500', title: 'Snagged completion' }
    : tone === 'evidence'
    ? { ring: 'ring-amber-500/40', bg: 'bg-amber-500/5', head: 'bg-amber-500/10 border-amber-500/20', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'More info requested', Icon: FileText, iconCls: 'text-amber-500', title: 'Sent back for more evidence' }
    : { ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]', label: 'Under review', Icon: FileText, iconCls: 'text-[#C6A35D]', title: 'Submitted completion' }
  const before = (s.before_urls ?? []) as string[]
  const after = (s.after_urls ?? []) as string[]
  // Header doubles as the click-to-expand summary when collapsible.
  const header = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><meta.Icon size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">{title ?? meta.title} · {formatDateTime(s.created_at)}</span></span>
      <span className="flex items-center gap-1.5 shrink-0">
        {freshEvidence && <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">New evidence</span>}
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.badge}`}>{meta.label}</span>
      </span>
    </>
  )
  const body = (
    <>
        {tone === 'snag' && reasonText && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
            <p className="text-sm text-[var(--text)]">{reasonText}</p>
          </div>
        )}
        {tone === 'evidence' && reasonText && (
          <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Why more evidence was requested</p>
            <p className="text-sm text-[var(--text)]">{reasonText}</p>
          </div>
        )}
        {/* Resubmission after a "more evidence" request — the new after photos, COC
            and notes are highlighted in green so the RM can spot what's new. */}
        {freshEvidence && (
          <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">New evidence submitted</p>
            <p className="text-sm text-[var(--text)]">The supplier uploaded the additional evidence you requested — the new after photos, COC and notes are shown in green below.</p>
          </div>
        )}
        <CompletionBody ticketId={ticketId} beforeUrls={before} afterUrls={after} cocUrl={s.coc_url} invoiceUrl={s.invoice_url} notes={s.notes} uploadedAt={s.created_at} />
    </>
  )
  if (collapsible) {
    return (
      <details open={defaultOpen} className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
        <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">{header}</summary>
        <div className={`p-4 space-y-3 border-t ${meta.head}`}>{body}</div>
      </details>
    )
  }
  return (
    <div className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${meta.head}`}>{header}</div>
      <div className="p-4 space-y-3">{body}</div>
    </div>
  )
}

// A labelled sub-group inside the Archive — a small uppercase heading over its
// cards so mixed archived items (quotes, requests, submissions…) stay separated
// and scannable without cluttering the section.
function ArchiveGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      {children}
    </div>
  )
}

// One supplier progress update — a free-text note, or a "📷 Progress photo: <url>"
// which renders as a photo link. Shared by the new-updates block (top) and the
// collapsible history (above the audit trail); `isNew` gives it the gold accent.
function SupplierUpdateItem({ u, ticketId, isNew = false }: { u: { body: string; created_at: string }; ticketId: string; isNew?: boolean }) {
  const photo = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/)
  return (
    <li className={`rounded-xl ring-1 p-3 bg-[var(--surface)] ${isNew ? 'ring-[#C6A35D]/40' : 'ring-[var(--border)]'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
          Supplier
          {isNew && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-[#C6A35D] bg-[#C6A35D]/15 rounded-full px-1.5 py-0.5">New</span>}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</span>
      </div>
      {photo
        ? <ViewTrackedLink ticketId={ticketId} itemType="photo" itemLabel="Supplier progress photo" href={photo[1]} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><Camera size={14} /> View progress photo</ViewTrackedLink>
        : <p className="text-sm text-[var(--text)] whitespace-pre-line">{u.body}</p>}
    </li>
  )
}

export default async function RegionalTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Overlap the auth gate with the ticket fetch (admin client needs no user ctx)
  // — one round-trip wave instead of two on every detail-page load.
  const admin = createAdminClient()
  const [{ companyId, regionIds, userId }, { data: t }] = await Promise.all([
    requireRegionalV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
  ])
  if (!t) redirect('/regional/tickets')
  // Authorise by the ticket's STORE being in one of the RM's regions (the durable
  // store→region link) rather than the denormalised tickets.region_id — so a ticket
  // logged before its store was linked to the region (region_id still null/stale)
  // still opens for the RM instead of bouncing back to the list.
  const { data: store } = await admin.from('stores').select('name, sub_store, region_id, company_id').eq('id', t.store_id ?? '').maybeSingle()
  if (!store || store.company_id !== companyId || !store.region_id || !regionIds.includes(store.region_id)) redirect('/regional/tickets')

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
  const signList = async (list: any): Promise<string[]> =>
    Array.isArray(list) ? (await Promise.all(list.map(signOne))).filter((x): x is string => !!x) : list
  if (Array.isArray(t.photo_urls)) t.photo_urls = await signList(t.photo_urls)
  await Promise.all([
    ...((signoffs ?? []) as any[]).map(async s => {
      s.before_urls = await signList(s.before_urls)
      s.after_urls = await signList(s.after_urls)
      s.coc_url = await signOne(s.coc_url)
      s.invoice_url = await signOne(s.invoice_url)
    }),
    ...((quotes ?? []) as any[]).map(async q => { q.file_url = await signOne(q.file_url) }),
    ...((variations ?? []) as any[]).map(async v => { v.file_urls = await signList(v.file_urls) }),
    ...((disputeMsgRows ?? []) as any[]).map(async m => { m.evidence_urls = await signList(m.evidence_urls) }),
    // Supplier progress-photo updates embed the URL in the body ("📷 Progress photo: <url>").
    ...((updates ?? []) as any[]).map(async u => {
      const match = String(u.body).match(/^(📷\s*Progress photo:\s*)(\S+)([\s\S]*)$/)
      if (match) u.body = `${match[1]}${await signOne(match[2])}${match[3]}`
    }),
  ])
  // Full COC/POC history — every submission, split by state (mirrors the supplier
  // view). Each sent-back card carries the reason it was rejected.
  const allSignoffs = (signoffs ?? []) as any[]
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
  const disputeExtraById = new Map(((disputeExtra ?? []) as any[]).map(x => [x.id, x]))
  const disputes = ((disputeRows ?? []) as any[]).map(d => ({ ...d, ...(disputeExtraById.get(d.id) ?? {}) }))
  const disputeMsgs = (disputeMsgRows ?? []) as any[]
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id).map(m => ({ ...m, evidence_urls: Array.isArray(m.evidence_urls) ? m.evidence_urls : [] }))
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')
  // Stable "Submission #N" numbers across live + archived, ordered by when each
  // COC/POC was submitted (oldest = #1). Shown in the card titles.
  const submissionNo = new Map<string, number>()
  ;[...allSignoffs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)).forEach((s, i) => submissionNo.set(s.id, i + 1))
  // Superseded submissions (sent back for more evidence OR snagged) → collapsed round
  // cards in the Archive, newest first. The live under-review one stays in COC & POC;
  // the approved one in Completion.
  const supersededSubmissions = [...evidenceRequestedSignoffs, ...rejectedSignoffs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  // Durable review-round log drives the number / kind / reason on each round card;
  // falls back to the signoff row (submission ordinal + reject_reason + status) for
  // tickets that predate the signoff_rounds table.
  const roundBySignoff = new Map<string, { round_no: number; kind: string; reason: string | null }>()
  for (const r of ((roundRows ?? []) as any[])) if (r.signoff_id) roundBySignoff.set(r.signoff_id, { round_no: r.round_no, kind: r.kind, reason: r.reason ?? null })
  const submissionLabel = (s: any) => `Submission #${roundBySignoff.get(s.id)?.round_no ?? submissionNo.get(s.id) ?? '?'}`
  const submissionTone = (s: any): 'snag' | 'evidence' => (roundBySignoff.get(s.id)?.kind ?? (s.status === 'rejected' ? 'snag' : 'evidence')) === 'snag' ? 'snag' : 'evidence'
  // What each dispute is about — the disputed "Submission #N" + snag / evidence request.
  const disputeSubject = (d: any) => {
    if (d.origin === 'variation') return 'Variation order · declined'
    const n = d.signoff_id ? submissionNo.get(d.signoff_id) : null
    const what = d.origin === 'snag' ? 'snag' : 'evidence request'
    return n ? `Submission #${n} · ${what}` : what
  }
  // The Dispute block (open live thread + resolved read-only history), each labelled
  // with the submission it concerns. Rendered ABOVE the Actions while live, then moved
  // BELOW once resolved (history).
  const disputeBlock = disputes.length > 0 ? (
    <CollapsibleSection id="ticket-dispute" title="Dispute" defaultOpen={!!openDispute}>
      {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="regional_manager" subject={disputeSubject(openDispute)} />}
      {resolvedDisputes.map(d => (
        <details key={d.id} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
          <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] truncate">Dispute — {disputeSubject(d)}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(d.resolved_at ?? d.created_at)}</p>
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${d.outcome === 'withdrawn' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>{d.outcome === 'withdrawn' ? 'Retracted' : 'Withdrawn'}</span>
          </summary>
          <div className="border-t border-[var(--border)] p-4">
            <DisputeThread ticketId={t.id} dispute={d} messages={msgsByDispute(d.id)} viewerRole="regional_manager" readOnly subject={disputeSubject(d)} />
          </div>
        </details>
      ))}
    </CollapsibleSection>
  ) : null
  // Snag scheduling — the supplier's proposed fix date (separate from the original
  // job schedule) and whether it's still awaiting the RM's approval.
  const latestSnag = ((snags ?? []) as any[])[0] ?? null
  const snagScheduledAt = ((snags ?? []) as any[]).find(s => s.scheduled_at)?.scheduled_at ?? null
  const snagAwaitingApproval = t.status === 'snag_assigned' && latestSnag?.schedule_status === 'proposed' && !!latestSnag?.scheduled_at
  // Snag-fix callout in the ticket detail shows ONLY once the RM has approved the date;
  // it then replaces the original "Scheduled" callout. While a snag schedule is in
  // play (proposed or agreed) the original visit callout is hidden (it's stale).
  const snagFixApproved = !!latestSnag?.scheduled_at && latestSnag.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(latestSnag.status)
  const snagScheduleActive = !!latestSnag?.scheduled_at && ['proposed', 'agreed'].includes(latestSnag.schedule_status) && ['assigned', 'in_progress'].includes(latestSnag.status)
  // Most recent declined snag-fix date (for the audit trail + Archive note).
  const declinedSnag = ((snags ?? []) as any[]).find(s => s.schedule_declined_at) ?? null

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
  for (const r of (ratingRows ?? []) as any[]) {
    if (!r.supplier_id) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  const toSupplierCard = (s: any) => {
    const ra = ratingAgg.get(s.id)
    const category = Array.isArray(s.trades) && s.trades.filter(Boolean).length ? s.trades.filter(Boolean).join(', ') : (s.trade ?? null)
    return { id: s.id, name: s.company_name, category, avgRating: ra ? ra.sum / ra.n : 5, ratingCount: ra ? ra.n : 0 }
  }
  const supplierList = (suppliers ?? []).map(toSupplierCard)
  // Motiv-curated suppliers the RM can also invite (shown under a toggle in the pop-up).
  const motivSupplierList = ((motivSuppliers ?? []) as any[]).filter(s => !supplierList.some(m => m.id === s.id)).map(toSupplierCard)
  const nameById = new Map<string, string>([...supplierList, ...motivSupplierList].map(s => [s.id, s.name]))
  for (const inv of (invites ?? []) as any[]) if (inv.suppliers?.company_name) nameById.set(inv.supplier_id, inv.suppliers.company_name)
  const declineReasonBy = new Map<string, string>()
  for (const inv of (invites ?? []) as any[]) if (inv.decline_reason) declineReasonBy.set(inv.supplier_id, inv.decline_reason)
  const supplierRows = ((invites ?? []) as any[]).map(inv => ({ id: inv.supplier_id as string, name: inv.suppliers?.company_name ?? nameById.get(inv.supplier_id) ?? 'Supplier', status: inv.status as string, invitedAt: inv.invited_at ?? null, respondedAt: (inv.responded_at ?? null) as string | null, declineReason: inv.decline_reason ?? null, declinedBy: (inv.declined_by ?? null) as 'supplier' | 'regional_manager' | null }))
  // Suppliers who previously declined/were-declined on this ticket — the assign
  // pop-up warns before re-sending them the quote request.
  const declinedSupplierIds = ((invites ?? []) as any[]).filter(i => ['declined', 'closed'].includes(i.status)).map(i => i.supplier_id)
  const activeSupplierRows = supplierRows.filter(r => !['declined', 'closed'].includes(r.status))
  // Suppliers already engaged on this ticket (awaiting their quote, or already
  // quoted) — the assign pop-up shows them non-selectable so the RM can't re-invite
  // someone they're already waiting on (a no-op).
  const engagedSupplierIds: Record<string, 'invited' | 'quoted'> = {}
  for (const r of activeSupplierRows) if (r.status === 'invited' || r.status === 'quoted') engagedSupplierIds[r.id] = r.status
  // Freshly (re)assigned and awaiting quotes → a clean "new suppliers assigned" note.
  const awaitingSupplierQuotes = ['assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(t.status) && activeSupplierRows.some(r => r.status === 'invited')
  // A quote has been approved → the ticket is awarded and the round is over.
  const awarded = ((quotes ?? []) as any[]).some(q => q.status === 'accepted') || !!t.supplier_id
  // Round boundary = the most recent quote-request round (assign / re-assign). A
  // decline (quote or request) is "live" only if it happened in this current round;
  // everything from earlier rounds moves to the Archive so nothing is ever dropped.
  // Once a quote is awarded the whole thing is over → nothing is live.
  const lastRequestMs = Math.max(0,
    ...((requestRows ?? []) as any[]).map(r => +new Date(r.requested_at)),
    ...supplierRows.map(r => (r.invitedAt ? +new Date(r.invitedAt) : 0)),
    t.quote_requested_at ? +new Date(t.quote_requested_at as string) : 0,
  )
  const isCurrentRound = (at: string | null | undefined) => !awarded && !!at && +new Date(at) >= lastRequestMs
  // Supplier request-declines from the durable log (survive re-invite). Current-round
  // ones show live in the Quotes block; earlier ones go to the Archive.
  const supplierDeclines = ((declineRows ?? []) as any[])
    .map(d => ({ supplierId: d.supplier_id as string, name: nameById.get(d.supplier_id) ?? 'Supplier', reason: (d.reason ?? null) as string | null, at: d.declined_at }))
    .filter(d => d.at)
  // Courteous "not selected" note for the losing suppliers once the job is awarded —
  // matches the supplier-side wording. Shown on auto-declined quotes (no explicit
  // reason) and on still-waiting suppliers that were auto-closed on award.
  const COURTESY_NOTE = 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'
  // Suppliers auto-closed when the job was awarded to someone else, who never
  // submitted a quote (they were still waiting). Losing quoters instead surface as
  // declined quote cards below. 'closed' status only ever happens on award.
  const quotedSupplierIds = new Set(((quotes ?? []) as any[]).map(q => q.supplier_id))
  const closedWaitingRows = supplierRows.filter(r => r.status === 'closed' && !quotedSupplierIds.has(r.id))
  const mapQuote = (q: any) => ({
    id: q.id, supplierId: q.supplier_id as string, supplierName: nameById.get(q.supplier_id) ?? 'Supplier', amount: q.amount,
    amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null,
    // Prefer the durable per-quote reason; fall back to the invite's (mutable) reason,
    // then to the courteous "not selected" note for quotes auto-declined on award.
    validUntil: q.valid_until ?? null, createdAt: q.created_at, declineReason: q.decline_reason ?? declineReasonBy.get(q.supplier_id) ?? (awarded ? COURTESY_NOTE : null),
    proposedScheduleAt: q.proposed_schedule_at ?? null, declinedAt: q.updated_at ?? null,
  })
  const reviewQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'pending').map(mapQuote)
  const acceptedQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'accepted').map(mapQuote)
  const declinedQuotes = ((quotes ?? []) as any[]).filter(q => q.status === 'declined').map(mapQuote)
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
  const quoteBySupplier = new Map<string, { kind: 'received' | 'accepted' | 'declined'; q: any }>()
  for (const q of acceptedQuotes) quoteBySupplier.set(q.supplierId, { kind: 'accepted', q })
  for (const q of reviewQuotes) if (!quoteBySupplier.has(q.supplierId)) quoteBySupplier.set(q.supplierId, { kind: 'received', q })
  for (const q of liveDeclinedQuotes) if (!quoteBySupplier.has(q.supplierId)) quoteBySupplier.set(q.supplierId, { kind: 'declined', q })
  const toPanelQuote = (q: any) => ({ id: q.id, amount: q.amount, amountInclVat: q.amountInclVat ?? null, description: q.description ?? null, fileUrl: q.fileUrl ?? null, createdAt: q.createdAt, validUntil: q.validUntil ?? null, proposedScheduleAt: q.proposedScheduleAt ?? null })
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

  // Which collapsible block opens by default — driven by the current lifecycle
  // phase (newest activity). Snag → Snag; COC/POC under review → COC & POC;
  // closed out → Completion; otherwise the commercial Quotes block.
  const phase: 'snag' | 'coc' | 'completion' | 'commercial' =
    ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? 'snag'
    : ['submitted_for_signoff', 'evidence_requested'].includes(t.status) ? 'coc'
    : ['approved_closeout', 'completed'].includes(t.status) ? 'completion'
    : 'commercial'

  // Supplier progress updates (notes / photos). "New" = posted since THIS RM last
  // OPENED the ticket (the ticket_reads watermark, bumped by MarkTicketSeen on open).
  // New updates surface prominently just below the ticket detail; once seen, on the
  // next open they fold into a collapsible history above the audit trail. The full
  // history is always kept (ticket_updates rows are never deleted).
  const supplierUpdates = ((updates ?? []) as any[]).filter(u => u.author_role === 'supplier')
  const lastSeenMs = (readRow as any)?.last_seen_at ? +new Date((readRow as any).last_seen_at) : 0
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
  if (Array.isArray(t.photo_urls) && t.photo_urls.length) photoGroups.push({ label: 'Logged photos', urls: t.photo_urls as string[] })
  for (const s of [...allSignoffs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
    const n = submissionNo.get(s.id)
    const before = ((s.before_urls ?? []) as string[]).filter(Boolean)
    const after = ((s.after_urls ?? []) as string[]).filter(Boolean)
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
    quoteRequests: ((requestRows ?? []) as any[]).map(r => ({ at: r.requested_at, supplierName: r.supplier_id ? (nameById.get(r.supplier_id) ?? null) : null })),
    quoteSubmittedAt: t.quote_submitted_at,
    quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
    scheduledAt: t.scheduled_at, completedAt: t.completed_at,
    editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, cancellationReason: t.cancellation_reason,
    infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
    snagScheduledAt,
    snagAcceptedAt: latestSnag?.assigned_at ?? null,
    snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
    snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
    snagScheduleEvents: (snagEventRows ?? []) as any[],
    workStartedAt: t.attended_at ?? null,
    quotes: ((quotes ?? []) as any[]).map(q => ({ ...q, supplierName: nameById.get(q.supplier_id) ?? 'Supplier' })),
    variations: (variations ?? []) as any[],
    disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
    disputeMessages: disputeMsgs.map((m: any) => ({ author_role: m.author_role, body: m.body, created_at: m.created_at })),
    signoffs: allSignoffs, updates: (updates ?? []) as any[], views: (viewRows ?? []) as any[],
    supplierDeclines,
  }).map(e => ({ ...e, label: rmFriendlyLabel(e), who: null }))

  // "History" tab content — everything archived (superseded / not-selected quotes,
  // declined quote requests, sent-back submissions, a declined snag-fix date),
  // grouped and labelled. Rendered inside the bottom tabbed card.
  const hasHistory = archivedDeclinedQuotes.length > 0 || archivedRequestDeclines.length > 0 || closedWaitingRows.length > 0 || supersededSubmissions.length > 0 || !!declinedSnag || (variations ?? []).length > 0
  const historyContent = hasHistory ? (
    <div className="space-y-4">
      {archivedDeclinedQuotes.length > 0 && (
        <ArchiveGroup label="Quotes">
          {archivedDeclinedQuotes.map(q => <RmDeclinedQuoteCard key={q.id} q={q} ticketId={t.id} canReQuote={false} />)}
        </ArchiveGroup>
      )}
      {(archivedRequestDeclines.length > 0 || closedWaitingRows.length > 0) && (
        <ArchiveGroup label="Quote requests">
          {archivedRequestDeclines.map((d, i) => (
            <details key={`rd-${i}`} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
              <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{d.name}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5 shrink-0">Declined</span>
              </summary>
              <div className="border-t border-[var(--border)] p-4 space-y-3">
                {d.reason && (
                  <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
                    <p className="text-sm text-[var(--text)]">{d.reason}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label="Type" value="Declined quote request" />
                  <DetailItem label="Declined" value={formatDateTime(d.at)} />
                </div>
              </div>
            </details>
          ))}
          {closedWaitingRows.map((r, i) => (
            <details key={`cw-${i}`} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
              <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">{r.name}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)] bg-[var(--hover)] rounded-full px-2 py-0.5 shrink-0">Closed</span>
              </summary>
              <div className="border-t border-[var(--border)] p-4 space-y-3">
                <div className="rounded-lg bg-[var(--hover)] ring-1 ring-[var(--border)] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Note</p>
                  <p className="text-sm text-[var(--text)]">{COURTESY_NOTE}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label="Type" value="Awaiting quote — closed" />
                  <DetailItem label="Requested" value={r.invitedAt ? formatDateTime(r.invitedAt) : '—'} />
                </div>
              </div>
            </details>
          ))}
        </ArchiveGroup>
      )}
      {supersededSubmissions.length > 0 && (
        <ArchiveGroup label="Submissions">
          {supersededSubmissions.map((s: any) => (
            <RmSignoffCard key={s.id} s={s} tone={submissionTone(s)} ticketId={t.id} title={submissionLabel(s)} reason={roundBySignoff.get(s.id)?.reason ?? s.reject_reason} collapsible />
          ))}
        </ArchiveGroup>
      )}
      {declinedSnag && (
        <ArchiveGroup label="Snag schedule">
          <details className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
            <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text)] truncate">Snag schedule declined</p>
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(declinedSnag.schedule_declined_at)}</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5 shrink-0">Declined</span>
            </summary>
            <div className="border-t border-[var(--border)] p-4">
              <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Reason</p>
                <p className="text-sm text-[var(--text)]">{declinedSnag.schedule_decline_reason || 'No reason provided.'}</p>
              </div>
            </div>
          </details>
        </ArchiveGroup>
      )}
      {(variations ?? []).length > 0 && (
        <ArchiveGroup label="Variation orders">
          {((variations ?? []) as any[]).map((v, i) => {
            const meta = v.status === 'approved' ? { l: 'VO accepted', c: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
              : v.status === 'rejected' ? { l: 'VO rejected', c: 'bg-red-500/15 text-red-700 dark:text-red-400' }
              : { l: 'Pending', c: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
            return (
              <details key={i} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
                <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                  <span className="text-sm font-semibold text-[var(--text)] min-w-0 truncate">Variation order {i + 1}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {v.amount != null && <span className="text-sm text-[var(--text)] tabular-nums">{formatCurrency(v.amount)}</span>}
                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.c}`}>{meta.l}</span>
                  </span>
                </summary>
                <div className="border-t border-[var(--border)] p-4 space-y-2">
                  <p className="text-sm text-[var(--text)] whitespace-pre-line">{v.description}</p>
                  {v.warranty && <p className="text-[13px] text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Warranty:</span> {v.warranty}</p>}
                  {v.reject_reason && (
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Decline reason</p>
                      <p className="text-sm text-[var(--text)]">{v.reject_reason}</p>
                    </div>
                  )}
                  {Array.isArray(v.file_urls) && v.file_urls.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                      {v.file_urls.map((u: string, j: number) => (
                        <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={14} /> Attachment {j + 1}</a>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p>
                </div>
              </details>
            )
          })}
        </ArchiveGroup>
      )}
    </div>
  ) : null

  // "Documents" tab — every document (PDF) on the ticket in one place: the approved
  // quote, the COC & invoice, and any variation-order attachments. Photos have their
  // own tab; a few docs also stay in their in-context cards (same pattern as photos).
  type DocLink = { label: string; href: string; itemType: 'quote' | 'coc' | 'invoice' | 'attachment' }
  const documentLinks: DocLink[] = []
  for (const q of acceptedQuotes) if (q.fileUrl) documentLinks.push({ label: `${q.supplierName}'s quote`, href: q.fileUrl, itemType: 'quote' })
  for (const s of [acceptedSignoff, ...pendingSignoffs].filter(Boolean) as any[]) {
    if (s.coc_url) documentLinks.push({ label: 'Certificate of Completion (COC)', href: s.coc_url, itemType: 'coc' })
    if (s.invoice_url) documentLinks.push({ label: 'Invoice', href: s.invoice_url, itemType: 'invoice' })
  }
  ;((variations ?? []) as any[]).forEach((v, i) => {
    if (Array.isArray(v.file_urls)) v.file_urls.forEach((u: string, j: number) => documentLinks.push({ label: `Variation order ${i + 1} · Attachment ${j + 1}`, href: u, itemType: 'attachment' }))
  })
  const documentsContent = documentLinks.length > 0 ? (
    <ul className="space-y-2">
      {documentLinks.map((d, i) => (
        <li key={i}>
          <ViewTrackedLink ticketId={t.id} itemType={d.itemType} itemLabel={d.label} href={d.href} className="flex items-center gap-2.5 rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--hover)]">
            <FileText size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="truncate">{d.label}</span>
          </ViewTrackedLink>
        </li>
      ))}
    </ul>
  ) : null

  // "Quotes" tab — a read-only record of the quotes on the ticket: the approved one
  // plus any still under review. The live approve/decline workspace stays in the
  // Next action block; declined/superseded quotes live in History.
  const quotesTabList = [...acceptedQuotes, ...reviewQuotes]
  const acceptedQuoteIds = new Set(acceptedQuotes.map(q => q.id))
  const quotesContent = quotesTabList.length > 0 ? (
    <div className="space-y-2">
      {quotesTabList.map(q => {
        const isApproved = acceptedQuoteIds.has(q.id)
        return (
          <QuoteSummary key={q.id} title={q.supplierName ?? 'Supplier'} status={isApproved ? 'accepted' : 'pending'} collapsible ticketId={t.id}
            quote={{ id: q.id, supplierName: q.supplierName, amount: q.amount, amountInclVat: q.amountInclVat ?? null, description: q.description ?? null, fileUrl: q.fileUrl ?? null, validUntil: q.validUntil ?? null, createdAt: q.createdAt }}
            schedule={q.proposedScheduleAt ? { at: q.proposedScheduleAt, proposed: true, audience: 'rm' } : null} />
        )
      })}
    </div>
  ) : null

  // "Completion" tab — the approved COC & POC as a collapsible card (open by
  // default), like the Quotes tab. Replaces the old standalone Completion section.
  // The COC & POC submission currently awaiting the RM's sign-off (if any) — shown
  // in the Completion tab (full detail) and summarised in the Next-action block.
  const reviewSignoff: any = t.status === 'submitted_for_signoff' ? (pendingSignoffs[0] ?? null) : null
  const completionContent = (acceptedSignoff || reviewSignoff) ? (
    <div className="space-y-3">
      {reviewSignoff && <RmSignoffCard s={reviewSignoff} tone="review" ticketId={t.id} title={submissionLabel(reviewSignoff)} freshEvidence={isEvidenceResubmission} collapsible defaultOpen />}
      {acceptedSignoff && <RmSignoffCard s={acceptedSignoff} tone="approved" ticketId={t.id} collapsible defaultOpen />}
    </div>
  ) : null

  const snagReviewItems = (snagAwaitingApproval && latestSnag?.scheduled_at) ? [{
    id: 'snag-schedule',
    dot: 'bg-amber-500',
    title: 'Snag fix schedule',
    subtitle: `proposed ${formatDateTime(latestSnag.scheduled_at)}`,
    statusLabel: 'Awaiting your approval',
    statusCls: 'text-amber-700 dark:text-amber-400',
    modalTitle: 'Snag fix schedule',
    body: <AcceptSnagScheduleCard ticketId={t.id} scheduledAt={latestSnag.scheduled_at} />,
  }] : []

  const pendingVariation = ((variations ?? []) as any[]).find(v => v.status === 'pending') ?? null
  const voReviewItems = (t.status === 'variation_review' && pendingVariation) ? [{
    id: 'vo-review',
    dot: 'bg-amber-500',
    title: 'Variation order',
    subtitle: pendingVariation.amount != null ? formatCurrency(pendingVariation.amount) : 'Extra work',
    statusLabel: 'Awaiting your approval',
    statusCls: 'text-amber-700 dark:text-amber-400',
    modalTitle: 'Variation order — review',
    body: (
      <div className="space-y-4">
        <div className="rounded-xl ring-1 ring-[var(--border)] p-4 space-y-2">
          <p className="text-sm text-[var(--text)] whitespace-pre-line">{pendingVariation.description}</p>
          {pendingVariation.warranty && <p className="text-[13px] text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Warranty:</span> {pendingVariation.warranty}</p>}
          {pendingVariation.amount != null && <p className="text-[13px] text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Amount:</span> {formatCurrency(pendingVariation.amount)}</p>}
          {Array.isArray(pendingVariation.file_urls) && pendingVariation.file_urls.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {pendingVariation.file_urls.map((u: string, j: number) => (
                <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={14} /> Attachment {j + 1}</a>
              ))}
            </div>
          )}
        </div>
        <VariationReviewCard ticketId={t.id} />
      </div>
    ),
  }] : []

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/regional/tickets" label="Back to tickets" />

      {/* Header — reference, title, priority + status, progress stepper (SM flavor). */}
      <Card className="p-5 space-y-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.category || t.title}</h1>
          </div>
          {/* Priority + status badges — same form factor as the SM ticket detail. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass({ priority: t.priority } as StoreManagerTicket)}`}>{priorityLabel({ priority: t.priority } as StoreManagerTicket)}</span>
            {(() => {
              const sm = rmStatusMeta(t.status)
              // An open dispute overrides the badge with "Dispute" (the snag/evidence
              // step is paused). Otherwise: a ticket where every supplier declined is
              // back at 'open' and reads "New"; "Info added" reads like an "Info
              // requested" badge (amber); the fresh answer is highlighted red in the
              // description until the RM acts.
              const label = openDispute ? 'Dispute' : rmInfoAdded ? 'Info added' : sm.label
              const cls = openDispute ? 'bg-red-500/15 text-red-700 dark:text-red-400' : rmInfoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls
              return <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${cls}`}>{label}</span>
            })()}
          </div>
        </div>

        <RmPipeline status={t.status} />
      </Card>

      {/* Next action + Ticket information, side by side — matched heights (stretch). */}
      <div className="grid gap-4 lg:grid-cols-2 items-stretch">
      {/* Next action — the RM's most important pending step + the controls to take it
          (buttons stacked one under another). */}
      <Card className="p-5 space-y-4 h-full">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Next action</h2>
          {nextAction.msg && <p className="mt-1 text-sm font-bold text-[var(--text)]">{nextAction.msg}</p>}
          {/* When breached the instruction moves into the red callout below, so it
              isn't said twice. */}
          {nextAction.sub && !breached && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{nextAction.sub}</p>}
        </div>

        {/* SLA breach — concise callout carrying how-late + the next action. */}
        {breached && <BreachReason action={nextAction.sub || nextAction.msg || 'This ticket is overdue — take the next action to get it back on track.'} dueAt={sla.nextActionDueAt} nowMs={now.getTime()} />}

        {/* Snag-fix schedule awaiting approval — compact row → pop-up (approve/decline). */}
        <RmReviewPanel heading="Snag" items={snagReviewItems} />

        {SNAG_WAIT_MSG[t.status] && !snagAwaitingApproval && !openDispute && (t.status !== 'snag_assigned' || latestSnag?.schedule_status === 'agreed') && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">{SNAG_WAIT_MSG[t.status]}{latestSnag?.description ? ` Snag raised: “${latestSnag.description}”.` : ''} The full submission is in the Archive below.</p>
          </div>
        )}

        {t.status === 'evidence_requested' && !openDispute && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Awaiting the supplier to provide the additional evidence requested on the completion (COC &amp; POC).{t.evidence_request_reason ? ` Requested: “${t.evidence_request_reason}”.` : ''}</p>
          </div>
        )}

        {t.status === 'vo_declined' && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">You declined the variation order. Awaiting the supplier&apos;s response — they can submit a revised variation order or message you before the job proceeds.</p>
          </div>
        )}

        {/* Quoting workspace — requested suppliers + their quotes (a received quote is
            a clickable item that pops up the full quote with Approve / Decline). Sits
            above the primary action buttons. Only while still collecting/deciding: once
            a quote is awarded the approved quote lives in the Quotes tab. */}
        {!isTerminal && !awarded && quotePanelRows.length > 0 && <RmQuotePanel ticketId={t.id} rows={quotePanelRows} canReQuote={canReQuote} />}

        {/* Primary action leads (Assign supplier); everything secondary/destructive —
            add extra work, request more info, cancel — lives behind "More actions".
            It's a client component so its per-action trigger render-props are created
            client-side (a Server Component can't pass functions to Client Components). */}
        {!isTerminal && (canAssign || canCancel) && (
          <RmTicketActionBar ticketId={t.id} status={t.status} canAssign={canAssign} canAssignSupplier={canAssignSupplier} canCancel={canCancel} canEdit={canEdit} jobRef={t.job_ref}
            suppliers={supplierList} motivSuppliers={motivSupplierList} declinedSupplierIds={declinedSupplierIds} awaitingById={engagedSupplierIds}
            description={t.description ?? ''} photoUrls={Array.isArray(t.photo_urls) ? t.photo_urls : []} title={t.title} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} priority={t.priority} />
        )}

        {/* Completion (COC & POC) submitted → inline summary + Approve completion,
            with Raise snag / Request more evidence behind "More". Full detail is in
            the Completion tab. */}
        {reviewSignoff && (
          <RmCompletionReview ticketId={t.id} label={submissionLabel(reviewSignoff)} submittedAt={reviewSignoff.created_at}
            photoCount={(reviewSignoff.before_urls ?? []).length + (reviewSignoff.after_urls ?? []).length}
            docCount={(reviewSignoff.coc_url ? 1 : 0) + (reviewSignoff.invoice_url ? 1 : 0)}
            noteCount={reviewSignoff.notes && String(reviewSignoff.notes).trim() ? 1 : 0} />
        )}

        {t.status === 'scheduled' && t.schedule_status === 'proposed' && t.scheduled_at && <AcceptScheduleCard ticketId={t.id} scheduledAt={t.scheduled_at} />}

        {/* Variation order awaiting approval — compact row → pop-up (approve/decline). */}
        <RmReviewPanel heading="Variation order" items={voReviewItems} />

        {/* Quote approved / job awarded — a positive callout while we wait for the
            supplier to start (not shown while a proposed visit time needs accepting). */}
        {['accepted', 'scheduled'].includes(t.status) && !(t.status === 'scheduled' && t.schedule_status === 'proposed' && t.scheduled_at) && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">The quote has been approved and <span className="font-semibold text-[var(--text)]">{nameById.get(t.supplier_id ?? '') ?? 'the supplier'}</span> awarded the job. The ticket will move to <span className="font-semibold text-[var(--text)]">In progress</span> once they start work on site.</p>
          </div>
        )}

        {t.status === 'in_progress' && (
          <div className="rounded-xl bg-[#C6A35D]/10 ring-1 ring-[#C6A35D]/30 p-3.5 text-sm text-[var(--text-muted)]">Work in progress — the supplier is on site or en route to attend to the job. The completion certificate and proof-of-completion photos will follow once the work is done.</div>
        )}

        {(t.status === 'approved_closeout' || t.status === 'vo_declined') && (
          <>
            <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 text-sm text-[var(--text-muted)]">COC &amp; POC approved. The supplier can still raise a variation order for extra work — otherwise finalise the close-out below once they confirm there are none.</div>
            <CloseOutButton ticketId={t.id} voConfirmed={!!t.vo_none_confirmed_at} />
          </>
        )}

        {/* Completed — positive close-out callout (no action left). */}
        {t.status === 'completed' && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">This ticket is <span className="font-semibold text-[var(--text)]">complete</span> — the completion certificate and proof of completion have been approved and signed off. No further action is needed.</p>
          </div>
        )}

        <WorkflowActions
          ticketId={t.id} status={t.status} role="regional_manager"
          suppliers={supplierList}
          exclude={['validate', 'reject', 'request_info', 'request_quote', 'require_assessment', 'approve_quote', 'reject_quote', 'request_revision', 'proceed_no_quote', 'schedule', 'approve', 'assign_snag', 'accept_schedule', 'approve_snag', 'decline_snag_schedule', 'approve_variation', 'reject_variation', 'request_evidence', 'raise_snag', 'close_out']}
        />
      </Card>

      {/* Ticket information — aligned label→value rows, then full-width description. */}
        <Card className="p-5 space-y-4 h-full">
          <h2 className="text-sm font-bold text-[var(--text)]">Ticket information</h2>
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-[var(--text-muted)]">Store</dt>
            <dd className="font-medium text-[var(--text)]">{storeName}</dd>
            <dt className="text-[var(--text-muted)]">Category</dt>
            <dd className="font-medium text-[var(--text)]">{t.category ?? 'General'}</dd>
            <dt className="text-[var(--text-muted)]">Operational impact</dt>
            <dd className="font-medium text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'}</dd>
            <dt className="text-[var(--text-muted)]">Logged</dt>
            <dd className="font-medium text-[var(--text)]">{formatDateTime(t.created_at)}</dd>
            <dt className="text-[var(--text-muted)]">Due</dt>
            <dd className={`font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>
              {formatDateTime(dueAt)}
              {overdue && <span className="ml-1.5 text-[11px] font-semibold">· Overdue by {humanizeDuration(Math.max(0, now.getTime() - new Date(dueAt).getTime()))}</span>}
            </dd>
          </dl>

          {/* Description — full width beneath the detail rows. */}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
            {(() => {
              // Appended segments highlight red until the RM moves the ticket on: the
              // store manager's answer ("— Added info: …") and the RM's own extra scope
              // ("— Extra Work: …"). The base description text is white.
              const parts = String(t.description ?? '').split(/(\n\n— (?:Added info|Extra Work): )/)
              const segs: JSX.Element[] = []
              for (let i = 1; i < parts.length; i += 2) {
                const sep = parts[i], seg = parts[i + 1] ?? ''
                const hot = sep.includes('Extra Work') ? canAssign : rmInfoAdded
                segs.push(<span key={i} className={hot ? 'text-red-600 dark:text-red-400 font-medium' : 'text-[var(--text)]'}>{`${sep}${seg}`}</span>)
              }
              return (
                <p className="text-sm whitespace-pre-line text-[var(--text)]">
                  <span>{parts[0]}</span>
                  {segs}
                </p>
              )
            })()}
          </div>

          {/* Editing the ticket now lives in the Next-action "More" menu; only the
              "edited" provenance line remains here. */}
          {t.edited_at && <div className="pt-1"><EditedLine at={t.edited_at} by={editorName} /></div>}

          {t.info_request_reason && <p className="text-xs text-amber-600 dark:text-amber-400">Info requested: {t.info_request_reason}</p>}
          {/* Scheduled visit — hidden once a snag fix is in play (that callout replaces it). */}
          {t.scheduled_at && !snagScheduleActive && (
            <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
              <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled{t.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
                <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}</p>
                {t.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Past the SLA window — awaiting your acceptance.</p>}
              </div>
            </div>
          )}
          {/* Snag fix schedule — only shown once the RM has approved the date (replaces
              the original Scheduled callout above). */}
          {snagFixApproved && (
            <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3.5 py-3">
              <Calendar size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400">Snag fix scheduled</p>
                <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(latestSnag.scheduled_at)}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
      {/* Bump this RM's "last seen" watermark on a real open (fires client-side, not on
          prefetch) so these updates read as seen next visit. */}
      <MarkTicketSeen ticketId={t.id} latestUpdateAt={supplierUpdates[0]?.created_at ?? null} />
      {/* NEW updates from the supplier — surfaced right below the ticket detail so
          they're the first thing the RM notices. Shows only the unseen updates; on the
          next open they fold into the collapsible history above the audit trail. */}
      {newSupplierUpdates.length > 0 && (
        <Card className="p-5 space-y-3 bg-[#C6A35D]/5 ring-1 ring-[#C6A35D]/50">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><MessageSquare size={15} className="text-[#C6A35D]" /> New updates from the supplier</h2>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-[#C6A35D] bg-[#C6A35D]/15 rounded-full px-2 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C6A35D] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C6A35D]" />
              </span>
              {newSupplierUpdates.length} new
            </span>
          </div>
          <ol className="space-y-2.5">
            {newSupplierUpdates.map((u, i) => <SupplierUpdateItem key={i} u={u} ticketId={t.id} isNew />)}
          </ol>
        </Card>
      )}
      {(t.status === 'cancelled' || t.status === 'declined') && (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Ticket {t.status === 'declined' ? 'declined' : 'cancelled'}</p>
          <p className="text-sm text-[var(--text-muted)]">{t.cancellation_reason || `This ticket was ${t.status === 'declined' ? 'declined' : 'cancelled'}.`}</p>
        </div>
      )}
      {/* Dispute — while a dispute is live it sits ABOVE the Actions (needs the RM's
          attention); once done it moves below the Actions as history (see after the
          Actions card). */}
      {openDispute && disputeBlock}
      {/* COC & POC under review now lives in the "Next action" review pop-up (compact
          row → full detail + actions); its files are also in the Documents/Photos tabs. */}
      {/* The approved COC & POC now lives in the "Completion" tab (collapsible, like
          the Quotes tab) — no standalone section here. */}
      {/* Resolved dispute(s) → history below the Actions once nothing is live. */}
      {!openDispute && disputeBlock}
      {/* Variation orders now open from the "Next action" review pop-up while pending;
          the full record (any status) lives in the History tab + Documents tab. */}
      {/* Photos · Activity (supplier updates) · Timeline (the full audit trail —
          status changes, edits, attachments/photos viewed, quotes, sign-offs …). */}
      <RmTicketTabs ticketId={t.id} photoGroups={photoGroups} updates={supplierUpdates} timeline={timelineItems} documents={documentsContent} quotes={quotesContent} completion={completionContent} history={historyContent} />
    </div>
  );
}
