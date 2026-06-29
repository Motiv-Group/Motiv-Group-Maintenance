import { History, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const ROLE_LABEL: Record<string, string> = {
  regional_manager: 'Regional Manager', supplier: 'Supplier', store_manager: 'Store Manager',
  client: 'Store Manager', executive: 'Executive', system: 'System',
}

/** Collapsible event timeline for a ticket — the flow in date order with who acted.
 *  Server-safe (zero-JS via <details>). Built from ticket_updates. */
export function AuditTrail({ updates }: { updates: { body: string; author_role: string | null; created_at: string }[] }) {
  const items = [...updates].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  return (
    <details className="group rounded-2xl bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10 shadow-sm dark:shadow-md dark:shadow-black/20 overflow-hidden">
      <summary className="flex items-center justify-between gap-2 px-5 py-4 cursor-pointer list-none hover:bg-[var(--hover)] transition">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><History size={15} className="text-[var(--text-muted)]" /> View audit trail</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-faint)]">{items.length} event{items.length === 1 ? '' : 's'}</span>
          <ChevronDown size={16} className="text-[var(--text-faint)] transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[var(--border)] px-5 py-4">
        {items.length ? (
          <ol className="relative ml-1.5 space-y-4 border-l border-[var(--border)]">
            {items.map((u, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-[#C6A35D] ring-2 ring-[var(--surface)]" />
                <p className="text-sm text-[var(--text)]">{u.body}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{ROLE_LABEL[u.author_role ?? ''] ?? (u.author_role ?? 'System')} · {formatDateTime(u.created_at)}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-[var(--text-faint)]">No events yet.</p>}
      </div>
    </details>
  )
}
