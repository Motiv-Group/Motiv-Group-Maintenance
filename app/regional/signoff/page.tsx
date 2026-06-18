export const dynamic = 'force-dynamic'

import { ClipboardCheck } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RegionalSignoffReview, type SignoffRow } from '@/components/exec/RegionalSignoffReview'

export default async function RegionalSignoffPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let rows: SignoffRow[] = []
  if (regionIds.length) {
    const { data: tickets } = await admin.from('tickets').select('id, title, store_id').eq('company_id', companyId).in('region_id', regionIds).eq('status', 'submitted_for_signoff')
    const tks = tickets ?? []
    if (tks.length) {
      const ids = tks.map(t => t.id)
      const [{ data: signoffs }, { data: stores }] = await Promise.all([
        admin.from('signoffs').select('id, ticket_id, before_urls, after_urls, coc_url, status').in('ticket_id', ids).in('status', ['submitted', 'awaiting_regional', 'awaiting_store']),
        admin.from('stores').select('id, name, sub_store').in('id', Array.from(new Set(tks.map(t => t.store_id)))),
      ])
      const storeName = new Map((stores ?? []).map((s: any) => [s.id, [s.name, s.sub_store].filter(Boolean).join(' — ')]))
      const titleOf = new Map(tks.map(t => [t.id, t.title]))
      const storeOf = new Map(tks.map(t => [t.id, t.store_id]))
      rows = (signoffs ?? []).map((s: any) => ({
        signoffId: s.id, ticketId: s.ticket_id, title: titleOf.get(s.ticket_id) ?? 'Ticket',
        storeName: storeName.get(storeOf.get(s.ticket_id)) ?? 'Store',
        before: s.before_urls ?? [], after: s.after_urls ?? [], coc: s.coc_url ?? null,
      }))
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Sign-off</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Review supplier-submitted jobs. Accept to complete, or reject for more evidence.</p></div>
      <RegionalSignoffReview rows={rows} />
    </div>
  )
}
