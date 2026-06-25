export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'

const slaTone = (l: string) =>
  l === 'Breached' ? 'text-red-600 dark:text-red-400'
  : l === 'At risk' ? 'text-amber-600 dark:text-amber-500'
  : l === 'Paused (internal)' ? 'text-[var(--text-faint)]'
  : l === 'Not started' || l === 'New' ? 'text-blue-600 dark:text-blue-400'
  : 'text-[var(--text-muted)]'

export default async function SupplierTicketsPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Assigned Tickets</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Open work assigned to you — tap a ticket to acknowledge, update, schedule or submit evidence.</p>
      </div>
      <SectionCard title={`Open Work (${d.tickets.length})`}>
        {d.tickets.map(t => {
          const sla = t.acknowledged ? t.slaLabel : 'New'
          return (
            <Link key={t.id} href={`/supplier/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{t.title}</p>
                <p className="text-[11px] text-[var(--text-faint)] truncate">{t.storeName} · {t.ageDays}d{t.evidenceRequired ? ` · evidence ${[t.beforeUploaded, t.afterUploaded, t.cocUploaded].filter(Boolean).length}/3` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <PriorityBadge priority={t.priority} />
                <span className={`text-[11px] font-semibold ${slaTone(sla)}`}>{sla}</span>
              </div>
            </Link>
          )
        })}
        {!d.tickets.length && <p className="text-sm text-[var(--text-faint)] py-2">No open work assigned.</p>}
      </SectionCard>
    </div>
  )
}
