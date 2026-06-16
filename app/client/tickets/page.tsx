export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, Ticket } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'

const TONE: Record<string, string> = { open: 'bg-blue-500/15 text-blue-400', in_progress: 'bg-[#C6A35D]/15 text-[#C6A35D]', completed: 'bg-emerald-500/15 text-emerald-400' }
const WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }

export default async function StoreTicketsPage() {
  const { companyId, storeIds } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Ticket className="text-[#C6A35D]" size={22} /> My Tickets</h1>
          <p className="text-sm text-slate-400 mt-0.5">{d.tickets.length} ticket(s) · {d.storeName}</p></div>
        <Link href="/client/tickets/new" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold"><PlusCircle size={16} /> Log</Link>
      </div>

      <Card className="p-2">
        {d.tickets.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-3 border-b border-white/5 last:border-0">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{t.title}</p>
              <p className="text-[11px] text-slate-500">{t.category ?? 'General'} · {formatDate(t.createdAt)}{t.supplierAssigned ? ' · Supplier assigned' : ''}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TONE[t.status]}`}>{WORD[t.status]}</span>
          </div>
        ))}
        {!d.tickets.length && <p className="text-sm text-slate-500 text-center py-8">No tickets yet.</p>}
      </Card>
    </div>
  )
}
