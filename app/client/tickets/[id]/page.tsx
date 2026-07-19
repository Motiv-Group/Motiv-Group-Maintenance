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
import { AddInfoModal } from '@/components/client/AddInfoModal'
import { ClientTicketActions } from '@/components/client/ClientTicketActions'
import { SmTicketTabs } from '@/components/client/SmTicketTabs'
import { TicketBadges } from '@/components/client/ticketBadges'
import { ChatFab } from '@/components/chat/TicketChat'
import { chatUnreadCounts, smChatAdded } from '@/lib/chat-unread'
import { EditedLine } from '@/components/ui/EditedLine'
import { formatDateTime, clientVisibleStatus, PRIORITY_LEVEL_LABELS, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import type { StoreManagerTicket } from '@/lib/health/data'
import type { TicketStatus } from '@/lib/types'
import type { Database } from '@/lib/database.types'

type TicketRow = Database['public']['Tables']['tickets']['Row']
type SnagSel = Pick<Database['public']['Tables']['snags']['Row'], 'scheduled_at' | 'schedule_status' | 'status'>

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

type TimelineEntry = { label: string; at: string }
type EventRow = { from_status: string | null; to_status: string; created_at: string }

// SM-safe label for a status transition — the store manager sees only the
// necessary milestones: the info-request loop, scheduling, work start, the
// completion submission, and the terminal states. The competitive quoting and
// every "viewed" event are intentionally hidden (award is added separately, from
// the ticket row, so it fires even without a captured status event).
function lifecycleLabel(from: string | null, to: string): string | null {
  if (to === 'info_requested') return 'Your manager requested more information'
  if (from === 'info_requested' && to === 'open') return 'You added the requested information'
  switch (to) {
    case 'scheduled': return 'A visit was scheduled'
    case 'in_progress': return 'The supplier started work'
    case 'submitted_for_signoff':
    case 'pending_sign_off': return 'The supplier submitted the completion for review'
    case 'completed': return 'Work was completed'
    case 'cancelled': return 'The ticket was cancelled'
    case 'declined': return 'The ticket was declined'
    default: return null
  }
}

// The SM audit trail: the necessary milestones only (no competitive-quoting
// detail, no "viewed" events). Built from ticket_events (status changes, with a
// fallback for tickets predating the trigger), the award (from the ticket row),
// and the edit. De-duplicated by label so a reschedule doesn't repeat, oldest-first.
function buildSmTimeline(t: TicketRow, events: EventRow[]): TimelineEntry[] {
  const out: TimelineEntry[] = [{ label: 'You logged the ticket', at: t.created_at }]

  // Supplier awarded — taken from the ticket row so it shows regardless of how the
  // approval was recorded. The store manager never sees the quoting that led here.
  if (t.quote_decision_status === 'approved' && t.quote_decided_at) {
    out.push({ label: 'A supplier was assigned to the job', at: t.quote_decided_at })
  }

  for (const ev of events) {
    if (ev.from_status == null) continue // "created" already added above
    const label = lifecycleLabel(ev.from_status, ev.to_status)
    if (label) out.push({ label, at: ev.created_at })
  }
  // Fallback: surface the current "info requested" even if it predates the
  // ticket_events trigger (no captured event) — best-effort timestamp.
  if (t.status === 'info_requested' && t.info_request_reason && !events.some(e => e.to_status === 'info_requested')) {
    out.push({ label: 'Your manager requested more information', at: t.updated_at ?? t.created_at })
  }
  // The SM's (or their manager's) edit to the ticket details is recorded on the
  // ticket row (edited_at), not as a status event, so add it explicitly.
  if (t.edited_at && +new Date(t.edited_at) > +new Date(t.created_at)) {
    const who = t.edited_by && t.edited_by !== t.created_by ? 'Your manager updated the ticket' : 'You edited the ticket'
    const note = typeof t.edit_note === 'string' && t.edit_note.trim() ? ` — ${t.edit_note.trim()}` : ''
    out.push({ label: `${who}${note}`, at: t.edited_at })
  }

  // Oldest-first, then keep the first occurrence of each milestone label.
  const seen = new Set<string>()
  return out
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
    .filter(e => (seen.has(e.label) ? false : (seen.add(e.label), true)))
}

export default async function StoreTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const admin = createAdminClient()
  const [{ storeIds, userId }, { data: t }, { data: updates }, { data: snagRows }, { data: eventRows }] = await Promise.all([
    requireStoreManagerV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('snags').select('scheduled_at, schedule_status, status').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('ticket_events').select('from_status, to_status, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
  ])
  if (!t || !storeIds.includes(t.store_id ?? '')) redirect('/client/tickets')

  const showVisit = !!t.scheduled_at && !['completed', 'cancelled', 'declined'].includes(t.status)
  const photoUrlsRaw = Array.isArray(t.photo_urls) ? t.photo_urls : []
  const docUrlsRaw = Array.isArray(t.info_doc_urls) ? t.info_doc_urls : []
  const [editorName, visitSupplier, visitTech, signedPhotoUrls, signedDocUrls, chatAddedSet, chatCounts] = await Promise.all([
    t.edited_by ? admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single().then(r => r.data?.full_name ?? null) : null,
    showVisit && t.supplier_id ? admin.from('suppliers').select('company_name').eq('id', t.supplier_id).single().then(r => r.data?.company_name ?? null) : null,
    showVisit && t.technician_id ? admin.from('technicians').select('name').eq('id', t.technician_id).single().then(r => r.data?.name ?? null) : null,
    signManyUrls(photoUrlsRaw),
    signManyUrls(docUrlsRaw),
    // Ticket chat: entry points only once a supplier is awarded AND the RM added the SM.
    t.supplier_id ? smChatAdded(admin, [t.id]) : new Set<string>(),
    t.supplier_id ? chatUnreadCounts(admin, userId, [t.id], { smViewer: true }) : ({} as Record<string, number>),
  ])
  const chatAdded = !!t.supplier_id && chatAddedSet.has(t.id)
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

  const timeline = buildSmTimeline(t, eventRows ?? [])

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
            <AddInfoModal ticketId={t.id} title={t.title} description={t.description} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} docUrls={docUrlsRaw} requestReason={t.info_request_reason} />
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
              <EditedLine at={t.edited_at} by={editorName} />
            </div>
            {(showVisit || showFollowUp) && <InfoRow label="Assigned supplier" value={visitSupplier ?? 'Assigned supplier'} />}
            {showVisit && t.scheduled_at && !showFollowUp && (
              <InfoRow label={`Scheduled visit${t.schedule_status === 'proposed' ? ' · proposed' : ''}`} value={`${formatDateTime(t.scheduled_at)}${visitTech ? ` · ${visitTech}` : ''}`} />
            )}
            {showFollowUp && followUp && <InfoRow label="Follow-up visit" value={formatDateTime(followUp.scheduled_at)} />}
            {!showVisit && !showFollowUp && active && <InfoRow label="Assigned supplier" value="Awaiting assignment" />}
          </div>
        </Card>
      </div>

      {/* Photos + documents · Activity · Timeline (audit trail). */}
      {/* body is never null on a real update row — narrow cast so the tabs' Update props typecheck. */}
      <SmTicketTabs photoUrls={signedPhotoUrls} docUrls={signedDocUrls} ticketId={t.id} updates={(updates ?? []) as { body: string; author_role: string | null; created_at: string }[]} timeline={timeline} />

      {/* Floating chat entry — only once the RM has added the SM to this ticket's chat. */}
      {chatAdded && <ChatFab ticketId={t.id} viewerRole="store_manager" unreadCount={chatCounts[t.id] ?? 0} />}
    </div>
  )
}
