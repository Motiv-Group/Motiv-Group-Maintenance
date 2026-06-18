export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, ClipboardList, Wrench, CheckCircle2, Calendar } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { RecentTicketsCard } from '@/components/client/RecentTicketsCard'
import { formatDate } from '@/lib/utils'

export default async function StoreOverviewPage() {
  const { companyId, storeIds, fullName } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5 flex items-center gap-2 min-w-0">
            <span className="truncate">{d.branch}</span>
            {d.branchCode && <span className="inline-flex items-center shrink-0 rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)] px-2 py-0.5 text-[11px] font-mono font-semibold tracking-wider text-[var(--text)]">{d.branchCode}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Link href="/client/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition">
            <PlusCircle size={16} /> Log a Ticket
          </Link>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-2.5 py-1">
            <Calendar size={12} className="text-[var(--text-muted)]" />
            {formatDate(d.generatedAt)}
          </span>
        </div>
      </div>

      {d.health && (
        <Card className="p-5 flex items-center gap-5">
          <Donut value={d.health.finalHealthScore} status={d.health.finalStatus} size={110} label="Store" />
          <div>
            <Pill status={d.health.finalStatus} label={STATUS_LABELS[d.health.finalStatus]} />
            <p className="text-sm text-[var(--text-muted)] mt-2">{d.health.mainIssue}.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center"><ClipboardList className="mx-auto text-blue-500 mb-1" size={18} /><div className="text-2xl font-bold text-[var(--text)]">{d.open}</div><div className="text-[11px] text-[var(--text-muted)]">Open</div></Card>
        <Card className="p-4 text-center"><Wrench className="mx-auto text-[#C6A35D] mb-1" size={18} /><div className="text-2xl font-bold text-[var(--text)]">{d.inProgress}</div><div className="text-[11px] text-[var(--text-muted)]">In Progress</div></Card>
        <Card className="p-4 text-center"><CheckCircle2 className="mx-auto text-emerald-500 mb-1" size={18} /><div className="text-2xl font-bold text-[var(--text)]">{d.completed}</div><div className="text-[11px] text-[var(--text-muted)]">Completed</div></Card>
      </div>

      <RecentTicketsCard tickets={d.tickets} />
    </div>
  )
}
