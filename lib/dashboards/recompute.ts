// ============================================================
// Dashboards v2 — ticket cache recompute (spec §14 hourly job)
//
// Refreshes the denormalised SLA/health columns on active tickets so list
// views and filters are fast without recomputing on every request.
// SERVER ONLY.
// ============================================================
import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Ticket } from '@/lib/types'
import { loadRuleBook } from './data'
import { calculateTicketHealth } from './ticketHealth'

const TERMINAL = new Set(['completed', 'cancelled', 'declined'])

export async function recomputeActiveTickets(now: Date = new Date()): Promise<{ updated: number }> {
  const db = createAdminClient()
  const rules = await loadRuleBook(db)
  const { data } = await db.from('tickets').select('*')
  const active = ((data ?? []) as Ticket[]).filter(t => !TERMINAL.has(t.status))

  let updated = 0
  // Update in small parallel batches to keep DB load reasonable.
  const BATCH = 10
  for (let i = 0; i < active.length; i += BATCH) {
    const slice = active.slice(i, i + BATCH)
    await Promise.allSettled(slice.map(t => {
      const h = calculateTicketHealth(t, rules.for(t.region_id ?? null, t.priority), now)
      return db.from('tickets').update({
        ticket_health_score: h.score,
        ticket_health_status: h.status,
        supplier_sla_status: h.sla.supplierStatus,
        internal_sla_status: h.sla.internalStatus,
        current_blocker: h.sla.currentBlocker,
        blocker_owner_type: h.sla.blockerOwnerType,
        delay_owner: h.sla.delayOwner,
      }).eq('id', t.id)
    }))
    updated += slice.length
  }
  return { updated }
}
