export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Truck, ClipboardList, Clock, ReceiptText, ClipboardCheck, Camera, AlertTriangle, BarChart2, Gauge } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { Card, SectionCard, KpiRow, Donut, Pill, BreakdownList, type Kpi } from '@/components/exec/ui'
import { formatCurrency, formatDate } from '@/lib/utils'

const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n)))
const slaTone = (l: string) =>
  l === 'Breached' ? 'text-red-600 dark:text-red-400'
  : l === 'At risk' ? 'text-amber-600 dark:text-amber-500'
  : l === 'Paused (internal)' ? 'text-[var(--text-faint)]'
  : l === 'Not started' ? 'text-blue-600 dark:text-blue-400'
  : 'text-[var(--text-muted)]'
const QUOTE_TONE: Record<string, string> = { pending: 'text-[#C6A35D]', accepted: 'text-emerald-600 dark:text-emerald-400', declined: 'text-red-600 dark:text-red-400' }

export default async function SupplierOverviewPage() {
  const { companyId, supplierIds, fullName } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const k = d.kpis
  const perf = d.perf

  const kpis: Kpi[] = [
    { label: 'Open Work', value: k.open, icon: <ClipboardList size={13} />, href: '/supplier/tickets' },
    { label: 'Overdue', value: k.overdue, icon: <AlertTriangle size={13} />, tone: k.overdue ? 'bad' : 'good', href: '/supplier/tickets' },
    { label: 'Due Today', value: k.dueToday, icon: <Clock size={13} />, tone: k.dueToday ? 'warn' : 'good', href: '/supplier/tickets' },
    { label: 'Pending Quotes', value: k.pendingQuotes, icon: <ReceiptText size={13} />, tone: k.pendingQuotes ? 'warn' : 'good', href: '/supplier/quotes' },
    { label: 'Awaiting Sign-off', value: k.awaitingSignoff, icon: <ClipboardCheck size={13} />, href: '/supplier/signoff' },
    { label: 'Evidence Missing', value: k.evidenceMissing, icon: <Camera size={13} />, tone: k.evidenceMissing ? 'warn' : 'good', href: '/supplier/tickets' },
  ]

  const needsAction = d.tickets.filter(t => t.slaLabel === 'Breached' || t.slaLabel === 'At risk' || !t.acknowledged).slice(0, 6)
  const evidenceTodo = d.tickets.filter(t => t.evidenceRequired && !(t.beforeUploaded && t.afterUploaded && t.cocUploaded)).slice(0, 6)
  const missingBits = (t: typeof d.tickets[number]) => [!t.beforeUploaded && 'before', !t.afterUploaded && 'after', !t.cocUploaded && 'COC'].filter(Boolean).join(', ')

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-teal-600 dark:text-teal-400" size={22} /> {fullName ?? 'Supplier'}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Your assigned work, quotes, sign-offs and performance.</p></div>

      <KpiRow kpis={kpis} />

      {/* Performance — gauge + axes breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <Card className="p-5 flex items-center gap-4">
          <Donut value={perf.performanceScore} status={perf.band} size={110} label="SLA" />
          <div>
            <Pill status={perf.band} />
            <p className="text-sm text-[var(--text-muted)] mt-2">{perf.assignedTickets} tickets · {Math.round(perf.firstTimeFixRate * 100)}% first-fix · {perf.slaBreaches} breaches</p>
            <Link href="/supplier/stats" className="text-xs text-[#C6A35D] hover:underline">Full performance →</Link>
          </div>
        </Card>
        <SectionCard title="Performance Breakdown" icon={<Gauge size={15} className="text-slate-600 dark:text-slate-400" />}>
          <BreakdownList rows={[
            { label: 'Response Time', value: perf.avgResponseMins == null ? 14 : clamp(20 - perf.avgResponseMins / 60), max: 20 },
            { label: 'Completion Time', value: perf.avgResolutionMins == null ? 14 : clamp(20 - (perf.avgResolutionMins / 1440) * 1.5), max: 20 },
            { label: 'First-Time Fix', value: clamp(perf.firstTimeFixRate * 20), max: 20 },
            { label: 'Evidence Quality', value: clamp(perf.evidenceCompletionRate * 20), max: 20 },
            { label: 'Communication', value: clamp(20 - perf.escalationCount * 3), max: 20 },
          ]} />
        </SectionCard>
      </div>

      {/* Action queue + evidence to upload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Needs Your Action" icon={<AlertTriangle size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/supplier/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {needsAction.map(t => (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName} · {t.priority} · {t.ageDays}d</p></div>
              <span className={`text-[11px] font-semibold shrink-0 ${slaTone(t.acknowledged ? t.slaLabel : 'Not started')}`}>{t.acknowledged ? t.slaLabel : 'New'}</span>
            </Link>
          ))}
          {!needsAction.length && <p className="text-sm text-[var(--text-faint)]">Nothing needs action right now.</p>}
        </SectionCard>
        <SectionCard title="Evidence to Upload" icon={<Camera size={15} className="text-sky-600 dark:text-sky-400" />}>
          {evidenceTodo.map(t => (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName}</p></div>
              <span className="text-[11px] text-amber-600 dark:text-amber-500 shrink-0">missing: {missingBits(t)}</span>
            </Link>
          ))}
          {!evidenceTodo.length && <p className="text-sm text-[var(--text-faint)]">All evidence uploaded.</p>}
        </SectionCard>
      </div>

      {/* Assigned tickets */}
      <SectionCard title={`Assigned Tickets (${d.tickets.length})`} icon={<ClipboardList size={15} className="text-blue-600 dark:text-blue-400" />} action={<Link href="/supplier/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
        {d.tickets.slice(0, 8).map(t => (
          <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
            <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName} · {t.priority} · {t.ageDays}d</p></div>
            <span className={`text-[11px] shrink-0 ${slaTone(t.acknowledged ? t.slaLabel : 'Not started')}`}>{t.acknowledged ? t.slaLabel : 'New'}</span>
          </Link>
        ))}
        {!d.tickets.length && <p className="text-sm text-[var(--text-faint)]">No open work assigned.</p>}
      </SectionCard>

      {/* Quotes + sign-offs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Recent Quotes" icon={<ReceiptText size={15} className="text-amber-600 dark:text-amber-500" />} action={<Link href="/supplier/quotes" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {d.quotes.slice(0, 5).map(q => (
            <div key={q.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{q.ticketTitle}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDate(q.createdAt)}</p></div>
              <span className="flex items-center gap-2 shrink-0"><span className="text-sm text-[var(--text)]">{formatCurrency(q.amount)}</span><span className={`text-[11px] capitalize ${QUOTE_TONE[q.status] ?? 'text-[var(--text-muted)]'}`}>{q.status}</span></span>
            </div>
          ))}
          {!d.quotes.length && <p className="text-sm text-[var(--text-faint)]">No quotes submitted yet.</p>}
        </SectionCard>
        <SectionCard title="Pending Sign-off" icon={<ClipboardCheck size={15} className="text-emerald-600 dark:text-emerald-400" />} action={<Link href="/supplier/signoff" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {d.signoffs.slice(0, 5).map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{s.ticketTitle}</p><p className="text-[11px] text-[var(--text-faint)]">{formatDate(s.createdAt)}</p></div>
              <span className="text-[11px] text-[var(--text-muted)] capitalize shrink-0">{s.status.replace(/_/g, ' ')}</span>
            </div>
          ))}
          {!d.signoffs.length && <p className="text-sm text-[var(--text-faint)]">Nothing awaiting sign-off.</p>}
        </SectionCard>
      </div>
    </div>
  )
}
