export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { ClientTicketProgress } from '@/components/client/ClientTicketProgress'
import { ClientTicketStatus } from '@/components/client/ClientTicketStatus'
import { EditTicketForm } from '@/components/client/EditTicketForm'
import { formatDateTime, clientVisibleStatus, OPERATIONAL_IMPACT_LABELS, PRIORITY_LEVEL_LABELS } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const CV_TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
}
const CV_WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }

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
  const isOpen = t.status === 'open'

  return (
    <div className="space-y-5">
      <Link href="/client/tickets" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to tickets</Link>

      {/* Progress — its own block, dots */}
      <Card className="p-5"><ClientTicketProgress status={t.status} /></Card>

      {/* Ticket detail — all info, structured */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-[var(--text)] min-w-0">{t.title}</h1>
          {(() => {
            const cv = clientVisibleStatus(t.status as TicketStatus)
            return cv ? <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${CV_TONE[cv]}`}>{CV_WORD[cv]}</span> : null
          })()}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
          <DetailItem label="Priority" value={PRIORITY_LEVEL_LABELS[t.priority] ?? '—'} />
          <DetailItem label="Logged" value={formatDateTime(t.created_at)} />
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

      {/* Edit / delete — only while open, out of the card, spanning the block width */}
      {isOpen && (
        <EditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', description: t.description }} />
      )}

      {/* Plain-language status (no quote/sign-off jargon) + the only SM action: resubmit */}
      <Card className="p-5 space-y-3">
        <ClientTicketStatus status={t.status} />
        <WorkflowActions ticketId={t.id} status={t.status} role="store_manager" />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Activity</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-[var(--border)] last:border-0"><p className="text-sm text-[var(--text)]">{u.body}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>}
      </Card>
    </div>
  )
}
