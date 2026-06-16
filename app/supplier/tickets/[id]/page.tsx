export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { SupplierTicketActions } from '@/components/exec/SupplierTicketActions'
import { formatDateTime } from '@/lib/utils'

export default async function SupplierTicketDetailPage({ params }: { params: { id: string } }) {
  const { supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !t.supplier_id || !supplierIds.includes(t.supplier_id)) redirect('/supplier/tickets')
  const [{ data: store }, { data: updates }] = await Promise.all([
    admin.from('stores').select('name, sub_store').eq('id', t.store_id).single(),
    admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false }),
  ])
  const storeName = store ? [store.name, store.sub_store].filter(Boolean).join(' — ') : 'Store'

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link href="/supplier/tickets" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Back to tickets</Link>

      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div><h1 className="text-lg font-bold text-white">{t.title}</h1><p className="text-sm text-slate-400">{storeName} · {t.priority} · {t.category ?? 'General'}</p></div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 capitalize">{String(t.status).replace(/_/g, ' ')}</span>
        </div>
        <p className="text-sm text-slate-300">{t.description}</p>
        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div className="flex flex-wrap gap-2">{t.photo_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" className="text-xs text-[#C6A35D] underline">Photo {i + 1}</a>)}</div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-3">Actions</h2>
        <SupplierTicketActions ticketId={t.id} status={t.status} acknowledged={!!t.first_response_at} before={!!t.before_photo_uploaded} after={!!t.after_photo_uploaded} coc={!!t.completion_certificate_uploaded} quoteSubmitted={!!t.quote_submitted_at} />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-3">Updates</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-white/5 last:border-0"><p className="text-sm text-slate-200">{u.body}</p><p className="text-[11px] text-slate-500">{u.author_role} · {formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-slate-500">No updates yet.</p>}
      </Card>
    </div>
  )
}
