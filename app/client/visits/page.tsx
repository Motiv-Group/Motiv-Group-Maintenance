export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { CalendarClock, Wrench, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { formatDateTime, storeLabel } from '@/lib/utils'

// Store-manager "Visits" tab — every upcoming supplier visit across the SM's
// stores, so they know who is coming on site and when. Past/closed jobs drop off.
export default async function StoreVisitsPage() {
  const { storeIds } = await requireStoreManagerV3()
  const admin = createAdminClient()

  let rows: { id: string; title: string; storeName: string; supplier: string; technician: string | null; scheduledAt: string; proposed: boolean }[] = []
  if (storeIds.length) {
    const { data: tickets } = await admin
      .from('tickets')
      .select('id, title, store_id, scheduled_at, schedule_status, supplier_id, technician_id, status')
      .in('store_id', storeIds)
      .not('scheduled_at', 'is', null)
      .in('status', ['scheduled', 'in_progress', 'snag_assigned', 'snag_in_progress'])
      .order('scheduled_at', { ascending: true })

    const list = (tickets ?? []) as any[]
    const supplierIds = Array.from(new Set(list.map(t => t.supplier_id).filter(Boolean)))
    const techIds = Array.from(new Set(list.map(t => t.technician_id).filter(Boolean)))
    const [{ data: suppliers }, { data: stores }, { data: techs }] = await Promise.all([
      supplierIds.length ? admin.from('suppliers').select('id, company_name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
      admin.from('stores').select('id, name, sub_store').in('id', storeIds),
      techIds.length ? admin.from('technicians').select('id, name').in('id', techIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const supplierName = new Map((suppliers ?? []).map((s: any) => [s.id, s.company_name]))
    const storeName = new Map((stores ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
    const techName = new Map((techs ?? []).map((t: any) => [t.id, t.name]))

    // Only future-or-today visits (a job scheduled for the past has been attended).
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    rows = list
      .filter(t => new Date(t.scheduled_at).getTime() >= startOfToday.getTime())
      .map(t => ({
        id: t.id, title: t.title, storeName: storeName.get(t.store_id) ?? 'Store',
        supplier: supplierName.get(t.supplier_id) ?? 'Assigned supplier',
        technician: t.technician_id ? techName.get(t.technician_id) ?? null : null,
        scheduledAt: t.scheduled_at, proposed: t.schedule_status === 'proposed',
      }))
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><CalendarClock className="text-indigo-600 dark:text-indigo-400" size={22} /> Visits</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Upcoming supplier visits to your store{storeIds.length > 1 ? 's' : ''}. Tap one to open its ticket.</p>
      </div>

      {!rows.length && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <CalendarClock size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">No visits scheduled yet.</p>
        </div>
      )}

      {rows.map(r => (
        <Link key={r.id} href={`/client/tickets/${r.id}`}>
          <Card className="p-4 flex items-center gap-3 transition hover:ring-[#C6A35D]/50">
            <div className="shrink-0 w-12 text-center">
              <CalendarClock size={20} className="mx-auto text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--text)]">{formatDateTime(r.scheduledAt)}{r.proposed ? ' · proposed' : ''}</p>
              <p className="text-sm text-[var(--text)] truncate">{r.title}</p>
              <p className="text-[11px] text-[var(--text-faint)] truncate flex items-center gap-1.5"><Wrench size={11} /> {r.supplier}{r.technician ? ` · ${r.technician}` : ''} · {r.storeName}</p>
            </div>
            <ChevronRight size={16} className="text-[var(--text-faint)] shrink-0" />
          </Card>
        </Link>
      ))}
    </div>
  )
}
