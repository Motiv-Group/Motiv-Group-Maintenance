import Link from 'next/link'
import { Building2, ChevronRight, ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { formatDateTime } from '@/lib/utils'

export interface SnagRow { id: string; ticketId: string; ticketTitle: string; priority: string; storeName: string; description: string; severity: string; status: string; createdAt: string }

// Snag status pill — open (red) is unaddressed, accepted/in-progress are amber.
const STATUS_META: Record<string, { label: string; cls: string }> = {
  open:        { label: 'Open',        cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  assigned:    { label: 'Accepted',    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  in_progress: { label: 'In progress', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
}

export function RegionalSnagList({ rows }: { rows: SnagRow[] }) {
  if (!rows.length) return <Card className="p-8 text-center"><p className="text-sm text-[var(--text-faint)]">No open snags.</p></Card>

  // Group by store, newest snag first within each store.
  const byStore = new Map<string, SnagRow[]>()
  for (const r of rows) { const a = byStore.get(r.storeName) ?? []; a.push(r); byStore.set(r.storeName, a) }
  const groups = [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [, items] of groups) items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  return (
    <div className="space-y-4">
      {groups.map(([store, items]) => (
        <details key={store} open className="group rounded-2xl bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10 shadow-sm dark:shadow-md dark:shadow-black/20 overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={15} className="text-[#C6A35D] shrink-0" />
            <span className="text-sm font-bold text-[var(--text)] truncate">{store}</span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{items.length}</span>
            <ChevronDown size={16} className="ml-auto text-[var(--text-faint)] shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-2 border-t border-[var(--border)]">
          {items.map(r => {
            const sm = STATUS_META[r.status] ?? STATUS_META.open
            return (
              <Link key={r.id} href={r.ticketId ? `/regional/tickets/${r.ticketId}` : '/regional/snag'} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] cursor-pointer transition">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{r.ticketTitle}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{r.description}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(r.createdAt)}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_6rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
                  <PriorityBadge priority={r.priority} className="w-full text-center" />
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
                </div>
                <ChevronRight size={16} className="text-[var(--text-faint)] shrink-0" />
              </Link>
            )
          })}
          </div>
        </details>
      ))}
    </div>
  )
}
