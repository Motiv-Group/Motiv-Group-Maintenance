export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { ClientTicketProgress } from '@/components/client/ClientTicketProgress'
import { clientStatusMeta } from '@/components/client/ClientTicketStatus'
import { ClientTicketActions } from '@/components/client/ClientTicketActions'
import { SmTicketTabs } from '@/components/client/SmTicketTabs'
import { TicketBadges } from '@/components/client/ticketBadges'
import { ChatFab } from '@/components/chat/TicketChat'
import { chatUnreadCounts, smChatAdded } from '@/lib/chat-unread'
import { EditedLine } from '@/components/ui/EditedLine'
import { buildTicketTimeline, filterTimelineForSm } from '@/lib/ticket-timeline'
import { formatDateTime, clientVisibleStatus, storeLabel, PRIORITY_LEVEL_LABELS, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import type { StoreManagerTicket } from '@/lib/health/data'
import type { TicketStatus } from '@/lib/types'
import type { Database } from '@/lib/database.types'

type SnagSel = Pick<Database['public']['Tables']['snags']['Row'], 'scheduled_at' | 'schedule_status' | 'status'>

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export default async function StoreTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const admin = createAdminClient()
  // Timeline source rows (shared engine input). Quotes are status + timestamps
  // ONLY — no amounts or supplier names ever reach the SM view.
  const [{ storeIds, userId }, { data: t }, { data: updates }, { data: snagRows }, { data: quoteRows }, { data: signoffRows }, { data: variationRows }, { data: snagEventRows }, { data: editRows }] = await Promise.all([
    requireStoreManagerV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('snags').select('scheduled_at, schedule_status, status').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('quotes').select('status, created_at, updated_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('signoffs').select('status, reject_reason, reviewed_at, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_variations').select('status, reject_reason, reviewed_at, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('snag_schedule_events').select('kind, scheduled_for, reason, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_edits').select('note, editor_id, editor_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
  ])
  if (!t || !storeIds.includes(t.store_id ?? '')) redirect('/client/tickets')

  const showVisit = !!t.scheduled_at && !['completed', 'cancelled', 'declined'].includes(t.status)
  const photoUrlsRaw = Array.isArray(t.photo_urls) ? t.photo_urls : []
  const docUrlsRaw = Array.isArray(t.info_doc_urls) ? t.info_doc_urls : []
  // Editor names for the description "edited" line + the per-edit timeline events —
  // one lookup covering the single-slot editor and every ticket_edits editor.
  const editorIds = [...new Set([t.edited_by, ...(editRows ?? []).map(e => e.editor_id)])].filter((x): x is string => !!x)
  const [editorNames, visitSupplier, visitTech, signedPhotoUrls, signedDocUrls, chatAddedSet, chatCounts, smStoreName] = await Promise.all([
    editorIds.length
      ? admin.from('user_profiles').select('id, full_name').in('id', editorIds).then(r => new Map<string, string | null>((r.data ?? []).map(p => [p.id, p.full_name])))
      : new Map<string, string | null>(),
    showVisit && t.supplier_id ? admin.from('suppliers').select('company_name').eq('id', t.supplier_id).single().then(r => r.data?.company_name ?? null) : null,
    showVisit && t.technician_id ? admin.from('technicians').select('name').eq('id', t.technician_id).single().then(r => r.data?.name ?? null) : null,
    signManyUrls(photoUrlsRaw),
    signManyUrls(docUrlsRaw),
    // Ticket chat: entry points only once a supplier is awarded AND the RM added the SM.
    t.supplier_id ? smChatAdded(admin, [t.id]) : new Set<string>(),
    t.supplier_id ? chatUnreadCounts(admin, userId, [t.id], { smViewer: true }) : ({} as Record<string, number>),
    // Store label for the info-requested review sheet (store_id is non-null here — the guard above matched it).
    admin.from('stores').select('name, sub_store').eq('id', t.store_id ?? '').maybeSingle().then(r => (r.data ? storeLabel(r.data.name, r.data.sub_store) : null)),
  ])
  const chatAdded = !!t.supplier_id && chatAddedSet.has(t.id)
  const editorName = t.edited_by ? (editorNames.get(t.edited_by) ?? null) : null
  // The guard already required scheduled_at — the predicate just surfaces that to the type.
  const followUp = (snagRows ?? []).find((s): s is SnagSel & { scheduled_at: string } => !!s.scheduled_at && s.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(s.status)) ?? null
  const showFollowUp = !!followUp && !['completed', 'cancelled', 'declined'].includes(t.status)
  const infoAdded = t.status === 'open' && !!t.info_request_reason
  const canEdit = t.status === 'open' && !t.info_request_reason
  const active = !['completed', 'cancelled', 'declined'].includes(t.status)

  // Priority shown as the operational impact the SM chose at creation + the
  // derived level, e.g. "Trading affected — Urgent".
  const impactLabel = OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? null
  const priorityWord = PRIORITY_LEVEL_LABELS[String(t.priority)] ?? 'Medium'
  const priorityValue = impactLabel ? `${impactLabel} — ${priorityWord}` : priorityWord

  // Plain-language status + the SM's only real actions (add info / edit).
  const meta = clientStatusMeta(t.status)
  const done = t.status === 'completed'
  const closed = t.status === 'cancelled' || t.status === 'declined'
  const spinning = !done && !closed
  const isWait = meta.mode === 'wait'
  const NaIcon = done ? CheckCircle2 : closed ? XCircle : Loader2
  const naColor = done ? 'text-emerald-500' : closed ? 'text-[var(--text-faint)]' : isWait ? 'text-blue-500' : 'text-[#f59e0b]'

  const cv = clientVisibleStatus(t.status as TicketStatus)
  // Priority + status badges rendered with the same component (and sizing) as the
  // today page / Tickets tab, so they match everywhere.
  const badgeTicket = { priority: t.priority, status: cv ?? t.status, infoAdded } as unknown as StoreManagerTicket

  // Full lifecycle from the shared engine, then the SM-safe subset — the filter
  // strips quote submissions/declines, disputes and view-tracking; the input
  // carries no amounts, so nothing commercial can leak. Labels stay the engine's
  // neutral wording (no RM voice).
  const events = buildTicketTimeline({
    createdAt: t.created_at, status: t.status, updatedAt: t.updated_at,
    quoteApprovedAt: t.quote_decision_status === 'approved' ? t.quote_decided_at : null,
    scheduledAt: t.scheduled_at, completedAt: t.completed_at,
    editedAt: t.edited_at, editedByName: editorName, editNote: t.edit_note,
    edits: (editRows ?? []).map(e => ({ at: e.created_at, note: e.note, byName: e.editor_id ? (editorNames.get(e.editor_id) ?? null) : null, byRole: e.editor_role })),
    cancellationReason: t.cancellation_reason,
    infoRequestedAt: t.info_requested_at, infoAddedAt: t.info_added_at, infoRequestReason: t.info_request_reason,
    snagScheduleEvents: snagEventRows ?? [],
    workStartedAt: t.attended_at ?? null,
    quotes: quoteRows ?? [],
    variations: variationRows ?? [],
    signoffs: signoffRows ?? [],
    // Supplier progress notes now surface in the Timeline (the Activity tab is gone).
    updates: (updates ?? []) as { body: string; author_role: string | null; created_at: string }[],
  })
  const smTimeline = filterTimelineForSm(events)

  return (
    <div className="space-y-4">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      {/* Header: reference, title, priority + status, stepper */}
      <Card className="p-5 sm:p-6 space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-xl font-bold text-[var(--text)]">{t.category || t.title}</h1>
          </div>
          <TicketBadges ticket={badgeTicket} className="shrink-0" />
        </div>

        {!['cancelled', 'declined'].includes(t.status) && <ClientTicketProgress status={t.status} />}
      </Card>

      {/* Two columns: Next action · Ticket information */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Next action */}
        <Card className="p-5 h-full">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Next action</h2>
          <div className="flex items-start gap-3">
            <NaIcon size={22} className={`${naColor} shrink-0 ${spinning ? 'animate-spin' : ''}`} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text)]">{meta.msg}</p>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{meta.sub}</p>
            </div>
          </div>
          {t.status === 'info_requested' && t.info_request_reason && (
            <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-amber-500/20">
              <span className="font-semibold text-amber-700 dark:text-amber-400">Your manager asked:</span> {t.info_request_reason}
            </div>
          )}
          {t.status === 'info_requested' ? (
            <ClientTicketActions ticketId={t.id} title={t.title} description={t.description ?? ''} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} docUrls={docUrlsRaw} requestReason={t.info_request_reason} smAdded={chatAdded} mode="add_info" jobRef={t.job_ref} priority={String(t.priority)} storeName={smStoreName} createdAt={t.created_at} signedPhotoUrls={signedPhotoUrls} />
          ) : canEdit ? (
            <ClientTicketActions ticketId={t.id} title={t.title} description={t.description ?? ''} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} smAdded={chatAdded} />
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              <span>You&apos;re all set. We&apos;ll let you know when there&apos;s an update.</span>
            </div>
          )}
        </Card>

        {/* Ticket information */}
        <Card className="p-5 h-full">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Ticket information</h2>
          <div className="space-y-3">
            <InfoRow label="Category" value={t.category ?? 'General'} />
            <InfoRow label="Priority" value={priorityValue} />
            <InfoRow label="Logged" value={formatDateTime(t.created_at)} />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Description</div>
              <p className="text-sm text-[var(--text)] mt-0.5 whitespace-pre-line break-words">{t.description}</p>
            </div>
            {(showVisit || showFollowUp) && <InfoRow label="Assigned supplier" value={visitSupplier ?? 'Assigned supplier'} />}
            {showVisit && t.scheduled_at && !showFollowUp && (
              <InfoRow label={`Scheduled visit${t.schedule_status === 'proposed' ? ' · proposed' : ''}`} value={`${formatDateTime(t.scheduled_at)}${visitTech ? ` · ${visitTech}` : ''}`} />
            )}
            {showFollowUp && followUp && <InfoRow label="Follow-up visit" value={formatDateTime(followUp.scheduled_at)} />}
            {!showVisit && !showFollowUp && active && <InfoRow label="Assigned supplier" value="Awaiting assignment" />}
            {/* "Last edited" sits as the final row of the information block. */}
            <EditedLine at={t.edited_at} by={editorName} />
          </div>
        </Card>
      </div>

      {/* Photos + documents · Timeline (audit trail; supplier updates fold into it). */}
      <SmTicketTabs photoUrls={signedPhotoUrls} docUrls={signedDocUrls} ticketId={t.id} timeline={smTimeline} />

      {/* Floating chat entry — only once the RM has added the SM to this ticket's chat. */}
      {chatAdded && <ChatFab ticketId={t.id} viewerRole="store_manager" unreadCount={chatCounts[t.id] ?? 0} />}
    </div>
  )
}
