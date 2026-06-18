export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Truck, ClipboardList, Clock, ReceiptText, ClipboardCheck, Camera, AlertTriangle } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { Card, SectionCard, KpiRow, Donut, Pill, type Kpi } from '@/components/exec/ui'

export default async function SupplierOverviewPage() {
  const { companyId, supplierIds, fullName } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const k = d.kpis

  const kpis: Kpi[] = [
    { label: 'Open Work', value: k.open, icon: <ClipboardList size={13} /> },
    { label: 'Overdue', value: k.overdue, icon: <AlertTriangle size={13} />, tone: k.overdue ? 'bad' : 'good' },
    { label: 'Due Today', value: k.dueToday, icon: <Clock size={13} />, tone: k.dueToday ? 'warn' : 'good' },
    { label: 'Pending Quotes', value: k.pendingQuotes, icon: <ReceiptText size={13} />, tone: k.pendingQuotes ? 'warn' : 'good' },
    { label: 'Awaiting Sign-off', value: k.awaitingSignoff, icon: <ClipboardCheck size={13} /> },
    { label: 'Evidence Missing', value: k.evidenceMissing, icon: <Camera size={13} />, tone: k.evidenceMissing ? 'warn' : 'good' },
  ]

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-teal-600 dark:text-teal-400" size={22} /> {fullName ?? 'Supplier'}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Your assigned work, quotes, sign-offs and performance.</p></div>

      <KpiRow kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <Card className="p-5 flex items-center gap-4">
          <Donut value={d.perf.performanceScore} status={d.perf.band} size={110} label="SLA" />
          <div><Pill status={d.perf.band} /><p className="text-sm text-[var(--text)] mt-2">{d.perf.assignedTickets} tickets · {Math.round(d.perf.firstTimeFixRate * 100)}% first-fix · {d.perf.slaBreaches} breaches</p><Link href="/supplier/stats" className="text-xs text-[#C6A35D] hover:underline">Full performance →</Link></div>
        </Card>

        <SectionCard title="Assigned Tickets" icon={<ClipboardList size={15} className="text-blue-600 dark:text-blue-400" />} action={<Link href="/supplier/tickets" className="text-xs text-[#C6A35D] hover:underline">All</Link>}>
          {d.tickets.slice(0, 7).map(t => (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] -mx-2 px-2 rounded">
              <div className="min-w-0"><p className="text-sm text-[var(--text)] truncate">{t.title}</p><p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName} · {t.priority} · {t.ageDays}d</p></div>
              <span className={`text-[11px] shrink-0 ${t.slaLabel === 'Breached' ? 'text-red-600 dark:text-red-400' : t.acknowledged ? 'text-[#C6A35D]' : 'text-blue-600 dark:text-blue-400'}`}>{t.acknowledged ? t.slaLabel : 'New'}</span>
            </Link>
          ))}
          {!d.tickets.length && <p className="text-sm text-[var(--text-faint)]">No open work assigned.</p>}
        </SectionCard>
      </div>
    </div>
  )
}
