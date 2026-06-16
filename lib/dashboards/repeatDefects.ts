// ============================================================
// Dashboards v2 — detectRepeatDefects (spec §12.7)
//
// A repeat defect = the same category recurring at the same store within the
// rolling window. Surfaces root-cause candidates and a suggested action so the
// business can fix the cause, not just the symptom.
// ============================================================
import type { Ticket } from '@/lib/types'
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
}

export function detectRepeatDefects(
  tickets: Ticket[],
  windowDays: number = THRESHOLDS.repeatWindowDays,
  now: Date = new Date(),
): RepeatDefect[] {
  const since = now.getTime() - windowDays * DAY
  // group by store + normalised category
  const groups = new Map<string, Ticket[]>()
  for (const t of tickets) {
    if (new Date(t.created_at).getTime() < since) continue
    const cat = (t.category ?? '').trim().toLowerCase()
    if (!cat) continue
    const key = `${t.client_id}::${cat}`
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  const out: RepeatDefect[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const [storeId, category] = key.split('::')
    // dominant supplier in the group
    const supplierCounts = new Map<string, number>()
    for (const t of group) if (t.supplier_id) supplierCounts.set(t.supplier_id, (supplierCounts.get(t.supplier_id) ?? 0) + 1)
    const dominantSupplier = [...supplierCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const sameSupplier = dominantSupplier != null && (supplierCounts.get(dominantSupplier) ?? 0) === group.length

    out.push({
      storeId,
      regionId: group[0].region_id ?? null,
      category,
      supplierId: dominantSupplier,
      count: group.length,
      firstSeenAt: sorted[0].created_at,
      lastSeenAt: sorted[sorted.length - 1].created_at,
      ticketIds: sorted.map(t => t.id),
      possibleRootCause: sameSupplier
        ? 'Same supplier repeatedly — likely poor first-time fix or temporary patching'
        : 'Recurring across suppliers — likely an underlying asset/equipment fault',
      suggestedAction: sameSupplier
        ? 'Escalate to the supplier for a permanent fix; review their performance'
        : 'Commission a root-cause assessment / consider asset replacement (CAPEX)',
    })
  }

  return out.sort((a, b) => b.count - a.count)
}
