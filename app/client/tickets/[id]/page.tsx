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
import { EditTicketModal } from '@/components/client/EditTicketModal'
import { AddInfoModal } from '@/components/client/AddInfoModal'
import { DeleteTicketButton } from '@/components/client/DeleteTicketButton'
import { SmTicketTabs } from '@/components/client/SmTicketTabs'
import { TicketBadges } from '@/components/client/ticketBadges'
import { EditedLine } from '@/components/ui/EditedLine'
import { formatDateTime, clientVisibleStatus, PRIORITY_LEVEL_LABELS, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import type { StoreManagerTicket } from '@/lib/health/data'
import type { TicketStatus } from '@/lib/types'

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
type ViewRow = { viewer_role: string | null; item_type: string; item_label: string; first_viewed_at: string }

// The store manager only ever sees role-based actors (no internal staff names),
// so each viewer role maps to a plain label.
function viewerWho(role: string | null): string {
  if (role === 'regional_manager') return 'Your manager'
  if (role === 'supplier') return 'The supplier'
  if (role === 'store_manager' || role === 'client') return 'You'
  if (role === 'executive' || role === 'system_admin') return 'An administrator'
  return 'Someone'
}

// SM-safe label for a status transition. Quote / assignment / sign-off changes
// collapse to the same client-visible status and are dropped.
function lifecycleLabel(from: string | null, to: string): string | null {
  if (to === 'info_requested') return 'Your manager requested more information'
  if (from === 'info_requested' && to === 'open') return 'You added the requested information'
  const cvTo = clientVisibleStatus(to as TicketStatus)
  if (from != null && cvTo === clientVisibleStatus(from as TicketStatus)) return null
  return cvTo === 'scheduled' ? 'A visit was scheduled'
    : cvTo === 'in_progress' ? 'The supplier started work'
    : cvTo === 'completed' ? 'Work was completed'
    : cvTo === 'cancelled' ? 'The ticket was cancelled' : null
}

// The SM audit trail: who did what / viewed what. Merges the status-change trail
// (ticket_events, with a fallback for tickets created before the trigger) with
// the view log (ticket_views), sorted oldest-first.
function buildSmTimeline(t: any, events: EventRow[], views: ViewRow[]): TimelineEntry[] {
  const out: TimelineEntry[] = [{ label: 'You logged the ticket', at: t.created_at }]

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

  for (const v of views) {
    const verb = v.item_type === 'photo' || v.item_type === 'photos' ? 'viewed' : 'opened'
    const item = v.item_label || (v.item_type.startsWith('photo') ? 'a photo' : 'an attachment')
    out.push({ label: `${viewerWho(v.viewer_role)} ${verb} ${item}`, at: v.first_viewed_at })
  }

  return out.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

export default async function StoreTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const admin = createAdminClient()
  const [{ storeIds }, { data: t }, { data: updates }, { data: snagRows }, { data: eventRows }, { data: viewRows }] = await Promise.all([
    requireStoreManagerV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('snags').select('scheduled_at, schedule_status, status').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    (admin as any).from('ticket_events').select('from_status, to_status, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
    admin.from('ticket_views').select('viewer_role, item_type, item_label, first_viewed_at').eq('ticket_id', params.id),
  ])
  if (!t || !storeIds.includes(t.store_id ?? '')) redirect('/client/tickets')

  const showVisit = !!t.scheduled_at && !['completed', 'cancelled', 'declined'].includes(t.status)
  const photoUrlsRaw = Array.isArray(t.photo_urls) ? (t.photo_urls as string[]) : []
  const docUrlsRaw = Array.isArray((t as any).info_doc_urls) ? ((t as any).info_doc_urls as string[]) : []
  const [editorName, visitSupplier, visitTech, signedPhotoUrls, signedDocUrls] = await Promise.all([
    t.edited_by ? admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single().then(r => r.data?.full_name ?? null) : null,
    showVisit && t.supplier_id ? admin.from('suppliers').select('company_name').eq('id', t.supplier_id).single().then(r => r.data?.company_name ?? null) : null,
    showVisit && t.technician_id ? admin.from('technicians').select('name').eq('id', t.technician_id).single().then(r => r.data?.name ?? null) : null,
    signManyUrls(photoUrlsRaw),
    signManyUrls(docUrlsRaw),
  ])
  const followUp = ((snagRows ?? []) as any[]).find(s => s.scheduled_at && s.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(s.status)) ?? null
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
  const naColor = done ? 'text-emerald-500' : closed ? 'text-[var(--text-faint)]' : isWait ? 'text-blue-500' : 'text-[#C6A35D]'

  const cv = clientVisibleStatus(t.status as TicketStatus)
  // Priority + status badges rendered with the same component (and sizing) as the
  // today page / Tickets tab, so they match everywhere.
  const badgeTicket = { priority: t.priority, status: (cv ?? t.status) as any, infoAdded } as unknown as StoreManagerTicket

  const timeline = buildSmTimeline(t, (eventRows ?? []) as EventRow[], (viewRows ?? []) as ViewRow[])

  return (
    <div className="space-y-4">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      {/* Header: reference, title, priority + status, stepper */}
      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
            <h1 className="text-xl font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <TicketBadges ticket={badgeTicket} className="shrink-0" />
        </div>

        {!['cancelled', 'declined'].includes(t.status) && <ClientTicketProgress status={t.status} />}
      </Card>

      {/* Two columns: Next action · Ticket information */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Next action */}
        <Card className="p-5">
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
            <div className="mt-4 space-y-2">
              <EditTicketModal ticketId={t.id} title={t.title} description={t.description ?? ''} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} />
              <DeleteTicketButton ticketId={t.id} />
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              <span>You&apos;re all set. We&apos;ll let you know when there&apos;s an update.</span>
            </div>
          )}
        </Card>

        {/* Ticket information */}
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Ticket information</h2>
          <div className="space-y-3">
            <InfoRow label="Category" value={t.category ?? 'General'} />
            <InfoRow label="Priority" value={priorityValue} />
            <InfoRow label="Logged" value={formatDateTime(t.created_at)} />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Description</div>
              <p className="text-sm text-[var(--text)] mt-0.5 whitespace-pre-line">{t.description}</p>
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
      <SmTicketTabs photoUrls={signedPhotoUrls} docUrls={signedDocUrls} ticketId={t.id} updates={(updates ?? []) as any} timeline={timeline} />
    </div>
  )
}
