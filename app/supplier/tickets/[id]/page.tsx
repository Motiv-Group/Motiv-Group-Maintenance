export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ClipboardCheck, FileText, Calendar } from 'lucide-react'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { BackLink } from '@/components/ui/BackLink'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { computeTicketSla } from '@/lib/health/sla'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { BreachReason } from '@/components/workflow/BreachReason'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { SupplierAttachments } from '@/components/workflow/SupplierAttachments'
import { SendQuoteForm } from '@/components/admin/SendQuoteForm'
import { QuoteSummary, type QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import { MarkInProgressButton, DeclineWorkButton, AcceptSnagCard, StartSnagButton, SupplierVariationGate } from '@/components/supplier/SupplierJobActions'
import { RaiseDisputeButton, DisputeThread } from '@/components/dispute/DisputeBox'
import { DueDate } from '@/components/workflow/DueDate'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { AuditTrail } from '@/components/ui/AuditTrail'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { formatCurrency, formatDateTime, rmStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

// Shown when the RM declined a quote without typing a reason.
const DEFAULT_DECLINE_REASON = 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'

// Tone for the submitted-completion (sign-off) card — mirrors QuoteSummary.
const SIGNOFF_META: Record<string, { label: string; ring: string; bg: string; head: string; badge: string; iconCls: string }> = {
  accepted: { label: 'Approved', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', iconCls: 'text-emerald-500' },
  rejected: { label: 'Rejected', ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15 text-red-700 dark:text-red-400', iconCls: 'text-red-500' },
  evidence_requested: { label: 'More info requested', ring: 'ring-amber-500/40', bg: 'bg-amber-500/5', head: 'bg-amber-500/10 border-amber-500/20', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', iconCls: 'text-amber-500' },
  submitted: { label: 'Under review', ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]', iconCls: 'text-[#C6A35D]' },
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

// A labelled sub-group inside the Archived block — a small uppercase heading over
// its cards so mixed archived items (quotes, requests, submissions…) stay separated
// and scannable without cluttering the section.
function ArchiveGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      {children}
    </div>
  )
}

// One COC & POC submission card — reused across the COC/POC, Snag and Completion
// blocks. `snag` enriches a rejected submission with the "why it was sent back" reason.
function SignoffCard({ s, snag, ticketId, collapsible = false, title, reason }: { s: any; snag?: { description?: string | null; required_correction?: string | null; severity?: string | null } | null; ticketId: string; collapsible?: boolean; title?: string; reason?: string | null }) {
  const meta = SIGNOFF_META[s.status] ?? SIGNOFF_META.submitted
  const before = (s.before_urls ?? []) as string[]
  const after = (s.after_urls ?? []) as string[]
  // Prefer the durable round reason; fall back to the reason on the signoff row.
  const reasonText = reason ?? s.reject_reason
  // Header ("Submission #N" / Completion · date/time + status badge) doubles as the
  // click-to-expand summary when collapsible; the detail drops down below.
  const header = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><ClipboardCheck size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">{title ?? 'Completion'} · {formatDateTime(s.created_at)}</span></span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${meta.badge}`}>{meta.label}</span>
    </>
  )
  const body = (
    <>
        {s.status === 'rejected' && (reasonText || snag?.description || snag?.required_correction) && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
            {(reasonText || snag?.description) && <p className="text-sm text-[var(--text)]">{reasonText || snag?.description}</p>}
            {snag?.required_correction && <p className="text-sm text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Required correction:</span> {snag.required_correction}</p>}
            {snag?.severity && <p className="text-[11px] text-[var(--text-muted)] capitalize">Severity: {String(snag.severity).replace(/_/g, ' ')}</p>}
          </div>
        )}
        {s.status === 'evidence_requested' && reasonText && (
          <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Why more evidence was requested</p>
            <p className="text-sm text-[var(--text)]">{reasonText}</p>
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {before.map((u, j) => <ViewTrackedLink key={`b${j}`} ticketId={ticketId} itemType="photo" itemLabel={`Completion before photo ${j + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {j + 1}</ViewTrackedLink>)}
            {after.map((u, j) => <ViewTrackedLink key={`a${j}`} ticketId={ticketId} itemType="photo" itemLabel={`Completion after photo ${j + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {j + 1}</ViewTrackedLink>)}
            {!before.length && !after.length && <span className="text-sm text-[var(--text-faint)]">No photos uploaded</span>}
          </div>
        </div>
        {(s.coc_url || s.invoice_url) && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Certificate of Completion</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {s.coc_url && <ViewTrackedLink ticketId={ticketId} itemType="coc" itemLabel="Completion COC" href={s.coc_url} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</ViewTrackedLink>}
              {s.invoice_url && <ViewTrackedLink ticketId={ticketId} itemType="invoice" itemLabel="Completion invoice" href={s.invoice_url} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</ViewTrackedLink>}
            </div>
          </div>
        )}
        {s.notes && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Notes</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{s.notes}</p>
          </div>
        )}
    </>
  )
  // Collapsed by default — tap the "Completion · … / Under review" row to reveal
  // the proof-of-completion, COC and notes.
  if (collapsible) {
    return (
      <details className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
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

export default async function SupplierTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, supplierIds, userId } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || t.company_id !== companyId) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }, { data: invite }, { data: myQuotes }, { data: technicianRows }, { data: signoffRows }, { data: snagRows }, { data: companyRow }, { data: variationRows }, { data: viewRows }, { data: declineRows }, { data: requoteRows }, { data: roundRows }, { data: disputeRows }, { data: disputeMsgRows }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, responded_at, declined_by, requote_requested_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, decline_reason, created_at, updated_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('technicians').select('id, name').in('supplier_id', supplierIds).eq('active', true).order('name'),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('snags').select('description, required_correction, severity, status, scheduled_at, schedule_status, assigned_at, schedule_agreed_at, schedule_declined_at, schedule_decline_reason, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
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
  ])
  // Client organisation that owns the store (shown in the ticket detail).
  const companyName = (companyRow as any)?.name ?? null
  // This supplier's own trade-company name — used in the "declined by …" block.
  const myInviteSupplierId = (invite as any)?.supplier_id ?? null
  const supplierCompanyName = myInviteSupplierId
    ? ((await admin.from('suppliers').select('company_name').eq('id', myInviteSupplierId).maybeSingle()).data?.company_name ?? null)
    : null
  // When this supplier was requested to quote (their invite, else the ticket's request time).
  const quoteRequestedAt = (invite as any)?.invited_at ?? t.quote_requested_at ?? null
  // Latest completion the supplier submitted (COC + proof-of-completion photos).
  // Most recent snag — explains why a completion was rejected / sent back.
  const latestSnag = ((snagRows ?? []) as any[])[0] ?? null
  const snagScheduledAt = ((snagRows ?? []) as any[]).find(s => s.scheduled_at)?.scheduled_at ?? null
  // Snag-fix callout shows ONLY once the RM has approved the date (then it replaces the
  // original Scheduled callout). The original visit is hidden while any snag schedule is
  // in play (proposed or agreed). Latest declined schedule feeds the audit trail + Archive.
  const snagFixApproved = !!latestSnag?.scheduled_at && latestSnag.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(latestSnag.status)
  const snagScheduleActive = !!latestSnag?.scheduled_at && ['proposed', 'agreed'].includes(latestSnag.schedule_status) && ['assigned', 'in_progress'].includes(latestSnag.status)
  const declinedSnag = ((snagRows ?? []) as any[]).find(s => s.schedule_declined_at) ?? null
  const technicians = (technicianRows ?? []) as { id: string; name: string }[]
  // Access: the awarded supplier OR a supplier invited to quote (competitive model).
  const awarded = !!t.supplier_id && supplierIds.includes(t.supplier_id)
  if (!awarded && !invite) redirect('/supplier/tickets')
  // Declined off the ticket (not re-invited) — show "Declined" to the supplier.
  const declinedForMe = !awarded && !!invite && ['declined', 'closed'].includes((invite as any).status)
  const storeName = storeLabel(store?.name, store?.sub_store)
  const editorName = t.edited_by ? ((await admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single()).data?.full_name ?? null) : null

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()
  // Supplier-side SLA breach + the pending action that ran past its deadline.
  const sla = computeTicketSla(t as HealthTicket, rules(t.priority as Priority), now)
  const breached = isActive(t.status) && sla.supplierBreached

  // Their latest submitted quote (if any) for this ticket.
  const latestQuote = ((myQuotes ?? []) as any[])[0] ?? null
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
  const declineReason = (invite as any)?.decline_reason ?? null
  const declinedBy = ((invite as any)?.declined_by ?? null) as 'supplier' | 'regional_manager' | null
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
  const reQuoteByRm = !!(invite as any)?.requote_requested_at && (invite as any)?.status === 'invited'
  // Map a quote's DB status to the read-only summary tone (accepted shows "Approved").
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'
  // Active quotes stay in the Quotes block; declined ones (by the RM or the supplier)
  // move to a collapsed "Archived quotes" block below.
  const myQuoteRows = (myQuotes ?? []) as any[]
  const activeQuotes = myQuoteRows.filter(q => q.status !== 'declined')
  const declinedMyQuotes = myQuoteRows.filter(q => q.status === 'declined')
  // The Quotes block is open through quoting / scheduling, then collapses once the
  // job is marked in progress (and every stage after). A phase-specific id + key
  // forces the collapse on the transition even though the section otherwise
  // remembers its open state across a refresh.
  const quotesLivePhase = ['assigned', 'assessment', 'quote_requested', 'quote_revision', 'quoted', 'accepted', 'scheduled'].includes(t.status)
  // Durable audit events for THIS supplier: every request-decline (survives re-invite)
  // and every quote-request round. RM quote-declines already come from the quote rows.
  const myDeclines = ((declineRows ?? []) as any[]).map(d => ({ name: supplierCompanyName ?? 'you', at: d.declined_at })).filter(d => d.at)
  // Each quote-request round shown once as "Quote requested". Rounds attributed to
  // this supplier are theirs; unattributed (legacy NULL) rounds only count as the
  // INITIAL invite (the earliest one) — later NULL rounds were re-assigns of OTHER
  // suppliers and must not show a spurious "Quote requested" on this supplier's trail.
  const allRequestRows = (requoteRows ?? []) as any[]
  const earliestRequestAt = allRequestRows.reduce<string | null>((m, r) => (r.requested_at && (!m || r.requested_at < m) ? r.requested_at : m), null)
  const myQuoteRequests = allRequestRows
    .filter(r => supplierIds.includes(r.supplier_id) || (r.supplier_id === null && r.requested_at === earliestRequestAt))
    .map(r => r.requested_at).filter(Boolean)
  // Trail starts at this supplier's EARLIEST involvement (first request / quote /
  // decline) — a re-invite resets invited_at to "now", so anchoring to it would hide
  // durable events from earlier rounds; the first quote request is the true start.
  const trailStartMs = [(invite as any)?.invited_at, ...myDeclines.map(d => d.at), ...myQuoteRequests, ...myQuoteRows.map(q => q.created_at)]
    .filter(Boolean).map(x => +new Date(x as string)).sort((a, b) => a - b)[0]
  const trailStartAt = trailStartMs ? new Date(trailStartMs).toISOString() : ((invite as any)?.invited_at ?? t.quote_requested_at)

  // COC/POC submissions split across blocks by state: under review → COC & POC,
  // rejected/snagged → Snag (kept for traceability), accepted → Completion.
  const allSignoffs = (signoffRows ?? []) as any[]
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
  for (const r of ((roundRows ?? []) as any[])) if (r.signoff_id) roundBySignoff.set(r.signoff_id, { round_no: r.round_no, kind: r.kind, reason: r.reason ?? null })
  const submissionLabel = (s: any) => `Submission #${roundBySignoff.get(s.id)?.round_no ?? submissionNo.get(s.id) ?? '?'}`
  // While the ticket is actively snagged, the latest snagged submission is the LIVE
  // snag — shown in its own block above Quotes so the supplier sees what to fix. Older
  // superseded rounds (and the snag once resubmitted) stay in the Archived block.
  const liveSnag = ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? (rejectedSignoffs[0] ?? null) : null
  const archivedSuperseded = supersededSubmissions.filter(s => s.id !== liveSnag?.id)

  // Variation orders raised on this ticket (drives the scheduled-phase VO gate and
  // the "no more variation orders" label). The most recent decline reason feeds the
  // vo_declined banner.
  const variations = (variationRows ?? []) as any[]
  const variationCount = variations.length
  const latestVoRejectReason = variations.find(v => v.status === 'rejected')?.reject_reason ?? null

  // Which collapsible block opens by default — the newest lifecycle phase.
  const phase: 'snag' | 'coc' | 'completion' | 'commercial' =
    ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? 'snag'
    : ['submitted_for_signoff', 'evidence_requested'].includes(t.status) ? 'coc'
    : ['approved_closeout', 'completed'].includes(t.status) ? 'completion'
    : 'commercial'

  // Decline the work — offered before award only (invite still invited/quoted).
  const canDecline = !awarded && !declinedForMe && !!invite && ['invited', 'quoted'].includes((invite as any).status)

  // Snag / evidence disputes. While one is OPEN the snag/evidence step is paused;
  // resolved ones live in the Archive. Messages are grouped by their dispute.
  const disputes = (disputeRows ?? []) as any[]
  const disputeMsgs = (disputeMsgRows ?? []) as any[]
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id).map(m => ({ ...m, evidence_urls: Array.isArray(m.evidence_urls) ? m.evidence_urls : [] }))
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/supplier/tickets" label="Back to tickets" />

      {/* Progress — bare, no card around it (same as RM). Hidden once this supplier
          was declined: the ticket's onward progress is no longer theirs. */}
      {!declinedForMe && <div className="px-1 pt-1"><RmPipeline status={supplierStatus} /></div>}

      {/* Ticket detail — same layout as the SM view */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            {(() => {
              const sm = rmStatusMeta(supplierStatus)
              // An open dispute (awarded supplier) overrides the badge with "Dispute" —
              // the snag/evidence step is paused until the manager resolves it.
              const disputing = awarded && !!openDispute
              const cls = disputing || declinedForMe ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls
              const label = disputing ? 'Dispute' : declinedForMe ? (declinedBy === 'supplier' ? 'Declined (you)' : declinedBy === 'regional_manager' ? 'Declined (Client)' : 'Declined') : sm.label
              return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{label}</span>
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {companyName && <DetailItem label="Company" value={companyName} />}
          <DetailItem label="Store" value={storeName} />
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
          <DetailItem label="Logged" value={formatDateTime(t.created_at)} />
          <DueDate dueAt={dueAt} overdue={overdue} now={now.toISOString()} />
          {latestQuote
            ? <DetailItem label="Quoted" value={formatDateTime(latestQuote.created_at)} />
            : quoteRequestedAt && <DetailItem label="Quote requested" value={formatDateTime(quoteRequestedAt)} />}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
          <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p>
        </div>

        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Photos</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {t.photo_urls.map((u: string, i: number) => <ViewTrackedLink key={i} ticketId={t.id} itemType="photo" itemLabel={`Photo ${i + 1}`} href={u} className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</ViewTrackedLink>)}
            </div>
          </div>
        )}

        {/* Scheduled visit — hidden once a snag fix is in play (that callout replaces it). */}
        {!declinedForMe && t.scheduled_at && !snagScheduleActive && (
          <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled{t.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}{scheduledTechName ? ` · ${scheduledTechName}` : ''}</p>
              {t.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Past the SLA window — awaiting the manager&apos;s acceptance.</p>}
            </div>
          </div>
        )}
        {/* Snag fix schedule — only shown once the manager approves the date (replaces
            the original Scheduled callout above). */}
        {!declinedForMe && snagFixApproved && (
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400">Snag fix scheduled</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(latestSnag.scheduled_at)}</p>
            </div>
          </div>
        )}

        <EditedLine at={t.edited_at} by={editorName} />
      </Card>

      {!declinedForMe && breached && <BreachReason nextAction={sla.nextAction} dueAt={sla.nextActionDueAt} owner="Supplier" />}

      {/* Dispute — the full dispute history for this ticket. An open dispute (live
          thread) sits at the top and pauses the snag / evidence step; resolved ones are
          kept read-only below with their outcome + message/evidence history. Opens by
          default only while a dispute is live. */}
      {awarded && disputes.length > 0 && (
        <CollapsibleSection id="ticket-dispute" title="Dispute" defaultOpen={!!openDispute}>
          {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="supplier" />}
          {resolvedDisputes.map(d => (
            <details key={d.id} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
              <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">Dispute — {d.origin === 'snag' ? 'snag' : 'evidence request'}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(d.resolved_at ?? d.created_at)}</p>
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${d.outcome === 'withdrawn' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>{d.outcome === 'withdrawn' ? 'Withdrawn' : 'Upheld'}</span>
              </summary>
              <div className="border-t border-[var(--border)] p-4">
                <DisputeThread ticketId={t.id} dispute={d} messages={msgsByDispute(d.id)} viewerRole="supplier" readOnly />
              </div>
            </details>
          ))}
        </CollapsibleSection>
      )}

      {/* Off the ticket → no "Next step", just why this quote request was declined. */}
      {declinedForMe ? (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          {/* "Quote declined" once they'd submitted a quote; otherwise the request itself. */}
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{latestQuote ? 'Quote declined' : 'Quote request declined'}{declinedByLabel}</p>
          <p className="text-sm text-[var(--text)]">{declineMessage}</p>
        </div>
      ) : (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Next step</h2>
          {/* The decline reason now lives in the Quotes block (on the declined quote);
              the Next step only prompts for the revised quote. */}
          {reQuoteByRm && canSubmitQuote && (
            <div className="rounded-lg bg-[#C6A35D]/10 ring-1 ring-[#C6A35D]/30 p-3 space-y-0.5">
              <p className="text-sm font-bold text-amber-700 dark:text-[#C6A35D]">The regional manager requested a re-quote</p>
              <p className="text-sm text-[var(--text-muted)]">Your previous quote request for this ticket was declined. Please submit a new quote below.</p>
            </div>
          )}
          {canSubmitQuote && <SendQuoteForm ticketId={t.id} competitive priority={t.priority} createdAt={t.created_at} />}
          {/* After the quote is approved → straight to "Mark in progress" (confirm).
              Variation orders come after the COC/POC is approved (close-out stage). */}
          {awarded && (t.status === 'accepted' || t.status === 'scheduled') && <MarkInProgressButton ticketId={t.id} />}
          {awarded && t.status === 'snag' && (
            <div className="space-y-3">
              {/* Shown after the RM declined a proposed snag-fix date — why, so the
                  supplier can pick a better one below. */}
              {latestSnag?.schedule_decline_reason && (
                <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Snag schedule declined</p>
                  <p className="text-sm text-[var(--text)]">{latestSnag.schedule_decline_reason}</p>
                  <p className="text-sm text-[var(--text-muted)]">Please propose a new date below.</p>
                </div>
              )}
              {openDispute ? (
                <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-3.5 text-sm text-[var(--text-muted)]">This snag is paused while your dispute is under review — continue the conversation in the Dispute section above.</div>
              ) : (
                <>
                  <AcceptSnagCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} />
                  <RaiseDisputeButton ticketId={t.id} origin="snag" />
                </>
              )}
            </div>
          )}
          {awarded && t.status === 'snag_assigned' && (
            latestSnag?.schedule_status === 'agreed'
              ? <StartSnagButton ticketId={t.id} />
              : <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 text-sm text-[var(--text-muted)]">Snag fix proposed{latestSnag?.scheduled_at ? ` for ${formatDateTime(latestSnag.scheduled_at)}` : ''} — awaiting the manager&apos;s approval before you can start.</div>
          )}
          {awarded && ['in_progress', 'snag_resolved', 'snag_in_progress', 'evidence_requested'].includes(t.status) && (
            <div className="space-y-3">
              {t.status === 'evidence_requested' && t.evidence_request_reason && (
                <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3 space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">More evidence requested</p>
                  <p className="text-sm text-[var(--text)]">{t.evidence_request_reason}</p>
                </div>
              )}
              {t.status === 'evidence_requested' && openDispute ? (
                <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-3.5 text-sm text-[var(--text-muted)]">The evidence request is paused while your dispute is under review — continue the conversation in the Dispute section above.</div>
              ) : (
                <>
                  <SubmitCompletionForm ticketId={t.id} evidenceRequested={t.status === 'evidence_requested'} requireBoth={t.status !== 'evidence_requested'} />
                  {t.status === 'evidence_requested' && <RaiseDisputeButton ticketId={t.id} origin="evidence" />}
                </>
              )}
            </div>
          )}
          {awarded && t.status === 'variation_review' && (
            <div className="rounded-xl bg-purple-500/10 ring-1 ring-purple-500/30 p-3.5 text-sm text-[var(--text-muted)]">Variation order submitted — awaiting approval from the regional manager.</div>
          )}
          {awarded && t.status === 'submitted_for_signoff' && (
            <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 text-sm text-[var(--text-muted)]">COC &amp; POC submitted — awaiting the regional manager&apos;s approval.</div>
          )}
          {/* Close-out stage → the supplier may raise a variation order for extra work;
              otherwise the RM does the final close-out. */}
          {awarded && (t.status === 'approved_closeout' || t.status === 'vo_declined') && (
            <SupplierVariationGate ticketId={t.id} priority={t.priority} createdAt={t.created_at} variationCount={variationCount} status={t.status as 'approved_closeout' | 'vo_declined'} declineReason={latestVoRejectReason} />
          )}
          {/* submit_quote is handled by SendQuoteForm above — exclude the duplicate button. */}
          {/* Scoped to this supplier's own state so a non-awarded supplier never sees
              actions triggered by another supplier's progress. */}
          <WorkflowActions ticketId={t.id} status={supplierStatus} role="supplier" exclude={['schedule', 'submit_completion', 'require_assessment', 'request_quote', 'submit_variation', 'start_work', 'accept_snag', 'start_snag', 'submit_quote']} />
          {/* Quote submitted and awaiting the manager's decision — reassure the supplier. */}
          {!awarded && latestQuote?.status === 'pending' && (
            <div className="rounded-xl bg-[#C6A35D]/10 ring-1 ring-[#C6A35D]/30 p-3.5 text-sm text-[var(--text-muted)]">
              Your quote has been submitted and is under review. We&apos;ll notify you as soon as the regional manager has responded — no action is needed from you in the meantime.
            </div>
          )}
          {/* Opt out of the job (before award) — separated from the primary actions */}
          {canDecline && <div className="pt-1"><DeclineWorkButton ticketId={t.id} /></div>}
        </Card>
      )}

      {/* Variation Orders — above the quotes block; full detail + attachments
          (pending / approved / declined). Opens by default while a VO is under
          review or has just been declined. */}
      {(variationRows ?? []).length > 0 && (
        <CollapsibleSection id="ticket-vos" title="Variation Orders" defaultOpen={['variation_review', 'vo_declined'].includes(t.status)}>
          {((variationRows ?? []) as any[]).map((v, i, arr) => {
            const st = v.status === 'approved' ? { label: 'Approved', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15' }
              : v.status === 'rejected' ? { label: 'Declined', ring: 'ring-red-500/40', bg: 'bg-red-500/5', badge: 'text-red-700 dark:text-red-400 bg-red-500/15' }
              : { label: 'Pending approval', ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', badge: 'text-amber-700 dark:text-[#C6A35D] bg-[#C6A35D]/15' }
            return (
              <div key={i} className={`rounded-xl ring-1 ${st.ring} ${st.bg} overflow-hidden`}>
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)]">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><FileText size={15} className="text-[#C6A35D] shrink-0" /><span className="truncate">{arr.length > 1 ? `Variation #${arr.length - i}` : 'Variation order'}</span></span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${st.badge}`}>{st.label}</span>
                </div>
                <div className="p-4 space-y-2">
                  {v.amount != null && <p className="text-base font-bold text-[var(--text)]">{formatCurrency(v.amount)}</p>}
                  {v.description && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{v.description}</p>}
                  {v.warranty && <p className="text-[11px] text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Warranty:</span> {v.warranty}</p>}
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p>
                  {v.status === 'rejected' && v.reject_reason && (
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was declined</p>
                      <p className="text-sm text-[var(--text)]">{v.reject_reason}</p>
                    </div>
                  )}
                  {Array.isArray(v.file_urls) && v.file_urls.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                      {v.file_urls.map((u: string, j: number) => <ViewTrackedLink key={j} ticketId={t.id} itemType="attachment" itemLabel={`${arr.length > 1 ? `Variation #${arr.length - i}` : 'Variation order'} attachment ${j + 1}`} href={u} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C6A35D] hover:underline"><FileText size={12} /> Attachment {j + 1}</ViewTrackedLink>)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CollapsibleSection>
      )}

      {/* COC & POC — the submission(s) currently under review. Sits ABOVE the Quotes
          block: it's the latest thing being worked on once the job reaches sign-off.
          Each card is collapsed by default (tap the row to reveal the detail). */}
      {pendingSignoffs.length > 0 && (
        <CollapsibleSection id="ticket-coc" title="COC & POC" defaultOpen={phase === 'coc'}>
          {pendingSignoffs.map(s => <SignoffCard key={s.id} s={s} ticketId={t.id} title={submissionLabel(s)} collapsible />)}
        </CollapsibleSection>
      )}

      {/* Snag — the current, active snag shown above Quotes so the supplier sees what
          to fix. Previous snag / evidence rounds live in the Archived block below. */}
      {liveSnag && (
        <CollapsibleSection id="ticket-snag" title="Snag" defaultOpen>
          <SignoffCard s={liveSnag} snag={latestSnag} ticketId={t.id} title={submissionLabel(liveSnag)} reason={roundBySignoff.get(liveSnag.id)?.reason ?? liveSnag.reject_reason} />
        </CollapsibleSection>
      )}

      {/* Quotes — active (pending / accepted) quotes only. Declined ones move to the
          Archived quotes block below. */}
      {activeQuotes.length > 0 && (
        // Open during quoting / before work starts; collapsed once the job is marked
        // in progress (and every stage after).
        <CollapsibleSection key={quotesLivePhase ? 'quotes-live' : 'quotes-done'} id={quotesLivePhase ? 'ticket-quotes' : 'ticket-quotes-done'} title="Quotes" defaultOpen={quotesLivePhase}>
          {activeQuotes.map((q, i, arr) => (
            <QuoteSummary
              key={q.id}
              title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'}
              status={quoteStatusOf(q.status)}
              ticketId={t.id}
              // Click-to-expand row (summary shows amount + status); the detail drops
              // down on click.
              collapsible
              quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at }}
              schedule={
                q.status === 'accepted' && t.scheduled_at
                  ? { at: t.scheduled_at, proposed: t.schedule_status === 'proposed', technician: scheduledTechName, audience: 'supplier' }
                  : q.proposed_schedule_at
                  ? { at: q.proposed_schedule_at, proposed: true, audience: 'supplier' }
                  : null
              }
            />
          ))}
        </CollapsibleSection>
      )}

      {/* Archived — one block holding both this supplier's declined quotes (by the RM
          or themselves) and every time they declined the quote request. The request
          declines are durable (kept even after the RM re-assigns them). */}
      {(declinedMyQuotes.length > 0 || ((declineRows ?? []) as any[]).length > 0 || archivedSuperseded.length > 0 || !!declinedSnag) && (
        <CollapsibleSection id="ticket-archive" title="Archived" defaultOpen={declinedBy === 'supplier'}>
          {/* Quotes — this supplier's quotes declined by the RM (or withdrawn). Each is
              a click-to-expand row; the detail shows the RM's decline reason in red. */}
          {declinedMyQuotes.length > 0 && (
            <ArchiveGroup label="Quotes">
              {declinedMyQuotes.map((q, i, arr) => (
                <QuoteSummary
                  key={q.id}
                  title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'}
                  status={quoteStatusOf(q.status)}
                  ticketId={t.id}
                  collapsible
                  declineReason={q.decline_reason ?? declineReason}
                  quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at, declinedAt: q.updated_at ?? null }}
                />
              ))}
            </ArchiveGroup>
          )}
          {/* Quote requests — every time this supplier declined the quote request
              (durable, kept even after the RM re-assigns them). */}
          {((declineRows ?? []) as any[]).length > 0 && (
            <ArchiveGroup label="Quote requests">
              {((declineRows ?? []) as any[]).map((d, i) => (
                <details key={`decline-${i}`} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
                  <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">Quote request declined by {supplierCompanyName ?? 'you'}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(d.declined_at)}</p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 bg-red-500/15 rounded-full px-2 py-0.5 shrink-0">Declined (you)</span>
                  </summary>
                  <div className="border-t border-[var(--border)] p-4">
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Reason</p>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">{d.reason || 'No reason provided.'}</p>
                    </div>
                  </div>
                </details>
              ))}
            </ArchiveGroup>
          )}
          {/* Submissions — superseded COC/POC sent back for more evidence or snagged.
              Each a collapsed "Submission #N" round card showing why it was returned.
              (The current live snag, if any, is shown in its own block above.) */}
          {archivedSuperseded.length > 0 && (
            <ArchiveGroup label="Submissions">
              {archivedSuperseded.map(s => (
                <SignoffCard key={s.id} s={s} ticketId={t.id} title={submissionLabel(s)} reason={roundBySignoff.get(s.id)?.reason ?? s.reject_reason} snag={s.status === 'rejected' && s.id === rejectedSignoffs[0]?.id ? latestSnag : null} collapsible />
              ))}
            </ArchiveGroup>
          )}
          {/* Snag schedule — a snag-fix date the RM declined, with the reason + when. */}
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
        </CollapsibleSection>
      )}

      {/* Completion — the approved COC & POC, created once sign-off is accepted */}
      {acceptedSignoff && (
        <CollapsibleSection id="ticket-completion" title="Completion" defaultOpen={phase === 'completion'}>
          <SignoffCard s={acceptedSignoff} ticketId={t.id} />
        </CollapsibleSection>
      )}

      {/* Only the AWARDED supplier posts updates — a still-competing supplier's note
          would otherwise surface in the awarded supplier's trail (they're isolated). */}
      {awarded && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Post an update</h2>
          <SupplierAttachments ticketId={t.id} />
        </Card>
      )}

      {/* Isolation: a supplier only ever sees THEIR OWN involvement. Until they're
          awarded the job, the trail is scoped to their invite + their own quote (no
          other supplier's progress). View events are always this supplier's own
          (filtered by viewer_id), so their trail shows the photos / attachments they
          opened without exposing another supplier's activity. Once awarded, it's their
          job and shows the full progression. */}
      {!awarded ? (
        <AuditTrail ticket={{
          createdAt: t.created_at,
          startAt: trailStartAt,
          quoteRequestedAt: (invite as any)?.invited_at ?? t.quote_requested_at,
          quoteRequests: myQuoteRequests.map(at => ({ at })),
          quoteSubmittedAt: latestQuote?.created_at ?? null,
          quotes: (myQuotes ?? []) as any[],
          supplierDeclines: myDeclines,
          views: (viewRows ?? []) as any[],
          supplierDeclinedAt: declinedForMe ? ((invite as any)?.responded_at ?? latestQuote?.updated_at ?? t.updated_at) : null,
        }} />
      ) : (
        <AuditTrail ticket={{
          createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
          startAt: trailStartAt,
          quoteRequestedAt: t.quote_requested_at, quoteRequests: myQuoteRequests.map(at => ({ at })),
          quoteSubmittedAt: latestQuote?.created_at ?? t.quote_submitted_at,
          quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
          scheduledAt: t.scheduled_at, completedAt: t.completed_at,
          editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, cancellationReason: t.cancellation_reason,
          snagScheduledAt, workStartedAt: t.attended_at ?? null,
          snagAcceptedAt: latestSnag?.assigned_at ?? null,
          snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
          snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
          quotes: (myQuotes ?? []) as any[], variations: (variationRows ?? []) as any[],
          disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
          supplierDeclines: myDeclines,
          signoffs: (signoffRows ?? []) as any[], updates: (updates ?? []) as any[],
          views: (viewRows ?? []) as any[],
        }} />
      )}
    </div>
  )
}
