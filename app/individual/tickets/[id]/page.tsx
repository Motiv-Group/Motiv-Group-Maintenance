export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { FileText, Image as ImageIcon, Clock, CheckCircle2 } from 'lucide-react'
import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { BackLink } from '@/components/ui/BackLink'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { signManyUrls } from '@/lib/storage'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { QuoteSummary, type QuoteSummaryStatus } from '@/components/workflow/QuoteSummary'
import { SupplierStatusList, QuoteReviewCard, ApproveSignoffCard, RequestEvidenceButton, RaiseSnagButton, VariationReviewCard, CloseOutButton, AcceptSnagScheduleCard, type ReviewQuote } from '@/components/regional/RmTicketActions'
import { IndividualTicketActionBar } from '@/components/individual/IndividualTicketActionBar'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import { buildTicketTimeline } from '@/lib/ticket-timeline'
import { isTerminalStatus } from '@/lib/workflow'
import { DisputeThread } from '@/components/dispute/DisputeBox'
import { ChatFab } from '@/components/chat/TicketChat'
import { chatUnreadCounts } from '@/lib/chat-unread'
import { rmStatusMeta, formatDateTime, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'

const ASSIGNABLE = ['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quoted', 'quote_revision', 'suppliers_declined']

export default async function IndividualTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // One parallel wave: auth gate ∥ ticket ∥ child rows (all key on params.id).
  const admin = createAdminClient()
  const [{ userId }, { data: t }, { data: quotes }, { data: signoffs }, { data: invites }, { data: motiv }, { data: snags }, { data: disputeRows }, { data: disputeMsgRows }, { data: disputeExtra }, { data: variations }, { data: snagEvents }, { data: requestRows }, { data: editRows }] = await Promise.all([
    requireIndividual(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('quotes').select('id, supplier_id, amount, amount_incl_vat, description, file_url, status, valid_until, proposed_schedule_at, created_at, updated_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, before_urls, after_urls, coc_url, invoice_url, status, notes, reject_reason, reviewed_at, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('supplier_id, status, invited_at, decline_reason').eq('ticket_id', params.id),
    admin.from('suppliers').select('id, company_name').eq('is_motiv', true).eq('active', true).order('company_name'),
    admin.from('snags').select('scheduled_at, schedule_status, status, assigned_at, schedule_agreed_at, schedule_declined_at, schedule_decline_reason, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('ticket_disputes').select('id, origin, status, outcome, resolution_note, created_at, resolved_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_dispute_messages').select('id, dispute_id, author_role, body, evidence_urls, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_disputes').select('id, signoff_id, pending_outcome, pending_by').eq('ticket_id', params.id),
    // Timeline inputs — variation orders, durable snag-schedule rounds, quote-request
    // rounds and the durable per-edit log (all chronological for the audit trail).
    admin.from('ticket_variations').select('status, reject_reason, reviewed_at, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('snag_schedule_events').select('kind, scheduled_for, reason, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_quote_requests').select('supplier_id, requested_at').eq('ticket_id', params.id).order('requested_at', { ascending: true }),
    admin.from('ticket_edits').select('editor_id, editor_role, note, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
  ])
  if (!t || t.created_by !== userId) redirect('/individual/tickets')

  // Chat exists only once a supplier is awarded — unread count for the floating chat button.
  const chatUnread = t.supplier_id ? ((await chatUnreadCounts(admin, userId, [t.id]))[t.id] ?? 0) : 0

  // Disputes — the Individual owner is the resolver (the "client" side). Sign
  // message evidence for the private buckets. Newer per-dispute columns are
  // merged separately so the block still works before that migration.
  const disputeExtraById = new Map((disputeExtra ?? []).map(x => [x.id, x]))
  const disputes = (disputeRows ?? []).map(d => ({ ...d, ...(disputeExtraById.get(d.id) ?? {}) }))
  // evidence_urls is a Json column holding a string[] — sign each stored path.
  const disputeMsgs = await Promise.all((disputeMsgRows ?? []).map(async (m) => ({
    ...m,
    evidence_urls: await signManyUrls(Array.isArray(m.evidence_urls) ? (m.evidence_urls as string[]) : []),
  })))
  const msgsByDispute = (id: string) => disputeMsgs.filter(m => m.dispute_id === id)
  const openDispute = disputes.find(d => d.status === 'open') ?? null
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved')
  const disputeSubject = (d: { origin: string }) => d.origin === 'variation' ? 'Variation order · declined' : d.origin === 'snag' ? 'Snag' : 'Evidence request'
  const latestSnag = (snags ?? [])[0] ?? null
  const snagAwaitingApproval = t.status === 'snag_assigned' && latestSnag?.schedule_status === 'proposed' && !!latestSnag?.scheduled_at

  const inviteRows = invites ?? []
  const quoteRows = quotes ?? []
  const supplierIds = Array.from(new Set([...inviteRows.map(r => r.supplier_id), ...quoteRows.map(q => q.supplier_id), ...(requestRows ?? []).map(r => r.supplier_id)].filter((id): id is string => !!id)))
  // Editor names for the timeline's edit events (durable log + the legacy single-slot fallback).
  const editorIds = Array.from(new Set([...(editRows ?? []).map(e => e.editor_id), t.edited_by].filter((id): id is string => !!id)))
  const [supRes, editorRes] = await Promise.all([
    supplierIds.length ? admin.from('suppliers').select('id, company_name').in('id', supplierIds) : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
    editorIds.length ? admin.from('user_profiles').select('id, full_name').in('id', editorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const nameById = new Map((supRes.data ?? []).map(s => [s.id, s.company_name]))
  const editorNameById = new Map((editorRes.data ?? []).map(u => [u.id, u.full_name]))

  const sm = rmStatusMeta(t.status)
  // Buckets are private — stored URLs must be signed or they 403 (every other
  // role's detail page already signs; this one was missed).
  const photos = Array.isArray(t.photo_urls) ? await signManyUrls(t.photo_urls as string[]) : []
  const quoteStatusOf = (s: string): QuoteSummaryStatus => s === 'accepted' ? 'accepted' : s === 'declined' ? 'declined' : 'pending'
  const acceptedQuote = quoteRows.find(q => q.status === 'accepted') ?? null
  const pendingSignoff = (signoffs ?? []).find(s => ['submitted', 'awaiting_regional', 'awaiting_store'].includes(s.status)) ?? null
  const acceptedSignoff = (signoffs ?? []).find(s => s.status === 'accepted') ?? null
  const isTerminal = isTerminalStatus(t.status)

  const motivSuppliers = (motiv ?? []).map(s => ({ id: s.id, name: s.company_name }))
  const declinedSupplierIds = inviteRows.filter(r => ['declined', 'closed'].includes(r.status)).map(r => r.supplier_id)
  const awaitingById: Record<string, 'invited' | 'quoted'> = {}
  for (const r of inviteRows) if (r.status === 'invited' || r.status === 'quoted') awaitingById[r.supplier_id] = r.status
  const supplierStatusRows = inviteRows.map(r => ({ name: nameById.get(r.supplier_id) ?? 'Supplier', status: r.status, invitedAt: r.invited_at, declineReason: r.decline_reason }))
  const reviewQuotes: ReviewQuote[] = quoteRows.filter(q => q.status === 'pending').map(q => ({
    id: q.id, supplierName: (q.supplier_id ? nameById.get(q.supplier_id) : undefined) ?? 'Supplier', amount: q.amount, amountInclVat: q.amount_incl_vat ?? null,
    description: q.description ?? null, fileUrl: q.file_url ?? null, createdAt: q.created_at, proposedScheduleAt: q.proposed_schedule_at ?? null,
  }))
  const canAssign = ASSIGNABLE.includes(t.status)

  // Full life-of-job audit trail (FULL view — the individual owner IS the manager,
  // so nothing is filtered). Durable logs (quote-request rounds, snag-schedule
  // rounds, per-edit log) override the single-slot ticket columns, which remain
  // the fallback for older tickets. Actor "Regional Manager" reads as "You" here —
  // on a standalone job the owner performs the manager-side actions themselves.
  const declinedSnag = (snags ?? []).find(s => !!s.schedule_declined_at) ?? null
  const snagScheduledAt = (snags ?? []).find(s => s.scheduled_at)?.scheduled_at ?? null
  const timelineItems = buildTicketTimeline({
    createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
    quoteRequestedAt: t.first_quote_requested_at ?? t.quote_requested_at,
    quoteRequests: (requestRows ?? []).map(r => ({ at: r.requested_at, supplierName: r.supplier_id ? (nameById.get(r.supplier_id) ?? null) : null })),
    quoteSubmittedAt: t.quote_submitted_at,
    quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
    scheduledAt: t.scheduled_at, completedAt: t.completed_at,
    cancellationReason: t.cancellation_reason,
    workStartedAt: t.attended_at ?? null,
    snagScheduledAt,
    snagAcceptedAt: latestSnag?.assigned_at ?? null,
    snagProposedAt: latestSnag?.assigned_at ?? null, snagApprovedAt: latestSnag?.schedule_agreed_at ?? null,
    snagDeclinedAt: declinedSnag?.schedule_declined_at ?? null, snagDeclineReason: declinedSnag?.schedule_decline_reason ?? null,
    snagScheduleEvents: snagEvents ?? [],
    edits: (editRows ?? []).map(e => ({ at: e.created_at, note: e.note, byName: e.editor_id ? (editorNameById.get(e.editor_id) ?? null) : null, byRole: e.editor_role })),
    editedAt: t.edited_at, editNote: t.edit_note, editedByName: t.edited_by ? (editorNameById.get(t.edited_by) ?? null) : null,
    quotes: quoteRows.map(q => ({ amount: q.amount, status: q.status, created_at: q.created_at, updated_at: q.updated_at, supplierName: (q.supplier_id ? nameById.get(q.supplier_id) : undefined) ?? 'Supplier' })),
    variations: variations ?? [],
    disputes: disputes.map(d => ({ origin: d.origin, status: d.status, outcome: d.outcome, created_at: d.created_at, resolved_at: d.resolved_at, reason: d.resolution_note })),
    disputeMessages: (disputeMsgRows ?? []).map(m => ({ author_role: m.author_role, body: m.body, created_at: m.created_at })),
    signoffs: (signoffs ?? []).map(s => ({ status: s.status, created_at: s.created_at, reviewed_at: s.reviewed_at, reject_reason: s.reject_reason })),
  }).map(e => ({ ...e, who: e.who === 'Regional Manager' ? 'You' : e.who }))

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/individual/tickets" label="Back to jobs" />

      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-[var(--text)] min-w-0">{t.title}</h1>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <PriorityBadge priority={t.priority} />
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Logged</div><div className="text-[var(--text)]">{formatDateTime(t.created_at)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Urgency</div><div className="text-[var(--text)]">{OPERATIONAL_IMPACT_LABELS[t.operational_impact as keyof typeof OPERATIONAL_IMPACT_LABELS] ?? '—'}</div></div>
        </div>
        {t.description && <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div><p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p></div>}
        {photos.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5 flex items-center gap-1.5"><ImageIcon size={12} /> Photos</div>
            <PhotoThumbs urls={photos} ticketId={t.id} />
          </div>
        )}
      </Card>

      {/* Suppliers requested + quotes to review */}
      {(supplierStatusRows.length > 0 || reviewQuotes.length > 0 || acceptedQuote) && (
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Quotes</h2>
          {supplierStatusRows.length > 0 && <SupplierStatusList rows={supplierStatusRows} />}
          {reviewQuotes.length > 0 && <QuoteReviewCard ticketId={t.id} quotes={reviewQuotes} />}
          {acceptedQuote && (
            <QuoteSummary title={`Approved · ${(acceptedQuote.supplier_id ? nameById.get(acceptedQuote.supplier_id) : undefined) ?? 'Supplier'}`} status="accepted"
              quote={{ id: acceptedQuote.id, amount: acceptedQuote.amount, amountInclVat: acceptedQuote.amount_incl_vat ?? null, description: acceptedQuote.description ?? null, fileUrl: acceptedQuote.file_url ?? null, validUntil: acceptedQuote.valid_until ?? null, createdAt: acceptedQuote.created_at }} />
          )}
        </Card>
      )}

      {/* COC & POC to review */}
      {pendingSignoff && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">COC &amp; POC — review &amp; sign off</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(pendingSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`a${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#f59e0b] underline hover:text-amber-500">After {i + 1}</a>)}
            {pendingSignoff.coc_url && <a href={pendingSignoff.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:underline"><FileText size={14} /> View COC</a>}
            {pendingSignoff.invoice_url && <a href={pendingSignoff.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:underline"><FileText size={14} /> View invoice</a>}
          </div>
          {pendingSignoff.notes && <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{pendingSignoff.notes}</p>}
          <ApproveSignoffCard ticketId={t.id} />
          <div className="flex gap-2"><RequestEvidenceButton ticketId={t.id} /><RaiseSnagButton ticketId={t.id} /></div>
        </Card>
      )}

      {/* Completed COC & POC */}
      {acceptedSignoff && !pendingSignoff && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Completion</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(acceptedSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`c${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#f59e0b] underline hover:text-amber-500">After {i + 1}</a>)}
            {acceptedSignoff.coc_url && <a href={acceptedSignoff.coc_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 hover:underline"><FileText size={14} /> View COC</a>}
          </div>
        </Card>
      )}

      {/* Dispute — the supplier disputed a snag / evidence request; you (the client) resolve it */}
      {disputes.length > 0 && (
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Dispute</h2>
          {openDispute && <DisputeThread ticketId={t.id} dispute={openDispute} messages={msgsByDispute(openDispute.id)} viewerRole="regional_manager" subject={disputeSubject(openDispute)} />}
          {resolvedDisputes.map(d => (
            <div key={d.id} className="pt-3 border-t border-[var(--border)] first:border-0 first:pt-0">
              <DisputeThread ticketId={t.id} dispute={d} messages={msgsByDispute(d.id)} viewerRole="regional_manager" readOnly subject={disputeSubject(d)} />
            </div>
          ))}
        </Card>
      )}

      {/* Actions */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Actions</h2>

        <IndividualTicketActionBar ticketId={t.id} canAssign={canAssign} hasSupplier={!!t.supplier_id} canCancel={!isTerminal} motivSuppliers={motivSuppliers} declinedSupplierIds={declinedSupplierIds} awaitingById={awaitingById} />

        {['accepted', 'scheduled'].includes(t.status) && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Quote approved — the supplier will start the work and upload the completion certificate &amp; photos when done.</p>
          </div>
        )}
        {t.status === 'in_progress' && (
          <div className="rounded-xl bg-[#f59e0b]/10 ring-1 ring-[#f59e0b]/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-[#f59e0b] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Work in progress — the supplier is on site or on their way.</p>
          </div>
        )}

        {t.status === 'variation_review' && <VariationReviewCard ticketId={t.id} />}

        {snagAwaitingApproval && latestSnag?.scheduled_at && <AcceptSnagScheduleCard ticketId={t.id} scheduledAt={latestSnag.scheduled_at} />}
        {['snag', 'snag_in_progress', 'snag_resolved'].includes(t.status) && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Snag raised — the supplier will schedule and carry out the corrective work, then resubmit for your sign-off.</p>
          </div>
        )}
        {t.status === 'snag_assigned' && !snagAwaitingApproval && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <Clock size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">Snag schedule approved — the supplier will carry out the fix and resubmit for sign-off.</p>
          </div>
        )}

        {(t.status === 'approved_closeout' || t.status === 'vo_declined') && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-muted)]">The work is approved. Once the supplier confirms there are no further variation orders, you can close the job out.</p>
            <CloseOutButton ticketId={t.id} voConfirmed={!!t.vo_none_confirmed_at} />
          </div>
        )}

        {t.status === 'completed' && (
          <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3.5 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--text-muted)]">This job is completed and closed out.</p>
          </div>
        )}
      </Card>

      {/* Timeline — full life-of-job audit trail (the owner sees everything) */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Timeline</h2>
        <TicketTimeline items={timelineItems} />
      </Card>

      {/* Chat with the awarded supplier — floating button (fixed, above the bottom nav) */}
      {t.supplier_id && <ChatFab ticketId={t.id} viewerRole="individual" unreadCount={chatUnread} />}
    </div>
  )
}
