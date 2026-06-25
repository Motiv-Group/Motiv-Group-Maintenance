export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { RmPipeline } from '@/components/regional/RmPipeline'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { formatCurrency, formatDateTime, clientVisibleStatus, OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import type { TicketStatus } from '@/lib/types'

const CV_TONE: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  in_progress: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D]',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
}
const CV_WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5">{value}</div>
    </div>
  )
}

export default async function RegionalTicketDetailPage({ params }: { params: { id: string } }) {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !t.region_id || !regionIds.includes(t.region_id)) redirect('/regional/tickets')

  const [{ data: store }, { data: quotes }, { data: updates }, { data: signoffs }, { data: suppliers }, { data: variations }, { data: snags }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('quotes').select('id, amount, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('signoffs').select('id, status, before_urls, after_urls, coc_url').eq('ticket_id', t.id).in('status', ['submitted', 'awaiting_regional', 'awaiting_store']).order('created_at', { ascending: false }),
    admin.from('suppliers').select('id, company_name').eq('company_id', companyId).eq('active', true).order('company_name'),
    admin.from('ticket_variations').select('description, amount, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('snags').select('description, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])
  const storeName = store ? [store.name, store.sub_store].filter(Boolean).join(' — ') : 'Store'
  const pendingSignoff = (signoffs ?? [])[0] ?? null

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link href="/regional/tickets" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to tickets</Link>

      {/* Progress — its own block, outside the description (like the SM view) */}
      <Card className="p-5"><RmPipeline status={t.status} /></Card>

      {/* Ticket detail — structured, mirrors the SM layout */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
            <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          </div>
          <div className="grid grid-cols-[4.5rem_6rem] gap-1.5 shrink-0 justify-items-end">
            <PriorityBadge priority={t.priority} className="w-full text-center" />
            {(() => {
              const cv = clientVisibleStatus(t.status as TicketStatus)
              return cv ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${CV_TONE[cv]}`}>{CV_WORD[cv]}</span> : null
            })()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailItem label="Store" value={storeName} />
          <DetailItem label="Category" value={t.category ?? 'General'} />
          <DetailItem label="Operational Impact" value={OPERATIONAL_IMPACT_LABELS[t.operational_impact ?? 'none'] ?? 'No operational impact'} />
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

        {t.info_request_reason && <p className="text-xs text-amber-600 dark:text-amber-400">Info requested: {t.info_request_reason}</p>}
        {t.scheduled_at && <p className="text-xs text-[var(--text-muted)]">Scheduled: {formatDateTime(t.scheduled_at)}</p>}
      </Card>

      {pendingSignoff && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-2">Submitted evidence</h2>
          <div className="flex flex-wrap gap-3 text-xs">
            {(pendingSignoff.before_urls ?? []).map((u: string, i: number) => <a key={`b${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">Before {i + 1}</a>)}
            {(pendingSignoff.after_urls ?? []).map((u: string, i: number) => <a key={`a${i}`} href={u} target="_blank" className="text-[#C6A35D] underline">After {i + 1}</a>)}
            {pendingSignoff.coc_url && <a href={pendingSignoff.coc_url} target="_blank" className="text-[#C6A35D] underline">COC</a>}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Actions</h2>
        <WorkflowActions
          ticketId={t.id} status={t.status} role="regional_manager"
          suppliers={(suppliers ?? []).map((s: any) => ({ id: s.id, name: s.company_name }))}
        />
      </Card>

      {(variations ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Variations</h2>
          {(variations ?? []).map((v: any, i: number) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0 flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-sm text-[var(--text)]">{v.description}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(v.created_at)}</p></div>
              <span className="text-xs text-[var(--text)] whitespace-nowrap">{v.amount ? formatCurrency(v.amount) : '—'} · {v.status}</span>
            </div>
          ))}
        </Card>
      )}

      {(snags ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">Snags</h2>
          {(snags ?? []).map((s: any, i: number) => (
            <div key={i} className="py-2 border-b border-[var(--border)] last:border-0 flex items-start justify-between gap-2">
              <p className="text-sm text-[var(--text)] min-w-0">{s.description ?? 'Snag'}</p>
              <span className="text-xs text-[var(--text)] capitalize whitespace-nowrap">{String(s.status).replace(/_/g, ' ')}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">History</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-[var(--border)] last:border-0"><p className="text-sm text-[var(--text)]">{u.body}</p><p className="text-[11px] text-[var(--text-faint)]">{u.author_role} · {formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>}
        {(quotes ?? []).length > 0 && <p className="text-xs text-[var(--text-faint)] mt-2">{quotes!.length} quote(s) · latest {formatCurrency(quotes![0].amount)}</p>}
      </Card>
    </div>
  )
}
