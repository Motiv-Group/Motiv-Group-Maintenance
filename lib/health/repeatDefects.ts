// MOTIV health engine v3 — repeat defect detection (same category recurring per store)
import type { HealthTicket } from './types'
import { THRESHOLDS } from './constants'

const DAY = 24 * 3600_000

export interface RepeatDefect {
  storeId: string
  regionId: string | null
  category: string
  supplierId: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  ticketIds: string[]
  possibleRootCause: string
  suggestedAction: string
  involvesCritical: boolean
}

export function detectRepeatDefects(
  tickets: HealthTicket[], windowDays = THRESHOLDS.repeatWindowDays, now: Date = new Date(),
): RepeatDefect[] {
  const since = now.getTime() - windowDays * DAY
  const groups = new Map<string, HealthTicket[]>()
  for (const t of tickets) {
    if (new Date(t.created_at).getTime() < since) continue
    const cat = (t.category ?? '').trim().toLowerCase()
    if (!cat) continue
    const key = `${t.store_id}::${cat}`
    const arr = groups.get(key) ?? []; arr.push(t); groups.set(key, arr)
  }
  const out: RepeatDefect[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    const [storeId, category] = key.split('::')
    const supCounts = new Map<string, number>()
    for (const t of group) if (t.supplier_id) supCounts.set(t.supplier_id, (supCounts.get(t.supplier_id) ?? 0) + 1)
    const dominant = [...supCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const sameSupplier = dominant != null && (supCounts.get(dominant) ?? 0) === group.length
    out.push({
      storeId, regionId: group[0].region_id ?? null, category, supplierId: dominant, count: group.length,
      firstSeenAt: sorted[0].created_at, lastSeenAt: sorted[sorted.length - 1].created_at,
      ticketIds: sorted.map(t => t.id),
      involvesCritical: group.some(t => t.priority === 'P1' || t.severity === 'critical'),
      possibleRootCause: sameSupplier ? 'Same supplier recurring — poor first-time fix / temporary patching' : 'Recurring across suppliers — likely underlying asset fault',
      suggestedAction: sameSupplier ? 'Escalate supplier for permanent fix; review performance' : 'Root-cause assessment / consider asset replacement (CAPEX)',
    })
  }
  return out.sort((a, b) => b.count - a.count)
}
