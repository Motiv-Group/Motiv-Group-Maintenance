import { describe, it, expect } from 'vitest'
import {
  buildTicketTimeline,
  rmFriendlyLabel,
  smFriendlyLabel,
  individualFriendlyLabel,
  supplierFriendlyLabel,
  type TimelineEvent,
  type TimelineTone,
} from './ticket-timeline'

const ev = (tone: TimelineTone, label: string, who: string | null = null): TimelineEvent =>
  ({ at: '2026-01-01T00:00:00Z', label, who, tone })
const ctx = { supplierName: 'ABC Plumbing' }

describe('timeline narration — supplier is named on the client-side views', () => {
  it('names the awarded supplier as the subject (not a bare "the supplier")', () => {
    const e = ev('scheduled', 'Job scheduled', 'Supplier')
    expect(rmFriendlyLabel(e, ctx)).toBe('ABC Plumbing scheduled a visit')
    expect(smFriendlyLabel(e, ctx)).toBe('ABC Plumbing scheduled a visit')
    expect(individualFriendlyLabel(e, ctx)).toBe('ABC Plumbing scheduled a visit')
  })

  it('falls back to "The supplier" when no name is known', () => {
    expect(rmFriendlyLabel(ev('completion_submitted', 'Completion submitted', 'Supplier'))).toBe('The supplier submitted the completion')
  })

  it('names the supplier on a quote approval, per perspective', () => {
    const e = ev('quote_approved', 'Quote approved — ABC Plumbing', 'Regional Manager')
    expect(rmFriendlyLabel(e, ctx)).toBe("You approved ABC Plumbing's quote")
    expect(smFriendlyLabel(e, ctx)).toBe("The regional manager approved ABC Plumbing's quote")
    expect(individualFriendlyLabel(e, ctx)).toBe("You approved ABC Plumbing's quote")
  })

  it('names the submitting supplier on a submission', () => {
    const e = ev('quote_submitted', 'Quote submitted by ABC Plumbing', 'Supplier')
    expect(rmFriendlyLabel(e, ctx)).toBe('ABC Plumbing submitted a quote')
    expect(individualFriendlyLabel(e, ctx)).toBe('ABC Plumbing submitted a quote')
  })
})

describe('store-manager view — the regional manager is never a person name', () => {
  it('reads "the regional manager" for RM actions and "you" for the SM', () => {
    expect(smFriendlyLabel(ev('logged', 'Ticket logged'))).toBe('You logged the ticket')
    expect(smFriendlyLabel(ev('info_requested', 'More information requested — need roof access', 'Regional Manager')))
      .toBe('The regional manager requested more information — need roof access')
    expect(smFriendlyLabel(ev('completion_approved', 'Completion approved', 'Regional Manager')))
      .toBe('The regional manager approved the completion')
  })
})

describe('supplier view — client-voiced', () => {
  it('reads the whole client side as "the client" and the supplier itself as "you"', () => {
    expect(supplierFriendlyLabel(ev('logged', 'Ticket logged'))).toBe('The client logged the ticket')
    expect(supplierFriendlyLabel(ev('quote_requested', 'Quote requested from ABC Plumbing', 'Regional Manager'))).toBe('The client requested a quote')
    expect(supplierFriendlyLabel(ev('quote_submitted', 'Quote submitted', 'Supplier'))).toBe('You submitted a quote')
    expect(supplierFriendlyLabel(ev('quote_approved', 'Quote approved — ABC Plumbing', 'Regional Manager'))).toBe('The client approved your quote')
    expect(supplierFriendlyLabel(ev('scheduled', 'Job scheduled', 'Supplier'))).toBe('You scheduled a visit')
    expect(supplierFriendlyLabel(ev('completion_submitted', 'Completion submitted', 'Supplier'))).toBe('You submitted the completion')
    expect(supplierFriendlyLabel(ev('completion_approved', 'Completion approved', 'Regional Manager'))).toBe('The client approved the completion')
  })

  it('never says "regional manager" or "store manager" to a supplier', () => {
    const labels = [
      supplierFriendlyLabel(ev('info_requested', 'More information requested', 'Regional Manager')),
      supplierFriendlyLabel(ev('info_added', 'Information added', 'Store Manager')),
      supplierFriendlyLabel(ev('variation_declined', 'Variation order declined — out of scope', 'Regional Manager')),
    ]
    for (const l of labels) {
      expect(l.toLowerCase()).not.toContain('regional manager')
      expect(l.toLowerCase()).not.toContain('store manager')
      expect(l.toLowerCase()).toContain('the client')
    }
  })
})

describe('person names never appear on any timeline', () => {
  it('surfaces the editor role, not their name', () => {
    const events = buildTicketTimeline({
      createdAt: '2026-01-01T00:00:00Z',
      edits: [{ at: '2026-01-02T00:00:00Z', note: null, byName: 'John Smith', byRole: 'store_manager' }],
    })
    const edited = events.find(e => e.tone === 'edited')!
    expect(edited.who).toBe('Store Manager')
    expect(edited.who).not.toContain('John')
    // …and the narrated label carries the role, never the name.
    const label = rmFriendlyLabel(edited)
    expect(label).toBe('The store manager edited the ticket')
    expect(label).not.toContain('John')
  })
})
