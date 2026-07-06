export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, Ticket, Wrench, CheckCircle2, ClipboardList } from 'lucide-react'
import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card, KpiCard, type Kpi } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { isTerminalStatus } from '@/lib/workflow'
import { rmStatusMeta, formatDateTime } from '@/lib/utils'

export default async function IndividualOverviewPage() {
  const { userId, fullName } = await requireIndividual()
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('tickets')
    .select('id, title, status, priority, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  const tickets = (rows ?? []) as any[]
  const greeting = (() => { const x = new Date().getHours(); return x < 12 ? 'Good morning' : x < 17 ? 'Good afternoon' : 'Good evening' })()

  const active = tickets.filter(t => !isTerminalStatus(t.status))
  const inProgress = tickets.filter(t => ['in_progress', 'scheduled', 'snag', 'snag_assigned', 'snag_in_progress'].includes(t.status)).length
  const completed = tickets.filter(t => t.status === 'completed').length
  const kpis: Kpi[] = [
    { label: 'Open', value: active.length, icon: <ClipboardList size={13} />, tone: 'info', actionable: true, href: '/individual/tickets?status=open' },
    { label: 'In Progress', value: inProgress, icon: <Wrench size={13} />, tone: 'gold', actionable: true, href: '/individual/tickets?status=in_progress' },
    { label: 'Completed', value: completed, icon: <CheckCircle2 size={13} />, tone: 'good', actionable: true, href: '/individual/tickets?status=completed' },
  ]
  const recent = tickets.slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Your maintenance jobs — logged, quoted and signed off in one place.</p>
        </div>
        <Link href="/individual/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0">
          <PlusCircle size={16} /> Log a Job
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
      </div>

      <Card className="p-2">
        <div className="flex items-center gap-2 px-3 py-2">
          <Ticket size={15} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold text-[var(--text)]">Recent Jobs</h2>
        </div>
        {recent.length ? recent.map(t => {
          const sm = rmStatusMeta(t.status)
          return (
            <Link key={t.id} href={`/individual/tickets/${t.id}`} className="flex items-center justify-between gap-2 px-3 py-3 border-t border-[var(--border)] hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(t.created_at)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
                <PriorityBadge priority={t.priority} className="w-full text-center" />
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
              </div>
            </Link>
          )
        }) : <p className="text-sm text-[var(--text-faint)] text-center py-8">No jobs yet — log your first one.</p>}
      </Card>
    </div>
  )
}
