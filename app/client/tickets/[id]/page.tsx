export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { CalendarClock, Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { Card } from '@/components/exec/ui'
import { ClientTicketProgress } from '@/components/client/ClientTicketProgress'
import { clientStatusMeta } from '@/components/client/ClientTicketStatus'
import { EditTicketForm } from '@/components/client/EditTicketForm'
import { AddInfoForm } from '@/components/client/AddInfoForm'
import { SmTicketTabs } from '@/components/client/SmTicketTabs'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EditedLine } from '@/components/ui/EditedLine'
import { formatDateTime, humanizeDuration, clientVisibleStatus, storeLabel } from '@/lib/utils'
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

function InfoRow({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-600 dark:text-red-400 font-semibold'
    : tone === 'amber' ? 'text-amber-600 dark:text-[#C6A35D] font-semibold'
    : 'text-[var(--text)]'
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className={`text-sm mt-0.5 ${color}`}>{value}</div>
    </div>
  )
}

export default async function StoreTicketDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const admin = createAdminClient()
  const [{ storeIds }, { data: t }, { data: updates }, { data: snagRows }] = await Promise.all([
    requireStoreManagerV3(),
    admin.from('tickets').select('*').eq('id', params.id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', params.id).order('created_at', { ascending: false }),
    admin.from('snags').select('scheduled_at, schedule_status, status').eq('ticket_id', params.id).order('created_at', { ascending: false }),
  ])
  if (!t || !storeIds.includes(t.store_id ?? '')) redirect('/client/tickets')

  const showVisit = !!t.scheduled_at && !['completed', 'cancelled', 'declined'].includes(t.status)
  const photoUrlsRaw = Array.isArray(t.photo_urls) ? (t.photo_urls as string[]) : []
  const [editorName, visitSupplier, visitTech, rules, signedPhotoUrls, storeRow] = await Promise.all([
    t.edited_by ? admin.from('user_profiles').select('full_name').eq('id', t.edited_by).single().then(r => r.data?.full_name ?? null) : null,
    showVisit && t.supplier_id ? admin.from('suppliers').select('company_name').eq('id', t.supplier_id).single().then(r => r.data?.company_name ?? null) : null,
    showVisit && t.technician_id ? admin.from('technicians').select('name').eq('id', t.technician_id).single().then(r => r.data?.name ?? null) : null,
    loadSlaResolver(admin, t.company_id),
    signManyUrls(photoUrlsRaw),
    admin.from('stores').select('name, sub_store').eq('id', t.store_id ?? '').single().then(r => r.data),
  ])
  const followUp = ((snagRows ?? []) as any[]).find(s => s.scheduled_at && s.schedule_status === 'agreed' && ['assigned', 'in_progress'].includes(s.status)) ?? null
  const showFollowUp = !!followUp && !['completed', 'cancelled', 'declined'].includes(t.status)
  const infoAdded = t.status === 'open' && !!t.info_request_reason
  // Edit / delete only while the ticket is genuinely fresh-open.
  const canEdit = t.status === 'open' && !t.info_request_reason
  const storeName = storeRow ? storeLabel(storeRow.name, storeRow.sub_store) : 'Your store'

  // SLA due date (final resolution deadline) + overdue state.
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const active = isActive(t.status)
  const overdue = active && now.getTime() > new Date(dueAt).getTime()

  // Plain-language status + the SM's only real actions (add info / edit).
  const meta = clientStatusMeta(t.status)
  const done = t.status === 'completed'
  const closed = t.status === 'cancelled' || t.status === 'declined'
  const spinning = !done && !closed
  const isWait = meta.mode === 'wait'
  const NaIcon = done ? CheckCircle2 : closed ? XCircle : Loader2
  const naColor = done ? 'text-emerald-500' : closed ? 'text-[var(--text-faint)]' : isWait ? 'text-blue-500' : 'text-[#C6A35D]'
  const action = t.status === 'info_requested' ? 'Add the requested info' : canEdit ? 'Edit ticket' : null

  // Header status pill.
  const cv = clientVisibleStatus(t.status as TicketStatus)
  const pill = infoAdded
    ? { cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-400', word: 'Info added' }
    : cv ? { cls: CV_TONE[cv], word: CV_WORD[cv] } : null

  const slaValue = !active ? '—' : overdue ? `Overdue by ${humanizeDuration(now.getTime() - new Date(dueAt).getTime())}` : `${humanizeDuration(new Date(dueAt).getTime() - now.getTime())} remaining`

  return (
    <div className="space-y-4">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      {/* Header: reference, title, priority + status, context line, stepper */}
      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {t.job_ref && <span className="font-mono text-sm font-semibold text-[var(--text-faint)]">{t.job_ref}</span>}
              <h1 className="text-xl font-bold text-[var(--text)]">{t.title}</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {storeName} · {t.category ?? 'General'} · Reported {formatDateTime(t.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PriorityBadge priority={t.priority} />
            {pill && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${pill.cls}`}>{pill.word}</span>}
          </div>
        </div>

        {!['cancelled', 'declined'].includes(t.status) && <ClientTicketProgress status={t.status} />}

        {t.description && (
          <div className="border-t border-[var(--border)] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
            <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p>
            <EditedLine at={t.edited_at} by={editorName} />
          </div>
        )}
      </Card>

      {/* Three columns: Next action · Ticket information · Timeline */}
      <div className="grid gap-4 lg:grid-cols-3">
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
          {action ? (
            <a href="#sm-action" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500">
              {action} <ArrowRight size={16} />
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
            <InfoRow label="Logged" value={formatDateTime(t.created_at)} />
            <InfoRow label="SLA target" value={formatDateTime(dueAt)} />
            <InfoRow label="SLA status" value={slaValue} tone={overdue ? 'red' : active ? 'amber' : undefined} />
            {(showVisit || showFollowUp) && (
              <InfoRow label="Assigned supplier" value={visitSupplier ?? 'Assigned supplier'} />
            )}
            {showVisit && t.scheduled_at && !showFollowUp && (
              <InfoRow label={`Scheduled visit${t.schedule_status === 'proposed' ? ' · proposed' : ''}`} value={`${formatDateTime(t.scheduled_at)}${visitTech ? ` · ${visitTech}` : ''}`} />
            )}
            {showFollowUp && followUp && (
              <InfoRow label="Follow-up visit" value={formatDateTime(followUp.scheduled_at)} />
            )}
            {!showVisit && !showFollowUp && active && (
              <InfoRow label="Assigned supplier" value="Awaiting assignment" />
            )}
          </div>
        </Card>

        {/* Timeline (activity preview) */}
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Timeline</h2>
          {(updates ?? []).length ? (
            <ol className="space-y-3">
              {(updates ?? []).slice(0, 5).map((u: any, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1 grid place-items-center">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text)]">{u.body}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>
          )}
        </Card>
      </div>

      {/* Action zone — the SM's only interactions (add info / edit). */}
      {(t.status === 'info_requested' || canEdit) && (
        <div id="sm-action" className="space-y-4 scroll-mt-20">
          {t.status === 'info_requested' && (
            <>
              <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/40 p-5 space-y-1">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">More information requested</p>
                <p className="text-sm text-[var(--text-muted)]">{t.info_request_reason || 'Add the requested details (and any extra photos) below, then resubmit.'}</p>
              </div>
              <AddInfoForm ticketId={t.id} title={t.title} description={t.description} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={photoUrlsRaw} />
            </>
          )}
          {canEdit && (
            <EditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', description: t.description }} />
          )}
        </div>
      )}

      {/* Photos + full Activity — the only lower tabs an SM can access. */}
      <SmTicketTabs photoUrls={signedPhotoUrls} ticketId={t.id} updates={(updates ?? []) as any} />
    </div>
  )
}
