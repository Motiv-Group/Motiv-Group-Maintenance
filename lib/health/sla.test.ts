import { describe, it, expect } from 'vitest'
import { computeTicketSla } from './sla'
import { FALLBACK_SLA } from './constants'
import type { HealthTicket, SlaRuleResolver, SlaTargets } from './types'

const NOW = new Date('2026-06-20T12:00:00.000Z')
const MIN = 60_000
const ago = (mins: number) => new Date(NOW.getTime() - mins * MIN).toISOString()
const rule = (p: HealthTicket['priority']): SlaTargets => FALLBACK_SLA[p]
const rules: SlaRuleResolver = p => FALLBACK_SLA[p]
void rules

function ticket(p: Partial<HealthTicket>): HealthTicket {
  return {
    id: 't', store_id: 's', priority: 'P3', status: 'in_progress',
    created_at: ago(60), updated_at: NOW.toISOString(), ...p,
  }
}
const sla = (t: HealthTicket) => computeTicketSla(t, rule(t.priority), NOW)

describe('computeTicketSla — supplier clock', () => {
  it('S1: supplier running, not breached', () => {
    const r = sla(ticket({ status: 'in_progress', priority: 'P1', created_at: ago(60), first_response_at: ago(30), attended_at: ago(20) }))
    expect(r.supplierStatus).toBe('running')
    expect(r.supplierBreached).toBe(false)
    expect(r.currentBlocker).toBe('supplier_action')
    expect(r.delayOwner).toBe('supplier')
  })

  it('S2: first-response overdue → supplier breached', () => {
    const r = sla(ticket({ status: 'assigned', priority: 'P1', created_at: ago(300) })) // P1 first_response 60m
    expect(r.supplierBreached).toBe(true)
    expect(r.supplierStatus).toBe('breached')
  })

  it('S5: evidence_requested is a SUPPLIER action (not a sign-off pause)', () => {
    const r = sla(ticket({ status: 'evidence_requested', priority: 'P3', created_at: ago(60), first_response_at: ago(50) }))
    expect(r.supplierStatus).not.toBe('paused')
    expect(r.currentBlocker).toBe('supplier_action')
    expect(r.delayOwner).toBe('supplier')
    expect(r.nextAction).toMatch(/evidence/i)
  })

  it('S6: explicit sla_paused suppresses supplier breach', () => {
    const r = sla(ticket({ status: 'in_progress', priority: 'P1', created_at: ago(60 * 24 * 5), first_response_at: ago(60 * 24 * 5), sla_paused: true }))
    expect(r.supplierStatus).toBe('paused')
    expect(r.supplierBreached).toBe(false)
  })
})

describe('computeTicketSla — internal/store clock', () => {
  it('S3: quoted with no explicit cols → paused, quote_approval, internal breach, derived daysWithBlocker', () => {
    const r = sla(ticket({ status: 'quoted', priority: 'P3', quote_submitted_at: ago(60 * 24 * 9), quote_decision_required: true, quote_decision_status: 'pending' }))
    expect(r.supplierStatus).toBe('paused')
    expect(r.currentBlocker).toBe('quote_approval')
    expect(r.delayOwner).toBe('internal')
    expect(r.internalBreached).toBe(true)
    expect(r.daysWithBlocker).toBe(9)
  })

  it('S4: submitted_for_signoff past derived internal due → internal breach', () => {
    const r = sla(ticket({ status: 'submitted_for_signoff', priority: 'P3', submitted_for_signoff_at: ago(60 * 24 * 5) }))
    expect(r.supplierStatus).toBe('paused')
    expect(r.currentBlocker).toBe('completion_signoff')
    expect(r.internalBreached).toBe(true)
  })

  it('S7: un-triaged open ticket breaches INTERNAL (triage), never the supplier', () => {
    const r = sla(ticket({ status: 'open', priority: 'P3', created_at: ago(60 * 24 * 5) }))
    expect(r.supplierBreached).toBe(false)
    expect(r.supplierStatus).toBe('not_started')
    expect(r.delayOwner).toBe('internal')
    expect(r.currentBlocker).toBe('triage')
    expect(r.internalBreached).toBe(true)
  })
})
