export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { ClientTicketProgress } from '@/components/client/ClientTicketProgress'
import { clientStatusMeta } from '@/components/client/ClientTicketStatus'
import { EditTicketForm } from '@/components/client/EditTicketForm'
import { AddInfoModal } from '@/components/client/AddInfoModal'
import { SmTicketTabs } from '@/components/client/SmTicketTabs'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { formatDateTime, clientVisibleStatus, PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const CV_TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  info_requested: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  scheduled: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const CV_WORD: Record<string, string> = { open: 'New', info_requested: 'Info Requested', scheduled: 'Job scheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

// Build the SM-safe status-change trail from ticket_events (ascending). Quote /
// assignment / sign-off transitions collapse to the same client-visible status,
// so they're dropped — the SM only sees plain milestones.
function smTimeline(events: { from_status: string | null; to_status: string; created_at: string }[], createdAt: string): { label: string; at: string }[] {
  const out: { label: string; at: string }[] = []
  let sawCreated = false
  for (const ev of events) {
    const to = ev.to_status
    if (ev.from_status == null) { out.push({ label: 'Ticket logged', at: ev.created_at }); sawCreated = true; continue }
    if (to === 'info_requested') { out.push({ label: 'More information requested', at: ev.created_at }); continue }
    if (ev.from_status === 'info_requested' && to === 'open') { out.push({ label: 'Information added', at: ev.created_at }); continue }
    const cvTo = clientVisibleStatus(to as TicketStatus)
    if (cvTo === clientVisibleStatus(ev.from_status as TicketStatus)) continue
    const label = cvTo === 'scheduled' ? 'Visit scheduled'
      : cvTo === 'in_progress' ? 'Work started'
      : cvTo === 'completed' ? 'Completed'
      : cvTo === 'cancelled' ? 'Cancelled' : null
    if (label) out.push({ label, at: ev.created_at })
  }
  if (!sawCreated) out.unshift({ label: 'Ticket logged', at: createdAt })
  return out
}

export default async function StoreTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const admin = createAdminClient()
  const [{ storeIds }, { data: t }, { data: updates }, { data: snagRows }, { data: eventRows }] = await Promise.all([
    requireStoreManagerV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('snags').select('scheduled_at, schedule_status, status').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    (admin as any).from('ticket_events').select('from_status, to_status, created_at').eq('ticket_id', params.id).order('created_at', { ascending: true }),
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

  // Plain-language status + the SM's only real actions (add info / edit).
  const meta = clientStatusMeta(t.status)
  const done = t.status === 'completed'
  const closed = t.status === 'cancelled' || t.status === 'declined'
  const spinning = !done && !closed
  const isWait = meta.mode === 'wait'
  const NaIcon = done ? CheckCircle2 : closed ? XCircle : Loader2
  const naColor = done ? 'text-emerald-500' : closed ? 'text-[var(--text-faint)]' : isWait ? 'text-blue-500' : 'text-[#C6A35D]'

  const cv = clientVisibleStatus(t.status as TicketStatus)
  const pill = infoAdded
    ? { cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-400', word: 'Info added' }
    : cv ? { cls: CV_TONE[cv], word: CV_WORD[cv] } : null

  const timeline = smTimeline((eventRows ?? []) as any[], t.created_at)

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
          <div className="flex shrink-0 items-center gap-2">
            <PriorityBadge priority={t.priority} />
            {pill && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pill.cls}`}>{pill.word}</span>}
          </div>
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
          {t.status === 'info_requested' ? (
            <AddInfoModal ticketId={t.id} title={t.title} description={t.description} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} docUrls={docUrlsRaw} requestReason={t.info_request_reason} />
          ) : canEdit ? (
            <a href="#sm-action" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500">
              Edit ticket <ArrowRight size={16} />
            </a>
          ) : (
            <p className="mt-4 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-faint)]">Nothing needed from you right now — we&apos;ll notify you of any updates.</p>
          )}
        </Card>

        {/* Ticket information */}
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Ticket information</h2>
          <div className="space-y-3">
            <InfoRow label="Category" value={t.category ?? 'General'} />
            <InfoRow label="Priority" value={PRIORITY_LEVEL_LABELS[String(t.priority)] ?? 'Medium'} />
            {(showVisit || showFollowUp) && <InfoRow label="Assigned supplier" value={visitSupplier ?? 'Assigned supplier'} />}
            {showVisit && t.scheduled_at && !showFollowUp && (
              <InfoRow label={`Scheduled visit${t.schedule_status === 'proposed' ? ' · proposed' : ''}`} value={`${formatDateTime(t.scheduled_at)}${visitTech ? ` · ${visitTech}` : ''}`} />
            )}
            {showFollowUp && followUp && <InfoRow label="Follow-up visit" value={formatDateTime(followUp.scheduled_at)} />}
            {!showVisit && !showFollowUp && active && <InfoRow label="Assigned supplier" value="Awaiting assignment" />}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Description</div>
              <p className="text-sm text-[var(--text-muted)] mt-0.5 whitespace-pre-line">{t.description}</p>
              <EditedLine at={t.edited_at} by={editorName} />
            </div>
          </div>
        </Card>
      </div>

      {/* Edit form — the only inline action left (add-info now lives in a modal). */}
      {canEdit && (
        <div id="sm-action" className="scroll-mt-20">
          <EditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', description: t.description }} />
        </div>
      )}

      {/* Photos + documents · Activity · Timeline (audit trail). */}
      <SmTicketTabs photoUrls={signedPhotoUrls} docUrls={signedDocUrls} ticketId={t.id} updates={(updates ?? []) as any} timeline={timeline} />
    </div>
  )
}
