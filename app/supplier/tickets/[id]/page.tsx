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
import { ScheduleJobCard, DeclineWorkButton, AcceptSnagCard, StartSnagButton, AssignTechnicianButton } from '@/components/supplier/SupplierJobActions'
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

// One COC & POC submission card — reused across the COC/POC, Snag and Completion
// blocks. `snag` enriches a rejected submission with the "why it was sent back" reason.
function SignoffCard({ s, snag }: { s: any; snag?: { description?: string | null; required_correction?: string | null; severity?: string | null } | null }) {
  const meta = SIGNOFF_META[s.status] ?? SIGNOFF_META.submitted
  const before = (s.before_urls ?? []) as string[]
  const after = (s.after_urls ?? []) as string[]
  return (
    <div className={`rounded-xl ring-1 ${meta.ring} ${meta.bg} overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b ${meta.head}`}>
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><ClipboardCheck size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">Completion · {formatDateTime(s.created_at)}</span></span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${meta.badge}`}>{meta.label}</span>
      </div>
      <div className="p-4 space-y-3">
        {s.status === 'rejected' && (s.reject_reason || snag?.description || snag?.required_correction) && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
            {(s.reject_reason || snag?.description) && <p className="text-sm text-[var(--text)]">{s.reject_reason || snag?.description}</p>}
            {snag?.required_correction && <p className="text-sm text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Required correction:</span> {snag.required_correction}</p>}
            {snag?.severity && <p className="text-[11px] text-[var(--text-muted)] capitalize">Severity: {String(snag.severity).replace(/_/g, ' ')}</p>}
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Proof of completion</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {before.map((u, j) => <a key={`b${j}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Before {j + 1}</a>)}
            {after.map((u, j) => <a key={`a${j}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">After {j + 1}</a>)}
            {!before.length && !after.length && <span className="text-sm text-[var(--text-faint)]">No photos uploaded</span>}
          </div>
        </div>
        {(s.coc_url || s.invoice_url) && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Certificate of Completion</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {s.coc_url && <a href={s.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View COC</a>}
              {s.invoice_url && <a href={s.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><FileText size={14} /> View invoice</a>}
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

export default async function SupplierTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || t.company_id !== companyId) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }, { data: invite }, { data: myQuotes }, { data: technicianRows }, { data: signoffRows }, { data: snagRows }, { data: companyRow }, { data: variationRows }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason, responded_at, declined_by').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
    admin.from('quotes').select('id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, created_at, updated_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('technicians').select('id, name').in('supplier_id', supplierIds).eq('active', true).order('name'),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', t.id).in('supplier_id', supplierIds).order('created_at', { ascending: false }),
    admin.from('snags').select('description, required_correction, severity, status, scheduled_at, schedule_status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    admin.from('ticket_variations').select('description, amount, status, reject_reason, created_at, file_urls').eq('ticket_id', t.id).order('created_at', { ascending: false }),
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
  const quoteableStatus = ['assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(t.status)
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
  // A client decline (chose another supplier) always shows the courteous "not
  // selected" message, never the internal reason; otherwise fall back to it too.
  const declineMessage = declinedBy === 'regional_manager' ? DEFAULT_DECLINE_REASON : (declineReason || DEFAULT_DECLINE_REASON)
  // This supplier's OWN view of the status — never leak another supplier's progress
  // (e.g. the ticket reading "Quoted" because a different supplier quoted). Awarded →
  // the real status; their own quote in → "Quoted"; nothing submitted → "Quote requested".
  const supplierStatus = awarded ? t.status : (latestQuote?.status === 'pending' ? 'quoted' : 'quote_requested')
  // Soft decline where the RM asked this supplier to submit a revised quote (audit trail).
  const requoteRequestedAt = (latestQuote?.status === 'declined' && (invite as any)?.status === 'invited' && (invite as any)?.decline_reason)
    ? ((invite as any)?.responded_at ?? latestQuote?.updated_at ?? null) : null
  // Map a quote's DB status to the read-only summary tone (accepted shows "Approved").
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'

  // COC/POC submissions split across blocks by state: under review → COC & POC,
  // rejected/snagged → Snag (kept for traceability), accepted → Completion.
  const allSignoffs = (signoffRows ?? []) as any[]
  const pendingSignoffs = allSignoffs.filter(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status))
  const rejectedSignoffs = allSignoffs.filter(s => s.status === 'rejected')
  const acceptedSignoff = allSignoffs.find(s => s.status === 'accepted') ?? null

  // Which collapsible block opens by default — the newest lifecycle phase.
  const phase: 'snag' | 'coc' | 'completion' | 'commercial' =
    ['snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved'].includes(t.status) ? 'snag'
    : ['submitted_for_signoff', 'evidence_requested'].includes(t.status) ? 'coc'
    : ['approved_closeout', 'completed'].includes(t.status) ? 'completion'
    : 'commercial'

  // Decline the work — offered before award only (invite still invited/quoted).
  const canDecline = !awarded && !declinedForMe && !!invite && ['invited', 'quoted'].includes((invite as any).status)

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/supplier/tickets" label="Back to tickets" />

      {/* Progress — bare, no card around it (same as RM). Hidden once this supplier
          was declined: the ticket's onward progress is no longer theirs. */}
      {!declinedForMe && <div className="px-1 pt-1"><RmPipeline status={t.status} /></div>}

      {/* Ticket detail — same layout as the SM view */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            {(() => { const sm = rmStatusMeta(supplierStatus); const cls = declinedForMe ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls; return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${cls}`}>{declinedForMe ? (declinedBy === 'supplier' ? 'Declined (you)' : declinedBy === 'regional_manager' ? 'Declined (Client)' : 'Declined') : sm.label}</span> })()}
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

        {/* Scheduled visit — its own callout in the ticket detail block. */}
        {!declinedForMe && t.scheduled_at && (
          <div className="flex items-center gap-2.5 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 dark:text-indigo-400">Scheduled{t.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(t.scheduled_at)}{scheduledTechName ? ` · ${scheduledTechName}` : ''}</p>
              {t.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Past the SLA window — awaiting the manager&apos;s acceptance.</p>}
            </div>
          </div>
        )}
        {/* Snag fix schedule — your proposed corrective-work date (separate from the original job). */}
        {!declinedForMe && latestSnag?.scheduled_at && ['assigned', 'in_progress'].includes(latestSnag.status) && (
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3.5 py-3">
            <Calendar size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-400">Snag fix scheduled{latestSnag.schedule_status === 'proposed' ? ' · proposed' : ''}</p>
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(latestSnag.scheduled_at)}</p>
              {latestSnag.schedule_status === 'proposed' && <p className="text-[11px] text-amber-600 dark:text-amber-400">Awaiting the manager&apos;s approval.</p>}
            </div>
          </div>
        )}

        <EditedLine at={t.edited_at} by={editorName} />
      </Card>

      {!declinedForMe && breached && <BreachReason nextAction={sla.nextAction} dueAt={sla.nextActionDueAt} owner="Supplier" />}

      {/* Off the ticket → no "Next step", just why this quote request was declined. */}
      {declinedForMe ? (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">Quote request declined{declinedByLabel}</p>
          <p className="text-sm text-[var(--text)]">{declineMessage}</p>
        </div>
      ) : (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Next step</h2>
          {latestQuote?.status === 'declined' && (
            <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3 space-y-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Quote declined{latestQuote?.updated_at ? <span className="font-medium normal-case opacity-80"> · {formatDateTime(latestQuote.updated_at)}</span> : null}</p>
              <p className="text-sm text-[var(--text)]">{declineReason || DEFAULT_DECLINE_REASON}</p>
              {canSubmitQuote && <p className="text-sm text-[var(--text-muted)]">Submit a revised quote below.</p>}
            </div>
          )}
          {canSubmitQuote && <SendQuoteForm ticketId={t.id} competitive priority={t.priority} createdAt={t.created_at} />}
          {awarded && t.status === 'accepted' && <ScheduleJobCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} technicians={technicians} />}
          {awarded && t.status === 'snag' && <AcceptSnagCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} />}
          {awarded && t.status === 'snag_assigned' && (
            latestSnag?.schedule_status === 'agreed'
              ? <StartSnagButton ticketId={t.id} />
              : <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 text-sm text-[var(--text-muted)]">Snag fix proposed{latestSnag?.scheduled_at ? ` for ${formatDateTime(latestSnag.scheduled_at)}` : ''} — awaiting the manager&apos;s approval before you can start.</div>
          )}
          {/* After the quote is accepted/scheduled — assign a technician (UI only for now), shown above the in-progress button. */}
          {awarded && t.status === 'scheduled' && <AssignTechnicianButton technicians={technicians} />}
          {awarded && ['in_progress', 'snag_resolved', 'snag_in_progress', 'evidence_requested'].includes(t.status) && (
            <SubmitCompletionForm ticketId={t.id} evidenceRequested={t.status === 'evidence_requested'} requireBoth={t.status !== 'evidence_requested'} />
          )}
          {awarded && t.status === 'in_progress' && <SendQuoteForm ticketId={t.id} variant="variation" competitive priority={t.priority} createdAt={t.created_at} />}
          {awarded && t.status === 'variation_review' && (
            <div className="rounded-xl bg-purple-500/10 ring-1 ring-purple-500/30 p-3.5 text-sm text-[var(--text-muted)]">Variation order submitted — awaiting approval from the regional manager.</div>
          )}
          {awarded && t.status === 'submitted_for_signoff' && (
            <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 text-sm text-[var(--text-muted)]">COC &amp; POC submitted — awaiting the regional manager&apos;s approval.</div>
          )}
          {/* submit_quote is handled by SendQuoteForm above — exclude the duplicate button. */}
          <WorkflowActions ticketId={t.id} status={t.status} role="supplier" exclude={['schedule', 'submit_completion', 'require_assessment', 'request_quote', 'submit_variation', 'accept_snag', 'start_snag', 'submit_quote']} />
          {/* Opt out of the job (before award) — separated from the primary actions */}
          {canDecline && <div className="pt-1"><DeclineWorkButton ticketId={t.id} /></div>}
        </Card>
      )}

      {/* Quotes — the supplier's own quote history */}
      {(myQuotes ?? []).length > 0 && (
        <CollapsibleSection id="ticket-quotes" title="Quotes" defaultOpen={phase === 'commercial'}>
          {((myQuotes ?? []) as any[]).map((q, i, arr) => (
            <QuoteSummary
              key={q.id}
              title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'}
              status={quoteStatusOf(q.status)}
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

      {/* Variation Orders — full detail + attachments (pending / approved / declined) */}
      {(variationRows ?? []).length > 0 && (
        <CollapsibleSection id="ticket-vos" title="Variation Orders" defaultOpen={t.status === 'variation_review'}>
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
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p>
                  {v.status === 'rejected' && v.reject_reason && (
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was declined</p>
                      <p className="text-sm text-[var(--text)]">{v.reject_reason}</p>
                    </div>
                  )}
                  {Array.isArray(v.file_urls) && v.file_urls.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                      {v.file_urls.map((u: string, j: number) => <a key={j} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#C6A35D] hover:underline"><FileText size={12} /> Attachment {j + 1}</a>)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CollapsibleSection>
      )}

      {/* COC & POC — the submission(s) currently under review (pending sign-off) */}
      {pendingSignoffs.length > 0 && (
        <CollapsibleSection id="ticket-coc" title="COC & POC" defaultOpen={phase === 'coc'}>
          {t.status === 'evidence_requested' && t.evidence_request_reason && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">More evidence requested</p>
              <p className="text-sm text-[var(--text)]">{t.evidence_request_reason}</p>
            </div>
          )}
          {pendingSignoffs.map(s => <SignoffCard key={s.id} s={s} />)}
        </CollapsibleSection>
      )}

      {/* Snag — rejected / sent-back completions, kept for traceability */}
      {rejectedSignoffs.length > 0 && (
        <CollapsibleSection id="ticket-snag" title="Snag" defaultOpen={phase === 'snag'}>
          {rejectedSignoffs.map((s, i) => <SignoffCard key={s.id} s={s} snag={i === 0 ? latestSnag : null} />)}
        </CollapsibleSection>
      )}

      {/* Completion — the approved COC & POC, created once sign-off is accepted */}
      {acceptedSignoff && (
        <CollapsibleSection id="ticket-completion" title="Completion" defaultOpen={phase === 'completion'}>
          <SignoffCard s={acceptedSignoff} />
        </CollapsibleSection>
      )}

      {/* Off the job → can't post updates either (matches the frozen audit trail). */}
      {!declinedForMe && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Post an update</h2>
          <SupplierAttachments ticketId={t.id} />
        </Card>
      )}

      {/* Isolation: a supplier only ever sees THEIR OWN involvement. Until they're
          awarded the job, the trail is scoped to their invite + their own quote (no
          other supplier's progress, and no view events — suppliers must not learn of
          each other). Once awarded, it's their job and shows the full progression. */}
      {!awarded ? (
        <AuditTrail ticket={{
          createdAt: t.created_at,
          startAt: (invite as any)?.invited_at ?? t.quote_requested_at,
          quoteRequestedAt: (invite as any)?.invited_at ?? t.quote_requested_at,
          quoteSubmittedAt: latestQuote?.created_at ?? null,
          requoteRequestedAt,
          quotes: (myQuotes ?? []) as any[],
          supplierDeclinedAt: declinedForMe ? ((invite as any)?.responded_at ?? latestQuote?.updated_at ?? t.updated_at) : null,
        }} />
      ) : (
        <AuditTrail ticket={{
          createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
          startAt: (invite as any)?.invited_at ?? t.quote_requested_at,
          quoteRequestedAt: t.quote_requested_at, quoteSubmittedAt: latestQuote?.created_at ?? t.quote_submitted_at,
          quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
          scheduledAt: t.scheduled_at, completedAt: t.completed_at,
          editedAt: t.edited_at, editedByName: editorName, cancellationReason: t.cancellation_reason,
          snagScheduledAt, requoteRequestedAt,
          quotes: (myQuotes ?? []) as any[], signoffs: (signoffRows ?? []) as any[], updates: (updates ?? []) as any[],
        }} />
      )}
    </div>
  )
}
