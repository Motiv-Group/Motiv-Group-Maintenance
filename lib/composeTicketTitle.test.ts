import { describe, it, expect } from 'vitest'
import { composeTicketTitle } from './utils'

describe('composeTicketTitle', () => {
  it('composes category + short description in full', () => {
    expect(composeTicketTitle('Electrical', 'plug sparking at till 3'))
      .toBe('Electrical — plug sparking at till 3')
  })

  it('trims long descriptions at a word boundary with an ellipsis', () => {
    const t = composeTicketTitle('Refrigeration', 'the fridge next to the bakery has been leaking water onto the floor since yesterday morning')
    expect(t.startsWith('Refrigeration — the fridge next to the bakery')).toBe(true)
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(65)
  })

  it('collapses whitespace/newlines in the description', () => {
    expect(composeTicketTitle('Plumbing', 'tap   broken\n\nin kitchen')).toBe('Plumbing — tap broken in kitchen')
  })

  it('falls back to the bare category when description is empty', () => {
    expect(composeTicketTitle('HVAC', '')).toBe('HVAC')
    expect(composeTicketTitle('HVAC', null)).toBe('HVAC')
  })

  it('defaults a missing category to General', () => {
    expect(composeTicketTitle(null, 'door hinge loose')).toBe('General — door hinge loose')
  })
})
