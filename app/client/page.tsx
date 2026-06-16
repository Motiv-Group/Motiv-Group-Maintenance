export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, ClipboardList, Wrench, CheckCircle2 } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'

const STATUS_TONE: Record<string, string> = { open: 'text-blue-400', in_progress: 'text-[#C6A35D]', completed: 'text-emerald-400' }
const STATUS_WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }

export default async function StoreOverviewPage() {
  const { companyId, storeIds, fullName } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">{d.storeName}</p>
      </div>

      {d.health && (
        <Card className="p-5 flex items-center gap-5">
          <Donut value={d.health.finalHealthScore} status={d.health.finalStatus} size={110} label="Store" />
          <div>
            <Pill status={d.health.finalStatus} label={STATUS_LABELS[d.health.finalStatus]} />
            <p className="text-sm text-slate-300 mt-2">{d.health.mainIssue}.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center"><ClipboardList className="mx-auto text-blue-400 mb-1" size={18} /><div className="text-2xl font-bold text-white">{d.open}</div><div className="text-[11px] text-slate-400">Open</div></Card>
        <Card className="p-4 text-center"><Wrench className="mx-auto text-[#C6A35D] mb-1" size={18} /><div className="text-2xl font-bold text-white">{d.inProgress}</div><div className="text-[11px] text-slate-400">In Progress</div></Card>
        <Card className="p-4 text-center"><CheckCircle2 className="mx-auto text-emerald-400 mb-1" size={18} /><div className="text-2xl font-bold text-white">{d.completed}</div><div className="text-[11px] text-slate-400">Completed</div></Card>
      </div>

      <Link href="/client/tickets/new" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#C6A35D] text-[#0a0e17] font-semibold hover:brightness-95 transition">
        <PlusCircle size={18} /> Log a Maintenance Ticket
      </Link>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold text-white">Recent Tickets</h2><Link href="/client/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link></div>
        {d.tickets.slice(0, 6).map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
            <div className="min-w-0"><p className="text-sm text-white truncate">{t.title}</p><p className="text-[11px] text-slate-500">{t.category ?? 'General'} · {formatDate(t.createdAt)}</p></div>
            <span className={`text-[11px] font-semibold shrink-0 ${STATUS_TONE[t.status]}`}>{STATUS_WORD[t.status]}</span>
          </div>
        ))}
        {!d.tickets.length && <p className="text-sm text-slate-500">No tickets yet. Log your first one above.</p>}
      </Card>
    </div>
  )
}
