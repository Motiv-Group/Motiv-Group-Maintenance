export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ClipboardCheck, FileText, Calendar, ChevronDown, Clock, CheckCircle2, Info } from 'lucide-react'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'
import { BackLink } from '@/components/ui/BackLink'
import { MarkTicketSeen } from '@/components/ui/MarkTicketSeen'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ChatFab } from '@/components/chat/TicketChat'
import { BreachReason } from '@/components/workflow/BreachReason'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { CompletionFooterNote } from '@/components/workflow/CompletionBody'
import { QuoteSummary } from '@/components/workflow/QuoteSummary'
import { ArchiveGroup } from '@/components/ticket/ArchiveGroup'
import { SignoffCard } from '@/components/ticket/SignoffCard'
import { MarkInProgressButton, DeclineWorkButton, AcceptSnagCard, SnagRescheduleCta, StartSnagButton, SupplierVariationGate, SupplierQuoteBar, SupplierQuoteSubmittedActions } from '@/components/supplier/SupplierJobActions'
import { PopupForm } from '@/components/supplier/PopupForm'
import { RaiseDisputeButton, RaiseDisputeMore, DisputeThread, DisputeControls } from '@/components/dispute/DisputeBox'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import { DetailTabs } from '@/components/ui/DetailTabs'
import { formatCurrency, formatDateTime, supplierStatusMeta, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import { loadSupplierTicketDetail } from '@/lib/ticket-detail/supplier'

export default async function SupplierTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const result = await loadSupplierTicketDetail(params.id)
  if (result.kind === 'redirect') redirect(result.to)
  const {
    t, store, storeName, disputeStore, companyName, supplierCompanyName, customer, editorName, quoteRequestedAt,
    latestSnag, snagFixApproved, snagScheduleActive, declinedSnag, scheduledTechName,
    awarded, chatUnread, chatUnreadCount, declinedForMe, dueAt, overdue, declineDetails, sla, breached, now,
    latestQuote, canSubmitQuote, declineReason, declinedBy, declinedByLabel, declineMessage, politeDecline, supplierStatus, reQuoteByRm,
    quoteStatusOf, requoteReason,
    pendingSignoffs, rejectedSignoffs, acceptedSignoff, submissionLabel, roundBySignoff, liveSnag, liveEvidence, archivedSuperseded,
    variations, variationCount, latestVoRejectReason, canDecline,
    disputes, msgsByDispute, openDispute, resolvedDisputes, disputeSubject,
    nextAction, timelineItems,
    totalPhotos, quoteTabRows, historyDeclinedQuotes, declineRows,
  } = result.data

  // While a dispute is open the paused step's action area shows the resolve controls
  // (the chat + reply live in the Dispute tab). Reused for snag / evidence / VO.
  const disputeAction = openDispute ? (
    <div className="space-y-2.5">
      <p className="text-sm text-[var(--text-muted)]">This step is paused while the dispute is reviewed. Resolve it here, or keep the conversation going in the <span className="font-semibold text-[var(--text)]">Dispute</span> tab.</p>
      <DisputeControls ticketId={t.id} origin={openDispute.origin} viewerRole="supplier" pendingOutcome={openDispute.pending_outcome ?? null} pendingBy={openDispute.pending_by ?? null} />
    </div>
  ) : null

  // Approved VOs, oldest first (rows load newest-first) — shown as a summary card
  // in the close-out gate so the supplier sees what extra work was agreed.
  const approvedVos = variations.filter(v => v.status === 'approved').reverse()

  // ── Lower tabbed section (mirrors the RM ticket detail). Each tab's content, or
  // null when it has nothing — DetailTabs drops the empty ones. ──────────────────
  const photosTab = totalPhotos > 0
    ? <PhotoThumbs urls={t.photo_urls as string[]} ticketId={t.id} label="Job photo" />
    : null
  const quotesTab = quoteTabRows.length > 0
    ? (<div className="space-y-2">{quoteTabRows.map((q, i, arr) => (
        <QuoteSummary key={q.id} title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'} status={quoteStatusOf(q.status)} ticketId={t.id} collapsible declineReason={q.decline_reason ?? declineReason}
          quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at }}
          schedule={q.status === 'accepted' && t.scheduled_at ? { at: t.scheduled_at, proposed: t.schedule_status === 'proposed', technician: scheduledTechName, audience: 'supplier' } : q.proposed_schedule_at ? { at: q.proposed_schedule_at, proposed: true, audience: 'supplier' } : null} />
      ))}</div>)
    : null
  const completionTab = (liveEvidence || pendingSignoffs.length > 0 || acceptedSignoff)
    ? (<div className="space-y-3">
        {liveEvidence && <SignoffCard s={liveEvidence} ticketId={t.id} icon={ClipboardCheck} chevron title={submissionLabel(liveEvidence)} reason={roundBySignoff.get(liveEvidence.id)?.reason ?? liveEvidence.reject_reason} collapsible defaultOpen />}
        {pendingSignoffs.map(s => <SignoffCard key={s.id} s={s} ticketId={t.id} icon={ClipboardCheck} chevron title={submissionLabel(s)} collapsible defaultOpen footer={<CompletionFooterNote>You will be notified once the Regional Manager has reviewed and signed off.</CompletionFooterNote>} />)}
        {acceptedSignoff && <SignoffCard s={acceptedSignoff} ticketId={t.id} icon={ClipboardCheck} chevron title="Completion" collapsible />}
      </div>)
    : null
  const snagTab = liveSnag
    ? <SignoffCard s={liveSnag} snag={latestSnag} ticketId={t.id} icon={ClipboardCheck} badgeLabel="Rejected" title={submissionLabel(liveSnag)} reason={roundBySignoff.get(liveSnag.id)?.reason ?? liveSnag.reject_reason} />
    : null
  const voTab = variations.length > 0
    ? (<div className="space-y-3">{variations.map((v, i, arr) => {
        // Neutral card + status chip (matches the Completion/Quotes cards) — only the
        // decline-reason callout inside stays red-tinted.
        const st = v.status === 'approved' ? { label: 'Approved', badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15' }
          : v.status === 'rejected' ? { label: 'Declined', badge: 'text-red-700 dark:text-red-400 bg-red-500/15' }
          : { label: 'Pending approval', badge: 'text-amber-700 dark:text-amber-400 bg-amber-500/15' }
        return (
          <div key={i} className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
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
  // Disputes are org-filtered in the loader, so a declined org sees ONLY its own
  // quote-decline dispute here (no awarded gate). The awarded supplier's resolve
  // controls surface in the Next-action block instead (hideControls); the declined
  // org has no Next-action block, so the tab keeps the controls for them.
  const disputeTab = disputes.length > 0
    ? (<div className="space-y-3">
        {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="supplier" subject={disputeSubject(openDispute)} hideControls={awarded} />}
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
  const archiveTab = (historyDeclinedQuotes.length > 0 || declineRows.length > 0 || archivedSuperseded.length > 0 || !!declinedSnag)
    ? (<div className="space-y-4">
        {historyDeclinedQuotes.length > 0 && (
          <ArchiveGroup label="Quotes">
            {historyDeclinedQuotes.map((q, i, arr) => (
              <QuoteSummary key={q.id} title={arr.length > 1 ? `Quote #${arr.length - i}` : 'Your submitted quote'} status={quoteStatusOf(q.status)} ticketId={t.id} collapsible declineReason={q.decline_reason ?? declineReason}
                quote={{ id: q.id, amount: q.amount, amountInclVat: q.amount_incl_vat ?? null, description: q.description ?? null, fileUrl: q.file_url ?? null, validUntil: q.valid_until ?? null, createdAt: q.created_at, declinedAt: q.updated_at ?? null }} />
            ))}
          </ArchiveGroup>
        )}
        {declineRows.length > 0 && (
          <ArchiveGroup label="Quote requests">
            {declineRows.map((d, i) => (
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
              <SignoffCard key={s.id} s={s} ticketId={t.id} icon={ClipboardCheck} chevron badgeLabel={s.status === 'rejected' ? 'Rejected' : undefined} title={submissionLabel(s)} reason={roundBySignoff.get(s.id)?.reason ?? s.reject_reason} snag={s.status === 'rejected' && s.id === rejectedSignoffs[0]?.id ? latestSnag : null} collapsible />
            ))}
          </ArchiveGroup>
        )}
        {declinedSnag && (
          <ArchiveGroup label="Snag schedule">
            {/* Same collapsible row layout as the Submissions cards above (icon +
                title · date + status chip + chevron). */}
            <details className="group rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><Calendar size={15} className="text-red-500 shrink-0" /><span className="truncate">Snag schedule · {formatDateTime(declinedSnag.schedule_declined_at)}</span></span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 bg-red-500/15 text-red-700 dark:text-red-400">Declined</span>
                </span>
                <ChevronDown size={16} className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-[var(--border)] p-4 space-y-2">
                {declinedSnag.scheduled_at && <p className="text-sm text-[var(--text-muted)]">Proposed: <span className="font-semibold text-[var(--text)]">{formatDateTime(declinedSnag.scheduled_at)}</span></p>}
                <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Reason</p>
                  <p className="text-sm text-[var(--text)]">{declinedSnag.schedule_decline_reason || 'No reason provided.'}</p>
                </div>
                <p className="text-[11px] text-[var(--text-faint)]">Declined {formatDateTime(declinedSnag.schedule_declined_at)}</p>
              </div>
            </details>
          </ArchiveGroup>
        )}
      </div>)
    : null
  const timelineTab = <TicketTimeline items={timelineItems} />

  return (
    <div className="space-y-5">
      {/* Bump this supplier user's "last seen" watermark — a plainly-declined
          ticket drops off their Today queue once they've opened it here. */}
      <MarkTicketSeen ticketId={t.id} latestUpdateAt={t.updated_at} />
      <BackLink fallbackHref="/supplier/tickets" label="Back to tickets" />

      {/* Header — stepper + ref/title/badges (same layout as the RM ticket detail). */}
      <Card className="p-5 space-y-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.category || t.title}</h1>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 justify-items-end">
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
        </div>
        {!declinedForMe && <RmPipeline status={supplierStatus} />}
      </Card>
      {/* Off the ticket → no "Next step", just why this quote request was declined. */}
      {declinedForMe ? (
        <div className="rounded-2xl bg-red-500/10 ring-1 ring-red-500/40 p-5 space-y-1">
          {/* "Quote declined" once they'd submitted a quote; otherwise the request itself. */}
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{latestQuote ? 'Quote declined' : 'Quote request declined'}{declinedByLabel}</p>
          <p className="text-sm text-[var(--text)]">{declineMessage}</p>
          {/* The client declined this org — they may dispute it (thread-only, no workflow
              pause; the conversation lives in the Dispute tab once raised). Hidden while
              their own dispute is already open, and for a "choosing another supplier"
              decline (a normal competitive outcome — nothing to dispute). */}
          {declinedBy === 'regional_manager' && !openDispute && !politeDecline && (
            <div className="pt-2">
              <RaiseDisputeButton ticketId={t.id} origin="quote_declined" label="Dispute the decline"
                subjectTitle={latestQuote ? 'Quote declined' : 'Quote request declined'} jobRef={t.job_ref} store={disputeStore} />
            </div>
          )}
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
              ) : latestSnag?.schedule_status === 'declined' ? (
                /* RM declined the proposed time — Re-schedule replaces Accept (no
                   Raise dispute here; the client chat lives under the CTA's More). */
                <SnagRescheduleCta ticketId={t.id} priority={t.priority} createdAt={t.created_at} declinedProposedAt={latestSnag.scheduled_at ?? null} declineReason={latestSnag.schedule_decline_reason ?? null} />
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
                    <PopupForm label={t.status === 'evidence_requested' ? 'Upload more evidence' : 'Upload COC & POC'} tone="primary"><SubmitCompletionForm defaultOpen ticketId={t.id} evidenceRequested={t.status === 'evidence_requested'} evidenceRequestReason={t.evidence_request_reason ?? null} requireBoth={t.status !== 'evidence_requested'} /></PopupForm>
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
              can also dispute the decline (via the gate's "More" — paused while the
              dispute is open). */}
          {awarded && (t.status === 'approved_closeout' || t.status === 'vo_declined') && (
            openDispute && t.status === 'vo_declined' ? (
              disputeAction
            ) : (
              <div className="space-y-3">
                {/* What was already approved, so the supplier sees the agreed extras. */}
                {approvedVos.length > 0 && (
                  <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3.5 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Approved variation order{approvedVos.length > 1 ? 's' : ''}</p>
                    {approvedVos.map((v, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-[var(--text-muted)]">{v.description || 'Variation order'}</span>
                        {v.amount != null && <span className="shrink-0 font-semibold text-[var(--text)] tabular-nums">{formatCurrency(v.amount)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <SupplierVariationGate ticketId={t.id} priority={t.priority} createdAt={t.created_at} variationCount={variationCount} status={t.status as 'approved_closeout' | 'vo_declined'} declineReason={latestVoRejectReason} noVosConfirmed={!!t.vo_none_confirmed_at} dispute={{ jobRef: t.job_ref, store: disputeStore }} />
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
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 sm:gap-x-6 gap-y-2.5 text-sm">
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
                {/* snagFixApproved implies latestSnag.scheduled_at is set */}
                <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(latestSnag!.scheduled_at!)}</p>
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
          { key: 'archive', label: 'History', content: archiveTab },
          { key: 'timeline', label: 'Timeline', content: timelineTab },
        ]}
      />
      {/* Floating chat button — the RM↔supplier chat opens once the job is awarded. */}
      {awarded && <ChatFab ticketId={t.id} viewerRole="supplier" unreadCount={chatUnreadCount} />}
    </div>
  );
}
