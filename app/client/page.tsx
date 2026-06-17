export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, ClipboardList, Wrench, CheckCircle2 } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { formatDate, formatDateTime } from '@/lib/utils'

const STATUS_TONE: Record<string, string> = {
  open: 'text-blue-600 dark:text-blue-400',
  in_progress: 'text-amber-600 dark:text-[#C6A35D]',
  completed: 'text-emerald-600 dark:text-emerald-400',
}
const STATUS_WORD: Record<string, string> = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' }

export default async function StoreOverviewPage() {
  const { companyId, storeIds, fullName } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{[d.company, d.branch, d.branchCode].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Link href="/client/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition">
            <PlusCircle size={16} /> Log a Ticket
          </Link>
          <span className="text-[11px] text-[var(--text-faint)]">{formatDate(d.generatedAt)}</span>
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

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold text-[var(--text)]">Recent Tickets</h2><Link href="/client/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link></div>
        {d.tickets.slice(0, 6).map(t => (
          <Link key={t.id} href={`/client/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
            <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)]">{t.category ?? 'General'} · {formatDateTime(t.createdAt)}</p></div>
            <span className={`text-[11px] font-semibold shrink-0 ${STATUS_TONE[t.status]}`}>{STATUS_WORD[t.status]}</span>
          </Link>
        ))}
        {!d.tickets.length && <p className="text-sm text-[var(--text-faint)]">No tickets yet. Tap “Log a Ticket” to add one.</p>}
      </Card>
    </div>
  )
}
