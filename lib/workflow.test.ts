import { describe, it, expect } from 'vitest'
import {
  TRANSITIONS,
  resolveTransition,
  transitionsFor,
  STATUS_META,
  TERMINAL_STATUSES,
  isTerminalStatus,
  COMMERCIAL_SOURCE_STATUSES,
  isCommercialPhase,
  type TicketStatus,
  type WorkflowRole,
} from './workflow'

const ALL_ROLES: WorkflowRole[] = [
  'store_manager', 'supplier', 'regional_manager', 'executive', 'system_admin', 'individual',
]
const ALL_STATUSES = Object.keys(TRANSITIONS) as TicketStatus[]

// ---------------------------------------------------------------------------
// Full matrix: every (status × declared action × role). For each declared
// transition, the roles in its list must resolve to it and land on the right
// target; every other role must be denied (null). This is the regression net
// the audit called for — the Individual 403 was exactly a role wrongly denied.
// ---------------------------------------------------------------------------
describe('resolveTransition — full status × action × role matrix', () => {
  for (const [status, transitions] of Object.entries(TRANSITIONS)) {
    for (const t of transitions) {
      for (const role of ALL_ROLES) {
        const allowed = t.roles.includes(role)
        it(`${status} + ${t.action} as ${role} → ${allowed ? t.to : 'denied'}`, () => {
          const res = resolveTransition(status, t.action, role)
          if (allowed) {
            expect(res).not.toBeNull()
            expect(res!.action).toBe(t.action)
            expect(res!.to).toBe(t.to)
          } else {
            expect(res).toBeNull()
          }
        })
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Individual role — the regression class from the audit (BLOCKER 1). Pin the
// exact powers an Individual (company-less, general-public) owner has, plus the
// actions they must NOT have (those belong to the supplier or are intake-only).
// ---------------------------------------------------------------------------
describe('individual role capabilities', () => {
  const allowed: [TicketStatus, string, TicketStatus][] = [
    ['open', 'reject', 'cancelled'],
    ['quoted', 'approve_quote', 'accepted'],
    ['quoted', 'request_revision', 'quote_revision'],
    ['quoted', 'reject_quote', 'declined'],
    ['submitted_for_signoff', 'approve', 'approved_closeout'],
    ['submitted_for_signoff', 'request_evidence', 'evidence_requested'],
    ['submitted_for_signoff', 'raise_snag', 'snag'],
    ['variation_review', 'approve_variation', 'approved_closeout'],
    ['variation_review', 'reject_variation', 'vo_declined'],
    ['vo_declined', 'close_out', 'completed'],
    ['snag_assigned', 'approve_snag', 'snag_assigned'],
    ['snag_assigned', 'decline_snag_schedule', 'snag'],
    ['approved_closeout', 'close_out', 'completed'],
  ]
  for (const [status, action, to] of allowed) {
    it(`can ${action} from ${status} → ${to}`, () => {
      expect(resolveTransition(status, action, 'individual')?.to).toBe(to)
    })
  }

  // Supplier-only / intake-only actions must stay denied for an Individual.
  const denied: [TicketStatus, string][] = [
    ['quote_requested', 'submit_quote'],
    ['accepted', 'start_work'],
    ['in_progress', 'submit_completion'],
    ['snag', 'accept_snag'],
    ['snag_assigned', 'start_snag'],
    ['open', 'validate'],
    ['open', 'request_info'],
    ['assigned', 'request_quote'],
  ]
  for (const [status, action] of denied) {
    it(`cannot ${action} from ${status}`, () => {
      expect(resolveTransition(status, action, 'individual')).toBeNull()
    })
  }
})

// ---------------------------------------------------------------------------
// Supplier-only actions: the doing-the-work verbs belong exclusively to the
// supplier. No approver/owner role may perform them.
// ---------------------------------------------------------------------------
describe('supplier-exclusive actions', () => {
  const supplierOnly: [TicketStatus, string][] = [
    ['quote_requested', 'submit_quote'],
    ['quote_revision', 'submit_quote'],
    ['accepted', 'start_work'],
    ['in_progress', 'submit_completion'],
    ['evidence_requested', 'submit_completion'],
    ['snag', 'accept_snag'],
    ['snag_assigned', 'start_snag'],
    ['snag_in_progress', 'submit_completion'],
    ['approved_closeout', 'submit_variation'],
    ['vo_declined', 'submit_variation'],
  ]
  for (const [status, action] of supplierOnly) {
    it(`${action} from ${status} is supplier-only`, () => {
      expect(resolveTransition(status, action, 'supplier')).not.toBeNull()
      for (const role of ALL_ROLES.filter(r => r !== 'supplier')) {
        expect(resolveTransition(status, action, role)).toBeNull()
      }
    })
  }
})

// ---------------------------------------------------------------------------
// store_manager and system_admin do not drive the /transition state machine.
// store_manager's only move is resubmitting an info-requested ticket; system_admin
// has none (admins don't operate individual tickets). Documented via assertion so
// a change here is a deliberate decision, not an accident.
// ---------------------------------------------------------------------------
describe('roles with no / minimal transition powers', () => {
  it('store_manager can only resubmit from info_requested', () => {
    const powers = ALL_STATUSES.flatMap(s => transitionsFor(s, 'store_manager').map(t => `${s}:${t.action}`))
    expect(powers).toEqual(['info_requested:resubmit'])
  })

  it('system_admin has no workflow transitions', () => {
    const powers = ALL_STATUSES.flatMap(s => transitionsFor(s, 'system_admin'))
    expect(powers).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Terminal statuses accept nothing.
// ---------------------------------------------------------------------------
describe('terminal statuses', () => {
  for (const status of TERMINAL_STATUSES) {
    it(`${status} has no outgoing transitions for any role`, () => {
      expect(TRANSITIONS[status]).toEqual([])
      for (const role of ALL_ROLES) {
        expect(transitionsFor(status, role)).toEqual([])
        expect(resolveTransition(status, 'close_out', role)).toBeNull()
        expect(resolveTransition(status, 'approve', role)).toBeNull()
      }
    })
    it(`isTerminalStatus('${status}') is true`, () => {
      expect(isTerminalStatus(status)).toBe(true)
    })
  }
  it('a live status is not terminal', () => {
    expect(isTerminalStatus('in_progress')).toBe(false)
    expect(isTerminalStatus('open')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Bad input never throws; it just resolves to null / empty.
// ---------------------------------------------------------------------------
describe('unknown / malformed input', () => {
  it('unknown status → null and no throw', () => {
    expect(resolveTransition('not_a_status', 'approve', 'regional_manager')).toBeNull()
    expect(transitionsFor('not_a_status', 'regional_manager')).toEqual([])
  })
  it('unknown action from a real status → null', () => {
    expect(resolveTransition('open', 'teleport', 'regional_manager')).toBeNull()
  })
  it('valid action but wrong source status → null', () => {
    // approve_quote is only valid from `quoted`.
    expect(resolveTransition('open', 'approve_quote', 'regional_manager')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Structural invariants of the transition table itself.
// ---------------------------------------------------------------------------
describe('transition table invariants', () => {
  it('every transition target is a defined status', () => {
    for (const transitions of Object.values(TRANSITIONS)) {
      for (const t of transitions) {
        expect(STATUS_META[t.to], `target ${t.to} missing from STATUS_META`).toBeDefined()
      }
    }
  })

  it('every transition has at least one valid role', () => {
    for (const transitions of Object.values(TRANSITIONS)) {
      for (const t of transitions) {
        expect(t.roles.length).toBeGreaterThan(0)
        for (const r of t.roles) expect(ALL_ROLES).toContain(r)
      }
    }
  })

  it('action names are unique within each status', () => {
    for (const [status, transitions] of Object.entries(TRANSITIONS)) {
      const actions = transitions.map(t => t.action)
      expect(new Set(actions).size, `duplicate action in ${status}`).toBe(actions.length)
    }
  })

  it('transitionsFor(role) agrees with resolveTransition for that role', () => {
    for (const status of ALL_STATUSES) {
      for (const role of ALL_ROLES) {
        for (const t of transitionsFor(status, role)) {
          expect(resolveTransition(status, t.action, role)).toEqual(t)
        }
      }
    }
  })

  it('every status key has STATUS_META', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_META[status]).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Phase helpers.
// ---------------------------------------------------------------------------
describe('phase helpers', () => {
  it('commercial-source statuses are all real statuses and pre-execution', () => {
    for (const s of COMMERCIAL_SOURCE_STATUSES) {
      expect(STATUS_META[s]).toBeDefined()
      expect(isCommercialPhase(s)).toBe(true)
    }
  })
  it('in_progress and completed are not commercial phase', () => {
    expect(isCommercialPhase('in_progress')).toBe(false)
    expect(isCommercialPhase('completed')).toBe(false)
  })
})
