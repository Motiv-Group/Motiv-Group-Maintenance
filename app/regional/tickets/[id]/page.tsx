export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { CheckCircle2, FileText, Calendar, CalendarClock, Clock, MessageSquare, Camera } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { BreachReason } from '@/components/workflow/BreachReason'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { AssignSuppliersButton, RequestInfoButton, RmEditTicketForm, SupplierStatusList, QuoteReviewCard, CancelTicketCard, ApproveSignoffCard, ReQuoteButton, AcceptScheduleCard, AcceptSnagScheduleCard, VariationReviewCard, RmAddWorkForm } from '@/components/regional/RmTicketActions'
import { DueDate } from '@/components/workflow/DueDate'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { AuditTrail } from '@/components/ui/AuditTrail'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { formatCurrency, formatDateTime, formatDate, rmStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

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
function RmSignoffCard({ s, tone, ticketId }: { s: any; tone: 'review' | 'snag' | 'approved' | 'evidence'; ticketId: string }) {
  const meta = tone === 'approved'
    ? { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'Approved', Icon: CheckCircle2, iconCls: 'text-emerald-500', title: 'Approved completion' }
    : tone === 'snag'
    ? { ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Sent back', Icon: FileText, iconCls: 'text-red-500', title: 'Snagged completion' }
    : tone === 'evidence'
    ? { ring: 'ring-amber-500/40', bg: 'bg-amber-500/5', head: 'bg-amber-500/10 border-amber-500/20', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'More info requested', Icon: FileText, iconCls: 'text-amber-500', title: 'Sent back for more evidence' }
    : { ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]', label: 'Under review', Icon: FileText, iconCls: 'text-[#C6A35D]', title: 'Submitted completion' }
  const before = (s.before_urls ?? []) as string[]
  const after = (s.after_urls ?? []) as string[]
  return (
    <div className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${meta.head}`}>
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><meta.Icon size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">{meta.title} · {formatDateTime(s.created_at)}</span></span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${meta.badge}`}>{meta.label}</span>
      </div>
      <div className="p-4 space-y-3">
        {tone === 'snag' && s.reject_reason && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
            <p className="text-sm text-[var(--text)]">{s.reject_reason}</p>
          </div>
        )}
        {tone === 'evidence' && s.reject_reason && (
          <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Why more evidence was requested</p>
            <p className="text-sm text-[var(--text)]">{s.reject_reason}</p>
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {before.map((u, i) => <ViewTrackedLink key={`b${i}`} ticketId={ticketId} itemType="photo" itemLabel={`Before photo ${i + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {i + 1}</ViewTrackedLink>)}
            {after.map((u, i) => <ViewTrackedLink key={`a${i}`} ticketId={ticketId} itemType="photo" itemLabel={`Completion photo ${i + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {i + 1}</ViewTrackedLink>)}
            {!before.length && !after.length && <span className="text-sm text-[var(--text-faint)]">No photos</span>}
          </div>
        </div>
        {(s.coc_url || s.invoice_url) && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Certificate of Completion</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {s.coc_url && <ViewTrackedLink ticketId={ticketId} itemType="coc" itemLabel="COC" href={s.coc_url} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</ViewTrackedLink>}
              {s.invoice_url && <ViewTrackedLink ticketId={ticketId} itemType="invoice" itemLabel="Invoice" href={s.invoice_url} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</ViewTrackedLink>}
            </div>
          </div>
        )}
        {s.notes && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Notes</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default async function RegionalTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !t.region_id || !regionIds.includes(t.region_id)) redirect('/regional/tickets')

  const [{ data: store }, { data: quotes }, { data: updates }, { data: signoffs }, { data: suppliers }, { data: variations }, { data: snags }, { data: invites }, { data: ratingRows }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, decline_reason, created_at, updated_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, status, before_urls, after_urls, coc_url, invoice_url, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('suppliers').select('id, company_name').eq('company_id', companyId).eq('active', true).order('company_name'),
    admin.from('ticket_variations').select('description, amount, warranty, status, reject_reason, reviewed_at, created_at, file_urls').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('snags').select('description, status, scheduled_at, schedule_status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, responded_at, decline_reason, declined_by, suppliers(company_name)').eq('ticket_id', t.id),
    admin.from('ratings').select('supplier_id, score').eq('company_id', companyId),
  ])
  const storeName = store ? storeLabel(store.name, store.sub_store) : 'Store'
  const editorName = t.edited_by ? ((await admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single()).data?.full_name ?? null) : null
  // Motiv-curated supplier pool (assign pop-up) + who has viewed this ticket's items.
  const [{ data: motivSuppliers }, { data: viewRows }, { data: declineRows }, { data: requestRows }] = await Promise.all([
    admin.from('suppliers').select('id, company_name').eq('is_motiv', true).eq('active', true).order('company_name'),
    admin.from('ticket_views').select('viewer_role, item_type, item_label, first_viewed_at').eq('ticket_id', t.id),
    // Durable supplier request-declines — kept even after the supplier is re-invited.
    admin.from('ticket_supplier_declines').select('supplier_id, reason, declined_at').eq('ticket_id', t.id).order('declined_at', { ascending: true }),
    // Durable quote-request rounds — each (re)assignment adds a "Quote requested"
    // event, attributed to the supplier so the trail reads "Quote requested from X".
    admin.from('ticket_quote_requests').select('supplier_id, requested_at').eq('ticket_id', t.id).order('requested_at', { ascending: true }),
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
  // Snag scheduling — the supplier's proposed fix date (separate from the original
  // job schedule) and whether it's still awaiting the RM's approval.
  const latestSnag = ((snags ?? []) as any[])[0] ?? null
  const snagScheduledAt = ((snags ?? []) as any[]).find(s => s.scheduled_at)?.scheduled_at ?? null
  const snagAwaitingApproval = t.status === 'snag_assigned' && latestSnag?.schedule_status === 'proposed' && !!latestSnag?.scheduled_at

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Dual-SLA result → breach reason (which pending action ran past its deadline).
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && (sla.supplierBreached || sla.internalBreached)
  const breachOwner = sla.delayOwner === 'supplier' ? 'Supplier' : sla.delayOwner === 'store' ? 'Store' : 'Regional Manager (internal)'

  // Avg star rating per supplier, so the RM sees each contractor's record when assigning.
  const ratingAgg = new Map<string, { sum: number; n: number }>()
  for (const r of (ratingRows ?? []) as any[]) {
    if (!r.supplier_id) continue
    const a = ratingAgg.get(r.supplier_id) ?? { sum: 0, n: 0 }; a.sum += Number(r.score); a.n++; ratingAgg.set(r.supplier_id, a)
  }
  const toSupplierCard = (s: any) => { const ra = ratingAgg.get(s.id); return { id: s.id, name: s.company_name, avgRating: ra ? ra.sum / ra.n : 5, ratingCount: ra ? ra.n : 0 } }
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
  const mapQuote = (q: any) => ({
    id: q.id, supplierId: q.supplier_id as string, supplierName: nameById.get(q.supplier_id) ?? 'Supplier', amount: q.amount,
    amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null,
    // Prefer the durable per-quote reason; fall back to the invite's (mutable) reason
    // for older quotes declined before it was stored on the quote row.
    validUntil: q.valid_until ?? null, createdAt: q.created_at, declineReason: q.decline_reason ?? declineReasonBy.get(q.supplier_id) ?? null,
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
  // Gate the main Quotes block on its OWN live content (superseded declines live in
  // the separate Archive block, so they don't keep an otherwise-empty block open).
  const hasQuoteBlock = requestedRows.length > 0 || reviewQuotes.length > 0 || acceptedQuotes.length > 0 || liveDeclinedQuotes.length > 0
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

  // Progress updates the supplier posted (notes / photos) — surfaced in their own
  // highlighted card so the RM notices activity on the job (not just buried in the
  // audit trail). "New" = posted since the RM last acted on the ticket
  // (last_internal_update_at, bumped by every RM transition).
  const supplierUpdates = ((updates ?? []) as any[]).filter(u => u.author_role === 'supplier')
  const rmLastActedMs = t.last_internal_update_at ? +new Date(t.last_internal_update_at) : 0
  const newUpdateCount = supplierUpdates.filter(u => +new Date(u.created_at) > rmLastActedMs).length

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/regional/tickets" label="Back to tickets" />

      {/* Progress — bare, no card around it */}
      <div className="px-1 pt-1"><RmPipeline status={t.status} /></div>

      {/* Ticket detail — structured, mirrors the SM layout */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 justify-items-end">
              <PriorityBadge priority={t.priority} className="w-full text-center" />
              {(() => {
                const sm = rmStatusMeta(t.status)
                // A ticket where every supplier declined is back at 'open' and simply
                // reads "Open". "Info added" reads like an "Info requested" badge
                // (amber); the fresh answer is highlighted red in the description until
                // the RM acts.
                const label = rmInfoAdded ? 'Info added' : sm.label
                const cls = rmInfoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls
                return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{label}</span>
              })()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Store" value={storeName} />
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
          <DetailItem label="Logged" value={formatDateTime(t.created_at)} />
          <DueDate dueAt={dueAt} overdue={overdue} now={now.toISOString()} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
          {(() => {
            // Two kinds of appended segment are highlighted red until the RM moves the
            // ticket on: the store manager's answer ("— Added info: …", red while the
            // info is freshly added) and the RM's own extra scope ("— Extra Work: …",
            // red until a supplier is assigned / re-assigned). Everything else is muted.
            const parts = String(t.description ?? '').split(/(\n\n— (?:Added info|Extra Work): )/)
            const segs: JSX.Element[] = []
            for (let i = 1; i < parts.length; i += 2) {
              const sep = parts[i], seg = parts[i + 1] ?? ''
              const hot = sep.includes('Extra Work') ? canAssign : rmInfoAdded
              segs.push(<span key={i} className={hot ? 'text-red-600 dark:text-red-400 font-medium' : 'text-[var(--text-muted)]'}>{`${sep}${seg}`}</span>)
            }
            return (
              <p className="text-sm whitespace-pre-line">
                <span className="text-[var(--text-muted)]">{parts[0]}</span>
                {segs}
              </p>
            )
          })()}
        </div>

        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Photos</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {t.photo_urls.map((u: string, i: number) => (
                <ViewTrackedLink key={i} ticketId={t.id} itemType="photo" itemLabel={`Photo ${i + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</ViewTrackedLink>
              ))}
            </div>
          </div>
        )}

        {t.info_request_reason && <p className="text-xs text-amber-600 dark:text-amber-400">Info requested: {t.info_request_reason}</p>}
        {/* Scheduled visit — its own callout in the ticket detail block. */}
        {t.scheduled_at && (
          <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled{t.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}</p>
              {t.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Past the SLA window — awaiting your acceptance.</p>}
            </div>
          </div>
        )}
        {/* Snag fix schedule — the supplier's proposed corrective-work date (separate from the original job). */}
        {latestSnag?.scheduled_at && ['assigned', 'in_progress'].includes(latestSnag.status) && (
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400">Snag fix scheduled{latestSnag.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(latestSnag.scheduled_at)}</p>
              {latestSnag.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Awaiting your approval.</p>}
            </div>
          </div>
        )}

        {/* Last text on the left, Edit ticket on the right, on the same line. */}
        <div className="flex items-end justify-between gap-2">
          <EditedLine at={t.edited_at} by={editorName} />
          {canEdit && <RmEditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', priority: t.priority, description: t.description }} />}
        </div>
      </Card>

      {(t.status === 'cancelled' || t.status === 'declined') && (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Ticket {t.status === 'declined' ? 'declined' : 'cancelled'}</p>
          <p className="text-sm text-[var(--text-muted)]">{t.cancellation_reason || `This ticket was ${t.status === 'declined' ? 'declined' : 'cancelled'}.`}</p>
        </div>
      )}

      {breached && <BreachReason nextAction={sla.nextAction} dueAt={sla.nextActionDueAt} owner={breachOwner} />}

      {/* Updates from the supplier — progress notes / photos, in a gold-accented card
          so new activity is noticed at a glance. A pulsing "N new" badge flags updates
          posted since the RM last acted; the newest sit at the top. */}
      {supplierUpdates.length > 0 && (
        <Card className={`p-5 space-y-3 bg-[#C6A35D]/5 ${newUpdateCount > 0 ? 'ring-1 ring-[#C6A35D]/50' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><MessageSquare size={15} className="text-[#C6A35D]" /> Updates from the supplier</h2>
            {newUpdateCount > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-[#C6A35D] bg-[#C6A35D]/15 rounded-full px-2 py-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C6A35D] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C6A35D]" />
                </span>
                {newUpdateCount} new
              </span>
            )}
          </div>
          <ol className="space-y-2.5">
            {supplierUpdates.map((u, i) => {
              // Progress photos are posted as "📷 Progress photo: <url>" — render the
              // link/thumbnail; everything else is a free-text note.
              const photo = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/)
              const isNew = +new Date(u.created_at) > rmLastActedMs
              return (
                <li key={i} className={`rounded-xl ring-1 p-3 bg-[var(--surface)] ${isNew ? 'ring-[#C6A35D]/40' : 'ring-[var(--border)]'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
                      Supplier
                      {isNew && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-[#C6A35D] bg-[#C6A35D]/15 rounded-full px-1.5 py-0.5">New</span>}
                    </span>
                    <span className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</span>
                  </div>
                  {photo
                    ? <ViewTrackedLink ticketId={t.id} itemType="photo" itemLabel="Supplier progress photo" href={photo[1]} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><Camera size={14} /> View progress photo</ViewTrackedLink>
                    : <p className="text-sm text-[var(--text)] whitespace-pre-line">{u.body}</p>}
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {/* COC & POC — every submission: under review, plus any sent back for more evidence (full history) */}
      {(pendingSignoffs.length > 0 || evidenceRequestedSignoffs.length > 0) && (
        <CollapsibleSection id="ticket-coc" title="COC & POC" defaultOpen={phase === 'coc'}>
          {t.status === 'evidence_requested' && t.evidence_request_reason && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Waiting on the supplier to provide more evidence</p>
              <p className="text-sm text-[var(--text)]">{t.evidence_request_reason}</p>
            </div>
          )}
          {pendingSignoffs.map((s: any) => <RmSignoffCard key={s.id} s={s} tone="review" ticketId={t.id} />)}
          {evidenceRequestedSignoffs.map((s: any) => <RmSignoffCard key={s.id} s={s} tone="evidence" ticketId={t.id} />)}
        </CollapsibleSection>
      )}

      {/* Completion — the approved COC & POC, created once sign-off is accepted */}
      {acceptedSignoff && (
        <CollapsibleSection id="ticket-completion" title="Completion" defaultOpen={phase === 'completion'}>
          <RmSignoffCard s={acceptedSignoff} tone="approved" ticketId={t.id} />
        </CollapsibleSection>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Actions</h2>

        {snagAwaitingApproval && latestSnag?.scheduled_at && <AcceptSnagScheduleCard ticketId={t.id} scheduledAt={latestSnag.scheduled_at} />}

        {SNAG_WAIT_MSG[t.status] && !snagAwaitingApproval && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">{SNAG_WAIT_MSG[t.status]}</p>
          </div>
        )}

        {t.status === 'evidence_requested' && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Awaiting the supplier to provide the additional evidence requested on the completion (COC &amp; POC).</p>
          </div>
        )}

        {/* Variation order declined — the supplier now owns the next step. */}
        {t.status === 'vo_declined' && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">You declined the variation order. Awaiting the supplier&apos;s response — they can submit a revised variation order or message you before the job proceeds.</p>
          </div>
        )}

        {awaitingSupplierQuotes && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Supplier{activeSupplierRows.filter(r => r.status === 'invited').length === 1 ? '' : 's'} assigned — awaiting their quote{activeSupplierRows.filter(r => r.status === 'invited').length === 1 ? '' : 's'}.</p>
          </div>
        )}

        {/* Add extra work — before a supplier is assigned; disappears once assigned. */}
        {canAssign && <RmAddWorkForm ticketId={t.id} description={t.description ?? ''} photoUrls={Array.isArray(t.photo_urls) ? t.photo_urls : []} title={t.title} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} />}

        {/* Primary actions — equal-size, side by side: Assign (green) · Request info (amber) · Cancel (red) */}
        {!isTerminal && (canAssign || canCancel) && (
          <div className="flex gap-2">
            {canAssignSupplier && <AssignSuppliersButton ticketId={t.id} suppliers={supplierList} motivSuppliers={motivSupplierList} declinedSupplierIds={declinedSupplierIds} awaitingById={engagedSupplierIds} />}
            {['open', 'info_requested'].includes(t.status) && <RequestInfoButton ticketId={t.id} />}
            {canCancel && <CancelTicketCard ticketId={t.id} />}
          </div>
        )}

        {/* Accept sign-off with a required supplier rating */}
        {t.status === 'submitted_for_signoff' && <ApproveSignoffCard ticketId={t.id} />}

        {/* Accept a supplier's proposed (beyond-window) visit time */}
        {t.status === 'scheduled' && t.schedule_status === 'proposed' && t.scheduled_at && <AcceptScheduleCard ticketId={t.id} scheduledAt={t.scheduled_at} />}

        {/* Variation order review — dedicated approve (confirm-over-buttons) + decline pop-up. */}
        {t.status === 'variation_review' && <VariationReviewCard ticketId={t.id} />}

        {/* Quote approved / awarded — waiting on the supplier to attend. They flag when
            they're on their way or on site by marking the ticket in progress. */}
        {['accepted', 'scheduled'].includes(t.status) && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">{nameById.get(t.supplier_id) ?? 'The supplier'}</span> has been awarded the job. They&apos;ll let you know when they&apos;re on their way or on site by marking the ticket in progress.</p>
          </div>
        )}

        {/* In progress — the supplier has started; reassure the RM the job is being attended to. */}
        {t.status === 'in_progress' && (
          <div className="rounded-xl bg-[#C6A35D]/10 ring-1 ring-[#C6A35D]/30 p-3.5 text-sm text-[var(--text-muted)]">Work in progress — the supplier is on site or en route to attend to the job. The completion certificate and proof-of-completion photos will follow once the work is done.</div>
        )}

        {/* Close-out stage — COC/POC approved; the supplier may still raise a variation
            order, or the RM finalises the close-out (button below). */}
        {(t.status === 'approved_closeout' || t.status === 'vo_declined') && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 text-sm text-[var(--text-muted)]">COC &amp; POC approved. The supplier can still raise a variation order for extra work — otherwise finalise the close-out below.</div>
        )}

        {/* Remaining lifecycle actions (request evidence, snag, close) */}
        <WorkflowActions
          ticketId={t.id} status={t.status} role="regional_manager"
          suppliers={supplierList}
          exclude={['validate', 'reject', 'request_info', 'request_quote', 'require_assessment', 'approve_quote', 'reject_quote', 'request_revision', 'proceed_no_quote', 'schedule', 'approve', 'assign_snag', 'accept_schedule', 'approve_snag', 'approve_variation', 'reject_variation']}
        />
      </Card>

      {/* Quotes — suppliers requested, quotes to review, the accepted quote. Open
          during quoting / before work; collapsed once the job is in progress. */}
      {hasQuoteBlock && (
        <CollapsibleSection id="ticket-quotes" title="Quotes" defaultOpen={['assigned', 'assessment', 'quote_requested', 'quote_revision', 'quoted', 'accepted', 'scheduled'].includes(t.status)}>
          {requestedRows.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Suppliers requested</h3>
              <SupplierStatusList rows={requestedRows} />
            </div>
          )}
          {reviewQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Quotes for review</h3>
              <QuoteReviewCard ticketId={t.id} quotes={reviewQuotes} />
            </div>
          )}
          {/* Declined quotes still in play — full card + "Ask to re-quote" so the RM can
              invite that supplier to re-quote before assigning suppliers again. */}
          {liveDeclinedQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Declined quotes</h3>
              {liveDeclinedQuotes.map(q => <RmDeclinedQuoteCard key={q.id} q={q} ticketId={t.id} canReQuote={canReQuote} />)}
            </div>
          )}
          {acceptedQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Accepted quote</h3>
              {acceptedQuotes.map(q => (
                <div key={q.id} className="rounded-xl ring-1 ring-emerald-500/40 bg-emerald-500/5 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><CheckCircle2 size={15} className="text-emerald-500 shrink-0" /><span className="truncate">{q.supplierName}</span></span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 rounded-full px-2 py-0.5 shrink-0">Accepted</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <DetailItem label="Excl. VAT" value={formatCurrency(q.amount)} />
                      <DetailItem label="Incl. VAT" value={q.amountInclVat ? formatCurrency(q.amountInclVat) : '—'} />
                      <DetailItem label="Received" value={formatDateTime(q.createdAt)} />
                      <DetailItem label="Valid until" value={q.validUntil ? formatDate(q.validUntil) : 'N/A'} />
                    </div>
                    {t.scheduled_at && (
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <CalendarClock size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="text-[var(--text-muted)]">Scheduled visit</span>
                        <span className="font-semibold text-[var(--text)]">{formatDateTime(t.scheduled_at)}</span>
                        {t.schedule_status === 'proposed' && <span className="text-[11px] text-amber-600 dark:text-amber-400">(proposed)</span>}
                      </div>
                    )}
                    {q.description && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
                        <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{q.description}</p>
                      </div>
                    )}
                    {q.fileUrl && <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View attached quote</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Variation Orders — their own block (raised at the close-out stage). Opens by
          default while one is under review. */}
      {(variations ?? []).length > 0 && (
        <CollapsibleSection id="ticket-vos" title="Variation Orders" defaultOpen={t.status === 'variation_review' || (variations ?? []).some((v: any) => v.status === 'pending')}>
          {(variations ?? []).map((v: any, i: number) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)]">{v.description}</p>
                {v.warranty && <p className="text-[11px] text-[var(--text-muted)] mt-0.5"><span className="font-medium text-[var(--text)]">Warranty:</span> {v.warranty}</p>}
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p>
                {Array.isArray(v.file_urls) && v.file_urls.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {v.file_urls.map((u: string, j: number) => (
                      <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C6A35D] hover:underline"><FileText size={12} /> Attachment {j + 1}</a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 whitespace-nowrap">
                {v.amount != null && <span className="text-xs font-semibold text-[var(--text)]">{formatCurrency(v.amount)}</span>}
                {(() => {
                  const meta = v.status === 'approved' ? { l: 'VO accepted', c: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
                    : v.status === 'rejected' ? { l: 'VO rejected', c: 'bg-red-500/15 text-red-700 dark:text-red-400' }
                    : { l: 'Pending', c: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
                  return <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.c}`}>{meta.l}</span>
                })()}
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Archive — declined / not-selected quotes (by the RM or the supplier), moved
          out of the main Quotes block. Each is a click-to-expand row with its reason. */}
      {(archivedDeclinedQuotes.length > 0 || archivedRequestDeclines.length > 0) && (
        <CollapsibleSection id="ticket-quotes-archive" title="Archive">
          {/* Archived declines are already re-invited or superseded — no re-quote here. */}
          {archivedDeclinedQuotes.map(q => <RmDeclinedQuoteCard key={q.id} q={q} ticketId={t.id} canReQuote={false} />)}
          {/* Suppliers who declined the quote REQUEST themselves — same card style as a
              declined quote, with the reason and the date it was declined. */}
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
        </CollapsibleSection>
      )}

      {((snags ?? []).length > 0 || rejectedSignoffs.length > 0) && (
        <CollapsibleSection id="ticket-snag" title="Snags" defaultOpen={phase === 'snag'}>
          {/* Every snagged / sent-back COC/POC submission, each with the reason it was returned. */}
          {rejectedSignoffs.map((s: any) => <RmSignoffCard key={s.id} s={s} tone="snag" ticketId={t.id} />)}
        </CollapsibleSection>
      )}

      <AuditTrail ticket={{
        createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
        quoteRequestedAt: t.first_quote_requested_at ?? t.quote_requested_at,
        quoteRequests: ((requestRows ?? []) as any[]).map(r => ({ at: r.requested_at, supplierName: r.supplier_id ? (nameById.get(r.supplier_id) ?? null) : null })),
        quoteSubmittedAt: t.quote_submitted_at,
        quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
        scheduledAt: t.scheduled_at, completedAt: t.completed_at,
        editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, cancellationReason: t.cancellation_reason,
        infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
        snagScheduledAt,
        workStartedAt: t.attended_at ?? null,
        quotes: ((quotes ?? []) as any[]).map(q => ({ ...q, supplierName: nameById.get(q.supplier_id) ?? 'Supplier' })),
        variations: (variations ?? []) as any[],
        signoffs: allSignoffs, updates: (updates ?? []) as any[], views: (viewRows ?? []) as any[],
        supplierDeclines,
      }} />
    </div>
  )
}
