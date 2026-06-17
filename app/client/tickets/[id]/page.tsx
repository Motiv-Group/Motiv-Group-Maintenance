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
import { formatDateTime } from '@/lib/utils'

export default async function StoreTicketDetailPage({ params }: { params: { id: string } }) {
  const { storeIds } = await requireStoreManagerV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('*').eq('id', params.id).single()
  if (!t || !storeIds.includes(t.store_id)) redirect('/client/tickets')

  const { data: updates } = await admin.from('ticket_updates').select('body, author_role, created_at').eq('ticket_id', t.id).order('created_at', { ascending: false })
  const isOpen = t.status === 'open'

  return (
    <div className="space-y-5">
      <Link href="/client/tickets" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Back to tickets</Link>

      {/* Progress — its own block, dots */}
      <Card className="p-5"><ClientTicketProgress status={t.status} /></Card>

      {/* Ticket detail */}
      <Card className="p-5 space-y-3">
        <div>
          <h1 className="text-lg font-bold text-white">{t.title}</h1>
          <p className="text-sm text-slate-400">{t.category ?? 'General'} · logged {formatDateTime(t.created_at)}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Description</div>
          <p className="text-sm text-slate-300 whitespace-pre-line">{t.description}</p>
        </div>
        {Array.isArray(t.photo_urls) && t.photo_urls.length > 0 && (
          <div className="flex flex-wrap gap-2">{t.photo_urls.map((u: string, i: number) => <a key={i} href={u} target="_blank" className="text-xs text-[#C6A35D] underline">Photo {i + 1}</a>)}</div>
        )}
      </Card>

      {/* Edit / delete — only while open, directly under the detail */}
      {isOpen && (
        <Card className="p-5">
          <EditTicketForm ticketId={t.id} initial={{ title: t.title, category: t.category ?? 'General', impact: t.operational_impact ?? 'none', description: t.description }} />
        </Card>
      )}

      {/* Plain-language status (no quote/sign-off jargon) + the only SM action: resubmit */}
      <Card className="p-5 space-y-3">
        <ClientTicketStatus status={t.status} />
        <WorkflowActions ticketId={t.id} status={t.status} role="store_manager" />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-3">Activity</h2>
        {(updates ?? []).length ? (updates ?? []).map((u: any, i: number) => (
          <div key={i} className="py-2 border-b border-white/5 last:border-0"><p className="text-sm text-slate-200">{u.body}</p><p className="text-[11px] text-slate-500">{formatDateTime(u.created_at)}</p></div>
        )) : <p className="text-sm text-slate-500">No updates yet.</p>}
      </Card>
    </div>
  )
}
