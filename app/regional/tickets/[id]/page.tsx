export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { StatusPipeline } from '@/components/workflow/StatusPipeline'
import { formatCurrency, formatDateTime } from '@/lib/utils'

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

      <Card className="p-5 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          <p className="text-sm text-[var(--text-muted)]">{storeName} · {t.priority} · {t.category ?? 'General'}</p>
        </div>
        <StatusPipeline status={t.status} />
        <p className="text-sm text-[var(--text)]">{t.description}</p>
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
