export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle, Ticket } from 'lucide-react'
import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { isTerminalStatus } from '@/lib/workflow'
import { rmStatusMeta, formatDateTime } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

type TicketRow = Pick<Database['public']['Tables']['tickets']['Row'], 'id' | 'title' | 'status' | 'priority' | 'created_at'>

function Row({ t }: { t: TicketRow }) {
  const sm = rmStatusMeta(t.status)
  return (
    <Link href={`/individual/tickets/${t.id}`} className="flex items-center justify-between gap-2 px-3 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
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
}

export default async function IndividualTicketsPage() {
  const { userId } = await requireIndividual()
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('tickets')
    .select('id, title, status, priority, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  const tickets = rows ?? []
  const active = tickets.filter(t => !isTerminalStatus(t.status))
  const done = tickets.filter(t => isTerminalStatus(t.status))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Jobs</h1>
        <Link href="/individual/tickets/new" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0">
          <PlusCircle size={16} /> Log a Job
        </Link>
      </div>

      {!tickets.length && <Card className="p-2"><p className="text-sm text-[var(--text-faint)] text-center py-8">No jobs yet.</p></Card>}

      {active.length > 0 && (
        <Card className="p-2">
          <p className="px-3 py-2 text-sm font-bold text-[var(--text)]">Active</p>
          {active.map(t => <Row key={t.id} t={t} />)}
        </Card>
      )}
      {done.length > 0 && (
        <Card className="p-2">
          <p className="px-3 py-2 text-sm font-bold text-[var(--text)]">Completed &amp; closed</p>
          {done.map(t => <Row key={t.id} t={t} />)}
        </Card>
      )}
    </div>
  )
}
