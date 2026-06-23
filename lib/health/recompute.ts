// ============================================================
// MOTIV v3 — repeat-defect flag recompute (server-only)
// Sets/clears tickets.repeat_defect_flag from live detection so the persisted
// flag (read by ticketHealth, supplierPerformance, and the exec exposure
// breakdown) reflects reality. Idempotent — only writes deltas.
//
// NOTE: we deliberately do NOT write the repeat_defect_groups table or
// tickets.repeat_defect_group_id — that table's store_id FK targets the legacy
// `profiles` schema, incompatible with v3 `stores` ids. The boolean flag has no
// FK and is the only signal the v3 engine reads.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { detectRepeatDefects } from './repeatDefects'
import { THRESHOLDS } from './constants'
import type { HealthTicket } from './types'

const DAY = 24 * 3600_000

export interface RecomputeSummary { companies: number; flagged: number; cleared: number; date: string }

export async function runRepeatDefectRecompute(now: Date = new Date()): Promise<RecomputeSummary> {
  const db = createAdminClient()
  const since = new Date(now.getTime() - THRESHOLDS.repeatWindowDays * DAY).toISOString()
  const { data: companies } = await db.from('companies').select('id').eq('active', true)
  let flagged = 0, cleared = 0

  for (const c of (companies ?? []) as { id: string }[]) {
    const { data } = await db.from('tickets')
      .select('id, store_id, region_id, supplier_id, category, priority, severity, created_at, status, repeat_defect_flag')
      .eq('company_id', c.id).gte('created_at', since)
    const tickets = (data ?? []) as unknown as (HealthTicket & { repeat_defect_flag?: boolean })[]
    if (!tickets.length) continue

    const repeatIds = new Set(detectRepeatDefects(tickets, THRESHOLDS.repeatWindowDays, now).flatMap(g => g.ticketIds))
    const toFlag = tickets.filter(t => repeatIds.has(t.id) && !t.repeat_defect_flag).map(t => t.id)
    const toClear = tickets.filter(t => !repeatIds.has(t.id) && t.repeat_defect_flag).map(t => t.id)

    if (toFlag.length)  { await db.from('tickets').update({ repeat_defect_flag: true }).in('id', toFlag);  flagged += toFlag.length }
    if (toClear.length) { await db.from('tickets').update({ repeat_defect_flag: false }).in('id', toClear); cleared += toClear.length }
  }

  return { companies: (companies ?? []).length, flagged, cleared, date: now.toISOString().slice(0, 10) }
}
