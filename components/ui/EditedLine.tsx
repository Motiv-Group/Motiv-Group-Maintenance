import { formatDateTime } from '@/lib/utils'

/** Muted "Last edited by … · date" line for ticket detail pages. Renders
 *  nothing when the ticket has never been edited. Server-safe (no client JS). */
export function EditedLine({ at, by }: { at?: string | null; by?: string | null }) {
  if (!at) return null
  return (
    <p className="text-[11px] italic text-[var(--text-faint)]">
      Last edited{by ? ` by ${by}` : ''} · {formatDateTime(at)}
    </p>
  )
}
