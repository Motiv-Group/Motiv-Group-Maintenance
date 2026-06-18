'use client'

import Link from 'next/link'
import { Ticket } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'

type Row = RegionalDashboardData['ticketActions'][number]

const slaTone = (l: string) =>
  l === 'Breached' ? 'text-red-500 dark:text-red-400'
  : l === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400'
  : 'text-[#C6A35D]'

export function RegionalTickets({ actions }: { actions: RegionalDashboardData['ticketActions'] }) {
  const cols: RTColumn<Row>[] = [
    { header: 'Store', role: 'title', cell: t => <Link href={`/regional/tickets/${t.id}`} className="font-medium text-[var(--text)] hover:text-[#C6A35D] transition">{t.storeName}</Link> },
    { header: 'SLA', role: 'badge', cell: t => <span className={`text-[11px] font-semibold ${slaTone(t.slaLabel)}`}>{t.slaLabel}</span> },
    { header: 'Health', role: 'badge', cell: t => <span className="text-sm font-semibold text-[var(--text)]">{t.healthScore}</span> },
    { header: 'Priority', cell: t => <span className="text-[var(--text-muted)]">{t.priority}</span> },
    { header: 'Age', cell: t => <span className="text-[var(--text-muted)]">{t.ageDays}d</span> },
    { header: 'Blocker', cell: t => <span className="text-[var(--text-muted)]">{t.currentBlocker ?? '—'}</span>, hideMobile: true },
    { header: 'Next Action', cell: t => <span className="text-[var(--text-muted)]">{t.nextAction}</span> },
    { header: 'Due', cell: t => <span className="text-[var(--text-muted)] whitespace-nowrap">{t.nextActionDueAt ? new Date(t.nextActionDueAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'}</span> },
  ]

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-[#C6A35D]" size={22} /> Tickets</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Open tickets needing action — lowest health first.</p></div>
      <SectionCard title={`Ticket Action List (${actions.length})`}>
        <ResponsiveTable columns={cols} rows={actions} getKey={t => t.id} minWidth={760} empty="No open tickets needing action." />
      </SectionCard>
    </div>
  )
}
