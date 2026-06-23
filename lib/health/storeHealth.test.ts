import { describe, it, expect } from 'vitest'
import { calculateStoreHealth } from './storeHealth'
import { FALLBACK_SLA } from './constants'
import type { HealthTicket, SlaRuleResolver } from './types'

const NOW = new Date('2026-06-20T12:00:00.000Z')
const MIN = 60_000
const ago = (mins: number) => new Date(NOW.getTime() - mins * MIN).toISOString()
const days = (n: number) => ago(n * 24 * 60)
const rules: SlaRuleResolver = p => FALLBACK_SLA[p]
const STORE = { id: 's', region_id: 'r' }
const calc = (tickets: HealthTicket[]) => calculateStoreHealth(STORE, tickets, rules, NOW)

function ticket(p: Partial<HealthTicket>): HealthTicket {
  return {
    id: Math.random().toString(36).slice(2), store_id: 's', priority: 'P3',
    status: 'in_progress', created_at: ago(60), updated_at: NOW.toISOString(), ...p,
  }
}

describe('calculateStoreHealth', () => {
  it('T1: empty store → 100 / controlled', () => {
    const r = calc([])
    expect(r.finalHealthScore).toBe(100)
    expect(r.finalStatus).toBe('controlled')
  })

  it('T2: open safety-risk ticket → override Critical', () => {
    const r = calc([ticket({ priority: 'P1', safety_risk_flag: true })])
    expect(r.finalStatus).toBe('critical')
    expect(r.overrideReason).toBe('Unresolved safety risk')
  })

  it('T3: cannot_trade → override Critical', () => {
    const r = calc([ticket({ operational_impact: 'cannot_trade' })])
    expect(r.finalStatus).toBe('critical')
    expect(r.overrideReason).toBe('Store cannot trade')
  })

  it('T4: un-triaged open tickets do NOT drag Data Quality', () => {
    const r = calc([ticket({ status: 'open', created_at: days(5) }), ticket({ status: 'open', created_at: days(5) })])
    expect(r.breakdown.dataQuality).toBe(10)
  })

  it('T4b: an OWNED stale ticket DOES drop Data Quality to 0', () => {
    const r = calc([ticket({ status: 'in_progress', supplier_id: 'sup', created_at: days(10), updated_at: days(8), first_response_at: days(8) })])
    expect(r.breakdown.dataQuality).toBe(0)
  })

  it('T5: quote stuck in approval > 7 days → Commercial Blocker 0', () => {
    const r = calc([ticket({ status: 'quoted', supplier_id: 'sup', quote_submitted_at: days(9), quote_decision_required: true, quote_decision_status: 'pending' })])
    expect(r.breakdown.commercialBlocker).toBe(0)
  })

  it('T6: high-value quote pending decision → Commercial Blocker 3', () => {
    const r = calc([ticket({ status: 'quoted', supplier_id: 'sup', quote_submitted_at: ago(60), quote_value: 30_000, quote_decision_required: true, quote_decision_status: 'pending' })])
    expect(r.breakdown.commercialBlocker).toBe(3)
  })

  it('T8: submitted for sign-off with no evidence → Data Quality 3 (missing evidence)', () => {
    const r = calc([ticket({ status: 'submitted_for_signoff', supplier_id: 'sup', submitted_for_signoff_at: ago(60), created_at: ago(120) })])
    expect(r.breakdown.dataQuality).toBe(3)
  })
})
