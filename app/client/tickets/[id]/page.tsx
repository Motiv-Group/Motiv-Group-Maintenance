export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { WorkflowActions } from '@/components/workflow/WorkflowActions'
import { StatusPipeline } from '@/components/workflow/StatusPipeline'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export default async function StoreTicketDetailPage({ params }: { params: { id: string } }) {
  const { storeIds } = await requireStoreManagerV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !storeIds.includes(t.store_id)) redirect('/client/tickets')

  const [{ data: quotes }, { data: updates }] = await Promise.all([
    admin.from('quotes').select('amount, status, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/client/tickets" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Back to my tickets</Link>

      <Card className="p-5 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">{t.title}</h1>
          <p className="text-sm text-slate-400">Priority {t.priority} · {t.category ?? 'General'} · logged {formatDateTime(t.created_at)}</p>
        </div>
        <StatusPipeline status={t.status} />
        <p className="text-sm text-slate-300">{t.description}</p>
        {t.info_request_reason && <p className="text-xs text-amber-400">More info requested: {t.info_request_reason}</p>}
        {t.scheduled_at && <p className="text-xs text-slate-400">Scheduled: {formatDateTime(t.scheduled_at)}</p>}
        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div className="flex flex-wrap gap-2">{t.photo_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" className="text-xs text-[#C6A35D] underline">Photo {i + 1}</a>)}</div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-3">Your actions</h2>
        <WorkflowActions ticketId={t.id} status={t.status} role="store_manager" />
        <p className="text-xs text-slate-500 mt-2">Quotes, scheduling and sign-off are handled by your regional manager and supplier — you&apos;ll see progress here.</p>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-3">Activity</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-white/5 last:border-0"><p className="text-sm text-slate-200">{u.body}</p><p className="text-[11px] text-slate-500">{u.author_role} · {formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-slate-500">No updates yet.</p>}
        {(quotes ?? []).length > 0 && <p className="text-xs text-slate-500 mt-2">{quotes!.length} quote(s) · latest {formatCurrency(quotes![0].amount)} ({quotes![0].status})</p>}
      </Card>
    </div>
  )
}
