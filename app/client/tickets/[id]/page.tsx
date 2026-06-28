export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { loadSlaResolver } from '@/lib/health/data'
import { deriveDueDates } from '@/lib/health/priority'
import { isActive } from '@/lib/health/types'
import type { HealthTicket, Priority } from '@/lib/health/types'
import { Card } from '@/components/exec/ui'
import { ClientTicketProgress } from '@/components/client/ClientTicketProgress'
import { ClientTicketStatus } from '@/components/client/ClientTicketStatus'
import { EditTicketForm } from '@/components/client/EditTicketForm'
import { AddInfoForm } from '@/components/client/AddInfoForm'
import { DueDate } from '@/components/workflow/DueDate'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { formatDateTime, humanizeDuration, clientVisibleStatus } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const CV_TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  info_requested: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const CV_WORD: Record<string, string> = { open: 'Open', info_requested: 'Info Requested', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export default async function StoreTicketDetailPage({ params }: { params: { id: string } }) {
  const { storeIds } = await requireStoreManagerV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !storeIds.includes(t.store_id)) redirect('/client/tickets')

  const { data: updates } = await admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false })
  // Edit / delete only while the ticket is still open — once the RM has acted
  // (e.g. requested info, assigned), the SM can only add info via AddInfoForm.
  const canEdit = t.status === 'open'

  // SLA due date (final resolution deadline) + overdue state.
  const rules = await loadSlaResolver(admin, t.company_id)
  const now = new Date()
  const dueAt = deriveDueDates(t as HealthTicket, rules(t.priority as Priority)).resolutionDue
  const overdue = isActive(t.status) && now.getTime() > new Date(dueAt).getTime()

  return (
    <div className="space-y-5">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      {/* Progress — its own block, dots */}
      <Card className="p-5"><ClientTicketProgress status={t.status} /></Card>

      {/* Ticket detail — all info, structured */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-fit shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} />
            {(() => {
              const cv = clientVisibleStatus(t.status as TicketStatus)
              return cv ? <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full text-center ${CV_TONE[cv]}`}>{CV_WORD[cv]}</span> : null
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Logged</div>
            <div className="text-sm text-[var(--text)] mt-0.5">{formatDateTime(t.created_at)}</div>
            {overdue && <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-0.5">Overdue by {humanizeDuration(now.getTime() - new Date(dueAt).getTime())}</div>}
          </div>
          <DueDate dueAt={dueAt} overdue={overdue} now={now.toISOString()} showOverdueText={false} />
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Description</div>
          <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{t.description}</p>
        </div>

        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Photos</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {t.photo_urls.map((u: string, i: number) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C6A35D] underline hover:text-amber-500">Photo {i + 1}</a>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* More info requested by the RM — show the message + an add-info / resubmit form */}
      {t.status === 'info_requested' && (
        <>
          <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/40 p-5 space-y-1">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">More information requested</p>
            <p className="text-sm text-[var(--text-muted)]">{t.info_request_reason || 'Add the requested details (and any extra photos) below, then resubmit.'}</p>
          </div>
          <AddInfoForm ticketId={t.id} title={t.title} description={t.description} category={t.category ?? 'General'} impact={t.operational_impact ?? 'none'} photoUrls={Array.isArray(t.photo_urls) ? t.photo_urls : []} />
        </>
      )}

      {/* Edit / delete — only while the ticket is still open (RM hasn't acted yet) */}
      {canEdit && (
        <EditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', description: t.description }} />
      )}

      {/* Plain-language status (no quote/sign-off jargon) — its own accented card */}
      <ClientTicketStatus status={t.status} cancellationReason={t.cancellation_reason} />

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Activity</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-[var(--border)] last:border-0"><p className="text-sm text-[var(--text)]">{u.body}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>}
      </Card>
    </div>
  )
}
