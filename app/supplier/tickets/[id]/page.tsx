export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { StatusPipeline } from '@/components/workflow/StatusPipeline'
import { SupplierAttachments } from '@/components/workflow/SupplierAttachments'
import { SupplierQuoteCard } from '@/components/supplier/SupplierQuoteCard'
import { ScheduleJobCard, SubmitCompletionCard } from '@/components/supplier/SupplierJobActions'
import { formatDateTime } from '@/lib/utils'

export default async function SupplierTicketDetailPage({ params }: { params: { id: string } }) {
  const { supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !t.supplier_id || !supplierIds.includes(t.supplier_id)) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }, { data: invite }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_suppliers').select('status').eq('ticket_id', t.id).in('supplier_id', supplierIds).maybeSingle(),
  ])
  const storeName = store ? [store.name, store.sub_store].filter(Boolean).join(' — ') : 'Store'
  // Invited to quote (competitive model) and not yet awarded/declined → can quote.
  const canQuote = (invite?.status === 'invited' || invite?.status === 'quoted')

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link href="/supplier/tickets" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to tickets</Link>

      <Card className="p-5 space-y-4">
        <div>
          {t.job_ref && <p className="text-[11px] font-mono font-semibold tracking-wide text-[var(--text-faint)] mb-0.5">{t.job_ref}</p>}
          <h1 className="text-lg font-bold text-[var(--text)]">{t.title}</h1>
          <p className="text-sm text-[var(--text-muted)]">{storeName} · {t.priority} · {t.category ?? 'General'}</p>
        </div>
        <StatusPipeline status={t.status} />
        <p className="text-sm text-[var(--text)]">{t.description}</p>
        {t.scheduled_at && <p className="text-xs text-[var(--text-muted)]">Scheduled: {formatDateTime(t.scheduled_at)}</p>}
        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div className="flex flex-wrap gap-2">{t.photo_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" className="text-xs text-[#C6A35D] underline">Photo {i + 1}</a>)}</div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Next step</h2>
        {canQuote && <SupplierQuoteCard ticketId={t.id} alreadyQuoted={invite?.status === 'quoted'} />}
        {t.status === 'accepted' && <ScheduleJobCard ticketId={t.id} priority={t.priority} createdAt={t.created_at} />}
        {['in_progress', 'snag_resolved', 'evidence_requested'].includes(t.status) && <SubmitCompletionCard ticketId={t.id} />}
        <WorkflowActions ticketId={t.id} status={t.status} role="supplier" exclude={['schedule', 'submit_completion']} />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Post an update</h2>
        <SupplierAttachments ticketId={t.id} />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Updates</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-[var(--border)] last:border-0"><p className="text-sm text-[var(--text)]">{u.body}</p><p className="text-[11px] text-[var(--text-faint)]">{u.author_role} · {formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>}
      </Card>
    </div>
  )
}
