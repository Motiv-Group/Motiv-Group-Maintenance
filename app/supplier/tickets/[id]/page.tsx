export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ClipboardCheck, FileText, Calendar, Clock, CheckCircle2, Info, ChevronDown } from 'lucide-react'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { BackLink } from '@/components/ui/BackLink'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { createAdminClient } from '@/lib/supabase/server'
import { signedUrl, signManyUrls } from '@/lib/storage'
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
import { CompletionBody, CompletionFooterNote } from '@/components/workflow/CompletionBody'
import { QuoteSummary, type QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import { MarkInProgressButton, DeclineWorkButton, AcceptSnagCard, StartSnagButton, SupplierVariationGate, SupplierQuoteBar, SupplierQuoteSubmittedActions } from '@/components/supplier/SupplierJobActions'
import { PopupForm } from '@/components/supplier/PopupForm'
import { RaiseDisputeButton, RaiseDisputeMore, DisputeThread, DisputeControls } from '@/components/dispute/DisputeBox'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { buildTicketTimeline } from '@/lib/ticket-timeline'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import { DetailTabs } from '@/components/ui/DetailTabs'
import { formatCurrency, formatDateTime, supplierStatusMeta, storeLabel, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

// Shown when the RM declined a quote without typing a reason.
const DEFAULT_DECLINE_REASON = 'Thank you for your submission. Although your quotation was not selected for this request, we value your participation and look forward to inviting you to future opportunities.'

// Tone for the submitted-completion (sign-off) card — mirrors QuoteSummary.
const SIGNOFF_META: Record<string, { label: string; ring: string; bg: string; head: string; badge: string; iconCls: string }> = {
  accepted: { label: 'Approved', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', head: 'bg-emerald-500/10 border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', iconCls: 'text-emerald-500' },
  rejected: { label: 'Rejected', ring: 'ring-red-500/40', bg: 'bg-red-500/5', head: 'bg-red-500/10 border-red-500/20', badge: 'bg-red-500/15 text-red-700 dark:text-red-400', iconCls: 'text-red-500' },
  evidence_requested: { label: 'More info requested', ring: 'ring-amber-500/40', bg: 'bg-amber-500/5', head: 'bg-amber-500/10 border-amber-500/20', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', iconCls: 'text-amber-500' },
  submitted: { label: 'Under review', ring: 'ring-[#C6A35D]/40', bg: 'bg-[#C6A35D]/5', head: 'bg-[#C6A35D]/10 border-[#C6A35D]/20', badge: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]', iconCls: 'text-[#C6A35D]' },
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
function SignoffCard({ s, snag, ticketId, collapsible = false, defaultOpen = false, title, reason, footer }: { s: any; snag?: { description?: string | null; required_correction?: string | null; severity?: string | null } | null; ticketId: string; collapsible?: boolean; defaultOpen?: boolean; title?: string; reason?: string | null; footer?: React.ReactNode }) {
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
        <CompletionBody ticketId={ticketId} beforeUrls={before} afterUrls={after} cocUrl={s.coc_url} invoiceUrl={s.invoice_url} notes={s.notes} uploadedAt={s.created_at} />
    </>
  )
  // Collapsed by default — tap the "Completion · … / Under review" row to reveal
  // the proof-of-completion, COC and notes.
  if (collapsible) {
    return (
      <details open={defaultOpen} className="group rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">{header}</span>
          <ChevronDown size={16} className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180" />
        </summary>
        <div className={`p-4 space-y-4 border-t border-[var(--border)]`}>{body}</div>
        {footer && <div className={`border-t border-[var(--border)] px-4 py-3`}>{footer}</div>}
      </details>
    )
  }
  return (
    <div className={`rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)]`}>{header}</div>
      <div className="p-4 space-y-4">{body}</div>
      {footer && <div className={`border-t border-[var(--border)] px-4 py-3`}>{footer}</div>}
    </div>
  )
}

export default async function SupplierTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Overlap the auth gate with the ticket fetch (admin client needs no user ctx)
  // — one round-trip wave instead of two on every detail-page load.
  const admin = createAdminClient()
  const [{ supplierIds, userId }, { data: t }] = await Promise.all([
    requireSupplierV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
  ])
  // Access is by ASSIGNMENT, not company (a Motiv/pool supplier works client tickets
  // they don't belong to). The awarded/invite check below is the real gate.
  if (!t) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }, { data: invite }, { data: myQuotes }, { data: technicianRows }, { data: signoffRows }, { data: snagRows }, { data: companyRow }, { data: variationRows }, { data: viewRows }, { data: declineRows }, { data: requoteRows }, { data: roundRows }, { data: disputeRows }, { data: disputeMsgRows }, { data: snagEventRows }, { data: disputeExtra }] = await Promise.all([
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
    // Newer per-dispute columns (signoff link + pending proposal) fetched separately so
    // the dispute block still works if those columns aren't migrated yet (query fails → null).
    admin.from('ticket_disputes').select('id, signoff_id, pending_outcome, pending_by').eq('ticket_id', t.id),
  ])
  // Private-bucket signing: rewrite every stored ticket-photo / COC / attachment /
  // evidence URL to a short-lived signed URL in place, so all the render sites below
  // (ticket photos, signoff cards, quotes, variations, disputes) get readable links.
  if (Array.isArray(t.photo_urls)) t.photo_urls = await signManyUrls(t.photo_urls as string[])
  await Promise.all([
    ...((signoffRows ?? []) as any[]).map(async s => {
      if (Array.isArray(s.before_urls)) s.before_urls = await signManyUrls(s.before_urls)
      if (Array.isArray(s.after_urls)) s.after_urls = await signManyUrls(s.after_urls)
      s.coc_url = await signedUrl(s.coc_url)
      s.invoice_url = await signedUrl(s.invoice_url)
    }),
    ...((myQuotes ?? []) as any[]).map(async q => { q.file_url = await signedUrl(q.file_url) }),
    ...((variationRows ?? []) as any[]).map(async v => { if (Array.isArray(v.file_urls)) v.file_urls = await signManyUrls(v.file_urls) }),
    ...((disputeMsgRows ?? []) as any[]).map(async m => { if (Array.isArray(m.evidence_urls)) m.evidence_urls = await signManyUrls(m.evidence_urls) }),
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
  // "Store · Branch" label shown on the raise-dispute pop-up's subject card.
  const disputeStore = [storeName, (store as any)?.branch_code].filter(Boolean).join(' · ') || null
  const editorName = t.edited_by ? ((await admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single()).data?.full_name ?? null) : null
  // Standalone Individual (home) job — no company/store. Load the customer's name +
  // contact so the supplier can arrange the home visit.
  const customer = (!t.company_id && t.created_by)
    ? ((await admin.from('user_profiles').select('full_name, phone, address').eq('id', t.created_by).maybeSingle()).data as { full_name: string | null; phone: string | null; address: string | null } | null)
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
  // Reason the RM declined the previous quote — shown on the re-quote prompt.
  const requoteReason = declinedMyQuotes[0]?.decline_reason ?? declineReason
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
  // An outstanding "more evidence" request stays in the Completion tab (not History)
  // until the supplier re-submits — then it's superseded and moves to the Archive.
  const liveEvidence = t.status === 'evidence_requested' ? (evidenceRequestedSignoffs[0] ?? null) : null
  const archivedSuperseded = supersededSubmissions.filter(s => s.id !== liveSnag?.id && s.id !== liveEvidence?.id)

  // Variation orders raised on this ticket (drives the scheduled-phase VO gate and
  // the "no more variation orders" label). The most recent decline reason feeds the
  // vo_declined banner.
  const variations = (variationRows ?? []) as any[]
  const variationCount = variations.length
  const latestVoRejectReason = variations.find(v => v.status === 'rejected')?.reject_reason ?? null

  // Decline the work — offered before award only (invite still invited/quoted).
  const canDecline = !awarded && !declinedForMe && !!invite && ['invited', 'quoted'].includes((invite as any).status)

  // Snag / evidence disputes. While one is OPEN the snag/evidence step is paused;
  // resolved ones live in the Archive. Messages are grouped by their dispute.
  const disputeExtraById = new Map(((disputeExtra ?? []) as any[]).map(x => [x.id, x]))
  const disputes = ((disputeRows ?? []) as any[]).map(d => ({ ...d, ...(disputeExtraById.get(d.id) ?? {}) }))
  const disputeMsgs = (disputeMsgRows ?? []) as any[]
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id).map(m => ({ ...m, evidence_urls: Array.isArray(m.evidence_urls) ? m.evidence_urls : [] }))
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')
  // What each dispute is about — the disputed "Submission #N" + snag / evidence request.
  const disputeSubject = (d: any) => {
    if (d.origin === 'variation') return 'Variation order · declined'
    const n = d.signoff_id ? submissionNo.get(d.signoff_id) : null
    const what = d.origin === 'snag' ? 'snag' : 'evidence request'
    return n ? `Submission #${n} · ${what}` : what
  }
  // While a dispute is open the paused step's action area shows the resolve controls
  // (the chat + reply live in the Dispute tab). Reused for snag / evidence / VO.
  const disputeAction = openDispute ? (
    <div className="space-y-2.5">
      <p className="text-sm text-[var(--text-muted)]">This step is paused while the dispute is reviewed. Resolve it here, or keep the conversation going in the <span className="font-semibold text-[var(--text)]">Dispute</span> tab.</p>
      <DisputeControls ticketId={t.id} origin={openDispute.origin} viewerRole="supplier" pendingOutcome={openDispute.pending_outcome ?? null} pendingBy={openDispute.pending_by ?? null} />
    </div>
  ) : null

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

  // ── Lower tabbed section (mirrors the RM ticket detail). Each tab's content, or
  // null when it has nothing — DetailTabs drops the empty ones. ──────────────────
  const totalPhotos = Array.isArray(t.photo_urls) ? (t.photo_urls as string[]).length : 0
  const photosTab = totalPhotos > 0
    ? <PhotoThumbs urls={t.photo_urls as string[]} ticketId={t.id} />
    : null
  // Quotes tab: active quotes (pending / approved). While the supplier is still
  // (re-)quoting, also show the declined quote(s) with the reason; once a quote is
  // approved or the request closes, declined quotes move to History instead.
  const quoteTabRows = canSubmitQuote ? [...activeQuotes, ...declinedMyQuotes] : activeQuotes
  const historyDeclinedQuotes = canSubmitQuote ? [] : declinedMyQuotes
  const quotesTab = quoteTabRows.length > 0
    ? (<div className="space-y-2">{quoteTabRows.map((q, i, arr) => (
        <QuoteSummary key={q.id} title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'} status={quoteStatusOf(q.status)} ticketId={t.id} collapsible declineReason={q.decline_reason ?? declineReason}
          quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at }}
          schedule={q.status === 'accepted' && t.scheduled_at ? { at: t.scheduled_at, proposed: t.schedule_status === 'proposed', technician: scheduledTechName, audience: 'supplier' } : q.proposed_schedule_at ? { at: q.proposed_schedule_at, proposed: true, audience: 'supplier' } : null} />
      ))}</div>)
    : null
  const completionTab = (liveEvidence || pendingSignoffs.length > 0 || acceptedSignoff)
    ? (<div className="space-y-3">
        {liveEvidence && <SignoffCard s={liveEvidence} ticketId={t.id} title={submissionLabel(liveEvidence)} reason={roundBySignoff.get(liveEvidence.id)?.reason ?? liveEvidence.reject_reason} collapsible defaultOpen />}
        {pendingSignoffs.map(s => <SignoffCard key={s.id} s={s} ticketId={t.id} title={submissionLabel(s)} collapsible defaultOpen footer={<CompletionFooterNote>You will be notified once the Regional Manager has reviewed and signed off.</CompletionFooterNote>} />)}
        {acceptedSignoff && <SignoffCard s={acceptedSignoff} ticketId={t.id} collapsible />}
      </div>)
    : null
  const snagTab = liveSnag
    ? <SignoffCard s={liveSnag} snag={latestSnag} ticketId={t.id} title={submissionLabel(liveSnag)} reason={roundBySignoff.get(liveSnag.id)?.reason ?? liveSnag.reject_reason} />
    : null
  const voTab = variations.length > 0
    ? (<div className="space-y-3">{variations.map((v, i, arr) => {
        const st = v.status === 'approved' ? { label: 'Approved', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/5', badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15' }
          : v.status === 'rejected' ? { label: 'Declined', ring: 'ring-red-500/40', bg: 'bg-red-500/5', badge: 'text-red-700 dark:text-red-400 bg-red-500/15' }
          : { label: 'Pending approval', ring: 'ring-amber-500/40', bg: 'bg-amber-500/5', badge: 'text-amber-700 dark:text-amber-400 bg-amber-500/15' }
        return (
          <div key={i} className={`rounded-xl ring-1 ${st.ring} ${st.bg} overflow-hidden`}>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)]">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><FileText size={15} className="text-blue-600 dark:text-blue-400 shrink-0" /><span className="truncate">{arr.length > 1 ? `Variation #${arr.length - i}` : 'Variation order'}</span></span>
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
                  {v.file_urls.map((u: string, j: number) => <ViewTrackedLink key={j} ticketId={t.id} itemType="attachment" itemLabel={`${arr.length > 1 ? `Variation #${arr.length - i}` : 'Variation order'} attachment ${j + 1}`} href={u} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={12} /> Attachment {j + 1}</ViewTrackedLink>)}
                </div>
              )}
            </div>
          </div>
        )
      })}</div>)
    : null
  const disputeTab = (awarded && disputes.length > 0)
    ? (<div className="space-y-3">
        {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="supplier" subject={disputeSubject(openDispute)} hideControls />}
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
              <DisputeThread ticketId={t.id} dispute={d} messages={msgsByDispute(d.id)} viewerRole="supplier" readOnly subject={disputeSubject(d)} />
            </div>
          </details>
        ))}
      </div>)
    : null
  const activityTab = (awarded || ((updates ?? []) as any[]).length > 0)
    ? (<div className="space-y-4">
        {awarded && <div><h3 className="text-sm font-bold text-[var(--text)] mb-3">Post an update</h3><SupplierAttachments ticketId={t.id} /></div>}
        {((updates ?? []) as any[]).length > 0 && (
          <div>
            {((updates ?? []) as any[]).map((u, i) => (
              <div key={i} className="border-b border-[var(--border)] py-2.5 last:border-0">
                <p className="text-sm text-[var(--text)] whitespace-pre-line">{u.body}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{u.author_role === 'supplier' ? 'You' : 'Client'} · {formatDateTime(u.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>)
    : null
  const archiveTab = (historyDeclinedQuotes.length > 0 || ((declineRows ?? []) as any[]).length > 0 || archivedSuperseded.length > 0 || !!declinedSnag)
    ? (<div className="space-y-4">
        {historyDeclinedQuotes.length > 0 && (
          <ArchiveGroup label="Quotes">
            {historyDeclinedQuotes.map((q, i, arr) => (
              <QuoteSummary key={q.id} title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'} status={quoteStatusOf(q.status)} ticketId={t.id} collapsible declineReason={q.decline_reason ?? declineReason}
                quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at, declinedAt: q.updated_at ?? null }} />
            ))}
          </ArchiveGroup>
        )}
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
        {archivedSuperseded.length > 0 && (
          <ArchiveGroup label="Submissions">
            {archivedSuperseded.map(s => (
              <SignoffCard key={s.id} s={s} ticketId={t.id} title={submissionLabel(s)} reason={roundBySignoff.get(s.id)?.reason ?? s.reject_reason} snag={s.status === 'rejected' && s.id === rejectedSignoffs[0]?.id ? latestSnag : null} collapsible />
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
      </div>)
    : null
  // Full life-of-ticket timeline — same shared layout as the RM detail (dot +
  // connecting line, friendly SM-style voice). Built from the same audit inputs
  // that used to feed AuditTrail.
  const supplierTimelineInput = !awarded
    ? {
        createdAt: t.created_at, startAt: trailStartAt,
        quoteRequestedAt: (invite as any)?.invited_at ?? t.quote_requested_at,
        quoteRequests: myQuoteRequests.map(at => ({ at })),
        requoteRequestedAt: (invite as any)?.requote_requested_at ?? null,
        quoteSubmittedAt: latestQuote?.created_at ?? null,
        editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note,
        infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
        quotes: (myQuotes ?? []) as any[], supplierDeclines: myDeclines, views: (viewRows ?? []) as any[],
        supplierDeclinedAt: declinedForMe ? ((invite as any)?.responded_at ?? latestQuote?.updated_at ?? t.updated_at) : null,
      }
    : {
        createdAt: t.created_at, status: t.status, updatedAt: t.updated_at, startAt: trailStartAt,
        quoteRequestedAt: t.quote_requested_at, quoteRequests: myQuoteRequests.map(at => ({ at })),
        requoteRequestedAt: (invite as any)?.requote_requested_at ?? null,
        quoteSubmittedAt: latestQuote?.created_at ?? t.quote_submitted_at,
        quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
        scheduledAt: t.scheduled_at, completedAt: t.completed_at,
        infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
        editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note, cancellationReason: t.cancellation_reason,
        snagScheduledAt, workStartedAt: t.attended_at ?? null,
        snagAcceptedAt: latestSnag?.assigned_at ?? null, snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
        snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
        snagScheduleEvents: (snagEventRows ?? []) as any[],
        quotes: (myQuotes ?? []) as any[], variations: (variationRows ?? []) as any[],
        disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
        disputeMessages: disputeMsgs.map((m: any) => ({ author_role: m.author_role, body: m.body, created_at: m.created_at })),
        supplierDeclines: myDeclines, signoffs: (signoffRows ?? []) as any[], updates: (updates ?? []) as any[], views: (viewRows ?? []) as any[],
      }
  // Default (neutral) labels + actor — the RM-voice rmFriendlyLabel says "You
  // requested quotes", which is wrong from the supplier's side (the client/RM
  // requested them). The default labels read "Quote requested" with the actor.
  const timelineItems = buildTicketTimeline(supplierTimelineInput)
  const timelineTab = <TicketTimeline items={timelineItems} />

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/supplier/tickets" label="Back to tickets" />

      {/* Header — stepper + ref/title/badges (same layout as the RM ticket detail). */}
      <Card className="p-5 space-y-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.category || t.title}</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            {(() => {
              const sm = supplierStatusMeta(supplierStatus)
              // An open dispute (awarded supplier) overrides the badge with "Dispute" —
              // the snag/evidence step is paused until the manager resolves it.
              const disputing = awarded && !!openDispute
              const cls = disputing || declinedForMe ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls
              const label = disputing ? 'Dispute' : declinedForMe ? (declinedBy === 'supplier' ? 'Declined (you)' : declinedBy === 'regional_manager' ? 'Declined (Client)' : 'Declined') : sm.label
              return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{label}</span>
            })()}
          </div>
        </div>
        {!declinedForMe && <RmPipeline status={supplierStatus} />}
      </Card>
      {/* Off the ticket → no "Next step", just why this quote request was declined. */}
      {declinedForMe ? (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          {/* "Quote declined" once they'd submitted a quote; otherwise the request itself. */}
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{latestQuote ? 'Quote declined' : 'Quote request declined'}{declinedByLabel}</p>
          <p className="text-sm text-[var(--text)]">{declineMessage}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 items-stretch">
        {/* Next action */}
        <Card className="p-5 space-y-4 h-full">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Next action</h2>
            {nextAction.msg && <p className="mt-1 text-sm font-bold text-[var(--text)]">{nextAction.msg}</p>}
            {/* When breached the instruction moves into the red callout below. */}
            {nextAction.sub && !breached && t.status !== 'completed' && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{nextAction.sub}</p>}
          </div>

          {/* Completed — a clear green sign-off callout (mirrors the RM page). */}
          {t.status === 'completed' && (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm text-[var(--text-muted)]">This job is <span className="font-semibold text-emerald-600 dark:text-emerald-400">complete</span> — the completion certificate and proof of completion have been approved and signed off. No further action is needed.</p>
            </div>
          )}

          {/* SLA breach — concise callout inside the action block (same as the RM). */}
          {breached && <BreachReason action={nextAction.sub || nextAction.msg || 'This job is overdue — take the next action to get it back on track.'} dueAt={sla.nextActionDueAt} nowMs={now.getTime()} />}
          {/* The decline reason now lives in the Quotes block (on the declined quote);
              the Next step only prompts for the revised quote. */}
          {reQuoteByRm && canSubmitQuote && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3 flex items-start gap-2.5">
              <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">The regional manager requested a re-quote</p>
                {requoteReason && <p className="text-sm font-medium text-red-600 dark:text-red-400"><span className="font-semibold">Reason declined:</span> {requoteReason}</p>}
                <p className="text-sm text-[var(--text-muted)]">Your previous quote request for this ticket was declined. Please submit a new quote below.</p>
              </div>
            </div>
          )}
          {canSubmitQuote && <SupplierQuoteBar ticketId={t.id} priority={t.priority} createdAt={t.created_at} canDecline={canDecline} decline={declineDetails} />}
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
                disputeAction
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1"><AcceptSnagCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} /></div>
                  <RaiseDisputeMore ticketId={t.id} origin="snag" subjectTitle={latestSnag?.description ?? latestSnag?.required_correction ?? 'Snag raised'} jobRef={t.job_ref} store={disputeStore} />
                </div>
              )}
            </div>
          )}
          {awarded && t.status === 'snag_assigned' && (
            latestSnag?.schedule_status === 'agreed'
              ? <StartSnagButton ticketId={t.id} />
              : <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5"><Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" /><p className="text-sm text-[var(--text-muted)]">Snag fix proposed{latestSnag?.scheduled_at ? ` for ${formatDateTime(latestSnag.scheduled_at)}` : ''} — awaiting the manager&apos;s approval before you can start.</p></div>
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
                disputeAction
              ) : (
                <div className={t.status === 'evidence_requested' ? 'flex flex-col gap-2 sm:flex-row sm:items-start' : ''}>
                  <div className={t.status === 'evidence_requested' ? 'flex-1' : ''}>
                    <PopupForm label={t.status === 'evidence_requested' ? 'Upload more evidence' : 'Upload COC & POC'} tone="primary"><SubmitCompletionForm defaultOpen ticketId={t.id} evidenceRequested={t.status === 'evidence_requested'} requireBoth={t.status !== 'evidence_requested'} /></PopupForm>
                  </div>
                  {t.status === 'evidence_requested' && <RaiseDisputeMore ticketId={t.id} origin="evidence" subjectTitle="More evidence requested" jobRef={t.job_ref} store={disputeStore} />}
                </div>
              )}
            </div>
          )}
          {awarded && t.status === 'variation_review' && (
            <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
              <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--text-muted)]">Variation order submitted — awaiting approval from the regional manager.</p>
            </div>
          )}
          {awarded && t.status === 'submitted_for_signoff' && (
            <div className="rounded-lg bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-500"><Clock size={20} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text)]">Certificate and proof of completion submitted</p>
                  {pendingSignoffs[0]?.created_at && <p className="mt-0.5 text-[13px] text-[var(--text-faint)]">{formatDateTime(pendingSignoffs[0].created_at)}</p>}
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Awaiting Regional Manager approval.</p>
                  <p className="text-sm text-[var(--text-muted)]">You will be notified when a decision is made.</p>
                </div>
              </div>
            </div>
          )}
          {/* Close-out stage → the supplier may raise a variation order for extra work;
              otherwise the RM does the final close-out. On a declined VO the supplier
              can also dispute the decline (paused while the dispute is open). */}
          {awarded && (t.status === 'approved_closeout' || t.status === 'vo_declined') && (
            openDispute && t.status === 'vo_declined' ? (
              disputeAction
            ) : (
              <div className="space-y-3">
                <SupplierVariationGate ticketId={t.id} priority={t.priority} createdAt={t.created_at} variationCount={variationCount} status={t.status as 'approved_closeout' | 'vo_declined'} declineReason={latestVoRejectReason} noVosConfirmed={!!t.vo_none_confirmed_at} />
                {t.status === 'vo_declined' && !openDispute && <RaiseDisputeButton ticketId={t.id} origin="variation" subjectTitle="Variation order declined" jobRef={t.job_ref} store={disputeStore} />}
              </div>
            )
          )}
          {/* submit_quote is handled by SendQuoteForm above — exclude the duplicate button. */}
          {/* Scoped to this supplier's own state so a non-awarded supplier never sees
              actions triggered by another supplier's progress. */}
          <WorkflowActions ticketId={t.id} status={supplierStatus} role="supplier" exclude={['schedule', 'submit_completion', 'require_assessment', 'request_quote', 'submit_variation', 'start_work', 'accept_snag', 'start_snag', 'submit_quote']} />
          {/* Quote submitted and awaiting the manager's decision. */}
          {!awarded && latestQuote?.status === 'pending' && (
            <div className="space-y-4">
              <div>
                <p className="flex items-center gap-2 text-base font-bold text-[var(--text)]"><CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> Quote submitted</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Thank you! Your quote has been submitted to the regional manager for review.</p>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
                <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="text-sm text-[var(--text-muted)]">You will be notified of any updates on this ticket.</p>
              </div>
              <SupplierQuoteSubmittedActions ticketId={t.id} canDecline={canDecline} decline={declineDetails}
                quote={latestQuote ? { id: latestQuote.id, amount: latestQuote.amount, amountInclVat: latestQuote.amount_incl_vat ?? null, description: latestQuote.description ?? null, fileUrl: latestQuote.file_url ?? null, validUntil: latestQuote.valid_until ?? null, createdAt: latestQuote.created_at } : null}
                schedule={latestQuote?.proposed_schedule_at ? { at: latestQuote.proposed_schedule_at, proposed: true, audience: 'supplier' } : null} />
            </div>
          )}
          {/* Opt out of the job (before award). When the quote bar / submitted block is
              showing it already carries Decline work in its "More" menu, so only render
              it standalone for the (rare) states where the supplier can decline but has
              neither the quote bar nor the submitted block. */}
          {canDecline && !canSubmitQuote && !(latestQuote?.status === 'pending') && <div className="pt-1"><DeclineWorkButton ticketId={t.id} {...declineDetails} /></div>}
        </Card>
        {/* Ticket information — aligned label→value rows, then description + callouts. */}
        <Card className="p-5 space-y-4 h-full">
          <h2 className="text-sm font-bold text-[var(--text)]">Ticket information</h2>
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-2.5 text-sm">
            {companyName && <><dt className="text-[var(--text-muted)]">Company</dt><dd className="font-medium text-[var(--text)]">{companyName}</dd></>}
            {store?.name && <><dt className="text-[var(--text-muted)]">Store</dt><dd className="font-medium text-[var(--text)]">{storeName}</dd></>}
            {customer && <><dt className="text-[var(--text-muted)]">Customer</dt><dd className="font-medium text-[var(--text)]">{customer.full_name || 'Individual'}</dd></>}
            {customer?.phone && <><dt className="text-[var(--text-muted)]">Phone</dt><dd className="font-medium text-[var(--text)]">{customer.phone}</dd></>}
            {customer?.address && <><dt className="text-[var(--text-muted)]">Address</dt><dd className="font-medium text-[var(--text)]">{customer.address}</dd></>}
            <dt className="text-[var(--text-muted)]">Category</dt><dd className="font-medium text-[var(--text)]">{t.category ?? 'General'}</dd>
            <dt className="text-[var(--text-muted)]">Operational impact</dt><dd className="font-medium text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'}</dd>
            <dt className="text-[var(--text-muted)]">Logged</dt><dd className="font-medium text-[var(--text)]">{formatDateTime(t.created_at)}</dd>
            <dt className="text-[var(--text-muted)]">Due</dt><dd className={`font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{formatDateTime(dueAt)}</dd>
            {latestQuote
              ? <><dt className="text-[var(--text-muted)]">Quoted</dt><dd className="font-medium text-[var(--text)]">{formatDateTime(latestQuote.created_at)}</dd></>
              : quoteRequestedAt && <><dt className="text-[var(--text-muted)]">Quote requested</dt><dd className="font-medium text-[var(--text)]">{formatDateTime(quoteRequestedAt)}</dd></>}
          </dl>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p>
          </div>
          {/* Scheduled visit — hidden once a snag fix is in play (that callout replaces it). */}
          {t.scheduled_at && !snagScheduleActive && (
            <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
              <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled{t.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
                <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}{scheduledTechName ? ` · ${scheduledTechName}` : ''}</p>
                {t.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Past the SLA window — awaiting the manager&apos;s acceptance.</p>}
              </div>
            </div>
          )}
          {snagFixApproved && (
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
        </div>
      )}
      {/* Lower tabbed section — same look as the RM ticket detail; empty tabs drop.
          Opens on the tab matching where the ticket is in the process (DetailTabs
          falls back to the first available tab if the chosen one has no content). */}
      <DetailTabs
        initial={
          openDispute ? 'dispute'
          : ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? 'snag'
          : ['variation_review', 'vo_declined'].includes(t.status) ? 'variations'
          : ['submitted_for_signoff', 'evidence_requested', 'approved_closeout', 'completed'].includes(t.status) ? 'completion'
          : (canSubmitQuote || ['quoted', 'accepted'].includes(t.status)) ? 'quotes'
          : (totalPhotos ? 'photos' : quotesTab ? 'quotes' : 'timeline')
        }
        tabs={[
          { key: 'photos', label: `Photos${totalPhotos ? ` (${totalPhotos})` : ''}`, content: photosTab },
          { key: 'quotes', label: 'Quotes', content: quotesTab },
          { key: 'completion', label: 'Completion', content: completionTab },
          { key: 'variations', label: 'Variation Orders', content: voTab },
          { key: 'snag', label: 'Snag', content: snagTab },
          { key: 'dispute', label: 'Dispute', content: disputeTab },
          { key: 'activity', label: `Activity${((updates ?? []) as any[]).length ? ` (${((updates ?? []) as any[]).length})` : ''}`, content: activityTab },
          { key: 'archive', label: 'History', content: archiveTab },
          { key: 'timeline', label: 'Timeline', content: timelineTab },
        ]}
      />
    </div>
  );
}
