export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { CheckCircle2, FileText, Calendar, Clock, MessageSquare, Camera } from 'lucide-react'
import { ChatFab, TicketChatIcon } from '@/components/chat/TicketChat'
import { BreachReason } from '@/components/workflow/BreachReason'
import { QuoteSummary } from '@/components/workflow/QuoteSummary'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { RmQuotePanel, RmReviewPanel, ReQuoteButton, AcceptScheduleCard, AcceptSnagScheduleCard, VariationReviewCard, CloseOutButton, RmTicketActionBar, RmCompletionReview } from '@/components/regional/RmTicketActions'
import { CompletionFooterNote } from '@/components/workflow/CompletionBody'
import { ArchiveGroup } from '@/components/ticket/ArchiveGroup'
import { SignoffCard } from '@/components/ticket/SignoffCard'
import { EditedLine } from '@/components/ui/EditedLine'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { RmTicketTabs } from '@/components/regional/RmTicketTabs'
import { priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import type { StoreManagerTicket } from '@/lib/health/data'
import { MarkTicketSeen } from '@/components/ui/MarkTicketSeen'
import { DisputeThread, DisputeControls } from '@/components/dispute/DisputeBox'
import { formatCurrency, formatDateTime, rmStatusMeta, OPERATIONAL_IMPACT_LABELS, humanizeDuration } from '@/lib/utils'
import { loadRegionalTicketDetail, SNAG_WAIT_MSG } from '@/lib/ticket-detail/regional'

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
// (superseded declines). Shape mirrors mapQuote in lib/ticket-detail/regional.ts.
type DeclinedQuote = {
  id: string
  supplierName: string
  amount: number
  amountInclVat: number | null
  description: string | null
  fileUrl: string | null
  createdAt: string
  declinedAt: string | null
  declineReason: string | null
}
function RmDeclinedQuoteCard({ q, ticketId, canReQuote, open = false }: { q: DeclinedQuote; ticketId: string; canReQuote: boolean; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
      {/* Mobile: the summary wraps so the supplier name gets the full row and the
          amount + Declined pill drop underneath; sm+ keeps the single row. */}
      <summary className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition sm:flex-nowrap">
        <span className="basis-full text-sm font-semibold text-[var(--text)] min-w-0 truncate sm:basis-auto">{q.supplierName}</span>
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
        <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-4">
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
              ? <ViewTrackedLink ticketId={ticketId} itemType="quote" itemLabel={`the declined quote (${q.supplierName})`} href={q.fileUrl} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:underline"><FileText size={14} /> View attached quote</ViewTrackedLink>
              : <span />}
            {canReQuote && <ReQuoteButton ticketId={ticketId} quoteId={q.id} />}
          </div>
        )}
      </div>
    </details>
  )
}

// One supplier progress update — a free-text note, or a "📷 Progress photo: <url>"
// which renders as a photo link. Shared by the new-updates block (top) and the
// collapsible history (above the audit trail); `isNew` gives it the gold accent.
function SupplierUpdateItem({ u, ticketId, isNew = false }: { u: { body: string; created_at: string }; ticketId: string; isNew?: boolean }) {
  const photo = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/)
  return (
    <li className={`rounded-xl ring-1 p-3 bg-[var(--surface)] ${isNew ? 'ring-[#f59e0b]/40' : 'ring-[var(--border)]'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text)]">
          Supplier
          {isNew && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-[#f59e0b] bg-[#f59e0b]/15 rounded-full px-1.5 py-0.5">New</span>}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</span>
      </div>
      {photo
        ? <ViewTrackedLink ticketId={ticketId} itemType="photo" itemLabel="Supplier progress photo" href={photo[1]} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:underline"><Camera size={14} /> View progress photo</ViewTrackedLink>
        : <p className="text-sm text-[var(--text)] whitespace-pre-line">{u.body}</p>}
    </li>
  )
}

export default async function RegionalTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const result = await loadRegionalTicketDetail(params.id)
  if (result.kind === 'redirect') redirect(result.to)
  const {
    t, storeName, editorName, dueAt, overdue, now, sla, breached, chatUnread, chatUnreadCount, nextAction, COURTESY_NOTE,
    disputes, openDispute, resolvedDisputes, disputeSubject, msgsByDispute,
    roundBySignoff, submissionLabel, submissionTone,
    acceptedSignoff, liveEvidence, liveSnagSubmission, isEvidenceResubmission,
    reviewSignoff, reviewQuotes,
    latestSnag, snagAwaitingApproval, snagFixApproved, snagScheduleActive,
    supplierList, motivSupplierList, motivAccess, declinedSupplierIds, engagedSupplierIds, nameById,
    quotePanelRows,
    isTerminal, awarded, canReQuote, canAssign, canCancel, canEdit, canAssignSupplier, rmInfoAdded,
    supplierUpdates, newSupplierUpdates, photoGroups, timelineItems,
    documentLinks, quotesTabList, acceptedQuoteIds, pendingVariation, variations,
  } = result.data
  const { archivedDeclinedQuotes, archivedRequestDeclines, closedWaitingRows, supersededSubmissions, declinedSnag } = result.data.archivedGroups

  // The Dispute block (open live thread + resolved read-only history), each labelled
  // with the submission it concerns. Rendered ABOVE the Actions while live, then moved
  // BELOW once resolved (history).
  const disputeContent = disputes.length > 0 ? (
    <div className="space-y-3">
      {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="regional_manager" subject={disputeSubject(openDispute)} hideControls />}
      {resolvedDisputes.map(d => (
        <details key={d.id} className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
          <summary className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition sm:flex-nowrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] line-clamp-2 sm:truncate">Dispute — {disputeSubject(d)}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(d.resolved_at ?? d.created_at)}</p>
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${d.outcome === 'withdrawn' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>{d.outcome === 'withdrawn' ? 'Retracted' : 'Withdrawn'}</span>
          </summary>
          <div className="border-t border-[var(--border)] p-4">
            <DisputeThread ticketId={t.id} dispute={d} messages={msgsByDispute(d.id)} viewerRole="regional_manager" readOnly subject={disputeSubject(d)} />
          </div>
        </details>
      ))}
    </div>
  ) : null

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
                <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-4">
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
                <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-4">
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
          {supersededSubmissions.map(s => (
            <SignoffCard key={s.id} s={s} tone={submissionTone(s)} ticketId={t.id} title={submissionLabel(s)} reason={roundBySignoff.get(s.id)?.reason ?? s.reject_reason} collapsible hideTimestampOnMobile />
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
          {(variations ?? []).map((v, i) => {
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
                        <ViewTrackedLink key={j} ticketId={t.id} itemType="attachment" itemLabel={`Variation order ${i + 1} attachment ${j + 1}`} href={u} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={14} /> Attachment {j + 1}</ViewTrackedLink>
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
  const completionContent = (acceptedSignoff || reviewSignoff || liveEvidence || liveSnagSubmission) ? (
    <div className="space-y-3">
      {reviewSignoff && <SignoffCard s={reviewSignoff} tone="review" ticketId={t.id} title={submissionLabel(reviewSignoff)} freshEvidence={isEvidenceResubmission} collapsible defaultOpen hideTimestampOnMobile footer={<CompletionFooterNote>Approve, request more evidence, or raise a snag from the Next action panel above.</CompletionFooterNote>} />}
      {liveEvidence && <SignoffCard s={liveEvidence} tone="evidence" ticketId={t.id} title={submissionLabel(liveEvidence)} reason={roundBySignoff.get(liveEvidence.id)?.reason ?? liveEvidence.reject_reason} collapsible defaultOpen hideTimestampOnMobile footer={<CompletionFooterNote>Awaiting the supplier&apos;s updated evidence — this moves to History once they re-submit.</CompletionFooterNote>} />}
      {liveSnagSubmission && <SignoffCard s={liveSnagSubmission} tone="snag" ticketId={t.id} title={submissionLabel(liveSnagSubmission)} reason={roundBySignoff.get(liveSnagSubmission.id)?.reason ?? liveSnagSubmission.reject_reason} collapsible defaultOpen hideTimestampOnMobile footer={<CompletionFooterNote>Awaiting the supplier&apos;s snag fix — this moves to History once they re-submit.</CompletionFooterNote>} />}
      {acceptedSignoff && <SignoffCard s={acceptedSignoff} tone="approved" ticketId={t.id} collapsible defaultOpen hideTimestampOnMobile />}
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
                <ViewTrackedLink key={j} ticketId={t.id} itemType="attachment" itemLabel={`Variation order attachment ${j + 1}`} href={u} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><FileText size={14} /> Attachment {j + 1}</ViewTrackedLink>
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
      <Card className="p-4 space-y-5 sm:p-5 sm:space-y-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.category || t.title}</h1>
          </div>
          {/* Priority + status badges — same form factor as the SM ticket detail.
              Mobile: stacked + content-width (two fixed 120px badges side by side
              starve the title at 375px); sm+ keeps the fixed-width row. The chat icon
              (once a supplier is awarded) sits to the right of the badge cluster. */}
          <div className="flex items-start gap-2 shrink-0">
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
              <span className={`inline-flex w-auto justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold sm:w-[120px] ${priorityBadgeClass({ priority: t.priority } as StoreManagerTicket)}`}>{priorityLabel({ priority: t.priority } as StoreManagerTicket)}</span>
              {(() => {
                const sm = rmStatusMeta(t.status)
                // An open dispute overrides the badge with "Dispute" (the snag/evidence
                // step is paused). Otherwise: a ticket where every supplier declined is
                // back at 'open' and reads "New"; "Info added" reads like an "Info
                // requested" badge (amber); the fresh answer is highlighted red in the
                // description until the RM acts.
                const label = openDispute ? 'Dispute' : rmInfoAdded ? 'Info added' : sm.label
                const cls = openDispute ? 'bg-red-500/15 text-red-700 dark:text-red-400' : rmInfoAdded ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : sm.cls
                return <span className={`inline-flex w-auto justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold sm:w-[120px] ${cls}`}>{label}</span>
              })()}
            </div>
            {t.supplier_id && <TicketChatIcon ticketId={t.id} viewerRole="regional_manager" unread={chatUnread} />}
          </div>
        </div>

        <RmPipeline status={t.status} />
      </Card>

      {/* Next action + Ticket information, side by side — matched heights (stretch). */}
      <div className="grid gap-4 lg:grid-cols-2 items-stretch">
      {/* Next action — the RM's most important pending step + the controls to take it
          (buttons stacked one under another). */}
      <Card className="p-4 space-y-4 h-full sm:p-5">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Next action</h2>
          {nextAction.msg && <p className="mt-1 text-sm font-bold text-[var(--text)]">{nextAction.msg}</p>}
          {/* When breached the instruction moves into the red callout below, so it
              isn't said twice. */}
          {nextAction.sub && !breached && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{nextAction.sub}</p>}
        </div>

        {/* Open dispute — the resolve controls live here; the chat is in the Dispute tab.
            A quote-decline dispute is thread-only (nothing pauses — the decline stands
            unless retracted); workflow disputes pause the disputed step. */}
        {openDispute && (
          <div className="space-y-2.5">
            <p className="text-sm text-[var(--text-muted)]">{openDispute.origin === 'quote_declined'
              ? 'A supplier disputed your quote decline — the decision stands unless you retract it.'
              : 'This step is paused while the dispute is reviewed.'} Resolve it here, or continue the conversation in the <span className="font-semibold text-[var(--text)]">Dispute</span> tab.</p>
            <DisputeControls ticketId={t.id} origin={openDispute.origin} viewerRole="regional_manager" pendingOutcome={openDispute.pending_outcome ?? null} pendingBy={openDispute.pending_by ?? null} />
          </div>
        )}

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
            add extra work, request more info, chat with the supplier, cancel — lives
            behind "More actions". Once a supplier is awarded the bar stays rendered
            (menu-only) so the chat entry point remains reachable.
            It's a client component so its per-action trigger render-props are created
            client-side (a Server Component can't pass functions to Client Components). */}
        {!isTerminal && (canAssign || canCancel || !!t.supplier_id) && (
          <RmTicketActionBar ticketId={t.id} status={t.status} canAssign={canAssign} canAssignSupplier={canAssignSupplier} canCancel={canCancel} canEdit={canEdit} hasSupplier={!!t.supplier_id} jobRef={t.job_ref}
            suppliers={supplierList} motivSuppliers={motivSupplierList} motivAccess={motivAccess} declinedSupplierIds={declinedSupplierIds} awaitingById={engagedSupplierIds}
            description={t.description ?? ''} photoUrls={Array.isArray(t.photo_urls) ? t.photo_urls : []} title={t.title} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} priority={t.priority} />
        )}

        {/* Completion (COC & POC) submitted → inline summary + Approve completion,
            with Raise snag / Request more evidence behind "More". Full detail is in
            the Completion tab. */}
        {reviewSignoff && (
          <RmCompletionReview ticketId={t.id} label={submissionLabel(reviewSignoff)} submittedAt={reviewSignoff.created_at}
            photoCount={(reviewSignoff.before_urls ?? []).length + (reviewSignoff.after_urls ?? []).length}
            docCount={(reviewSignoff.coc_url ? 1 : 0) + (reviewSignoff.invoice_url ? 1 : 0)}
            noteCount={reviewSignoff.notes && String(reviewSignoff.notes).trim() ? 1 : 0}
            beforeUrls={reviewSignoff.before_urls ?? []} afterUrls={reviewSignoff.after_urls ?? []}
            cocUrl={reviewSignoff.coc_url ?? null} invoiceUrl={reviewSignoff.invoice_url ?? null} notes={reviewSignoff.notes ?? null} />
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
          <div className="rounded-xl bg-[#f59e0b]/10 ring-1 ring-[#f59e0b]/30 p-3.5 text-sm text-[var(--text-muted)]">Work in progress — the supplier is on site or en route to attend to the job. The completion certificate and proof-of-completion photos will follow once the work is done.</div>
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
        <Card className="p-4 space-y-4 h-full sm:p-5">
          <h2 className="text-sm font-bold text-[var(--text)]">Ticket information</h2>
          <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 sm:gap-x-6 gap-y-2.5 text-sm">
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
        <Card className="p-5 space-y-3 bg-[#f59e0b]/5 ring-1 ring-blue-500/50">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><MessageSquare size={15} className="text-[#f59e0b]" /> New updates from the supplier</h2>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-[#f59e0b] bg-[#f59e0b]/15 rounded-full px-2 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f59e0b]" />
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
      {/* The Dispute conversation now lives in its own "Dispute" tab (next to
          Completion); the RM's resolve controls sit in the Next-action block above. */}
      {/* COC & POC under review now lives in the "Next action" review pop-up (compact
          row → full detail + actions); its files are also in the Documents/Photos tabs. */}
      {/* Photos · Activity (supplier updates) · Timeline (the full audit trail —
          status changes, edits, attachments/photos viewed, quotes, sign-offs …). */}
      <RmTicketTabs ticketId={t.id} photoGroups={photoGroups} updates={supplierUpdates} timeline={timelineItems} documents={documentsContent} quotes={quotesContent} completion={completionContent} dispute={disputeContent} history={historyContent}
        defaultTab={
          openDispute ? 'dispute'
          : completionContent && ['submitted_for_signoff', 'approved_closeout', 'completed'].includes(t.status) ? 'completion'
          : quotesContent && (t.status === 'quoted' || reviewQuotes.length > 0) ? 'quotes'
          : undefined
        } />
      {/* Floating chat button — quick access to the RM↔supplier chat from anywhere
          on the page. Only exists once a supplier is awarded. */}
      {t.supplier_id && <ChatFab ticketId={t.id} viewerRole="regional_manager" unreadCount={chatUnreadCount} />}
    </div>
  );
}
