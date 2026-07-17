import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Unit tests for the WhatsApp intake's pure functions (exported for tests):
//   • sanitiseExtracted — clamps free-text LLM output to the exact web-form
//     enums; a bad/missing value must never block ticket creation.
//   • impactToPriority  — operational impact → v3 P1–P4 + severity, mirroring
//     the health engine so WhatsApp tickets rank like web-form tickets.
// The route module is imported, so its side-effect imports are stubbed.
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
  createAdminClient: () => ({}),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/push', () => ({ sendPushToMany: () => {}, sendPushToUser: () => {} }))
vi.mock('@/lib/briefing/generate', () => ({ getBriefingForUser: async () => null }))
vi.mock('@/lib/briefing/facts', () => ({ briefingToText: () => '' }))

import { sanitiseExtracted, impactToPriority } from '@/app/api/webhooks/whatsapp/route'

describe('sanitiseExtracted — LLM output clamped to form enums', () => {
  it('keeps a fully valid extraction unchanged', () => {
    const out = sanitiseExtracted({
      title: 'Geyser leaking in storeroom',
      description: 'Hot water geyser leaking onto the floor.',
      category: 'Plumbing',
      operational_impact: 'trading_affected',
      priority: 'high',
      confidence: 0.9,
      is_issue: true,
    })
    expect(out).toMatchObject({
      title: 'Geyser leaking in storeroom',
      category: 'Plumbing',
      operational_impact: 'trading_affected',
      priority: 'high',
      confidence: 0.9,
      is_issue: true,
    })
  })

  it('unknown category falls back to General (never blocks)', () => {
    expect(sanitiseExtracted({ category: 'Quantum Repairs' as any }).category).toBe('General')
    expect(sanitiseExtracted({}).category).toBe('General')
  })

  it('unknown operational_impact falls back to none', () => {
    expect(sanitiseExtracted({ operational_impact: 'catastrophic' as any }).operational_impact).toBe('none')
    expect(sanitiseExtracted({}).operational_impact).toBe('none')
  })

  it('unknown priority falls back to medium', () => {
    expect(sanitiseExtracted({ priority: 'ASAP' as any }).priority).toBe('medium')
    expect(sanitiseExtracted({}).priority).toBe('medium')
  })

  it('confidence outside [0,1] or non-numeric falls back to 0.5', () => {
    expect(sanitiseExtracted({ confidence: 1.7 }).confidence).toBe(0.5)
    expect(sanitiseExtracted({ confidence: -0.2 }).confidence).toBe(0.5)
    expect(sanitiseExtracted({ confidence: 'high' as any }).confidence).toBe(0.5)
    expect(sanitiseExtracted({ confidence: 0 }).confidence).toBe(0)
    expect(sanitiseExtracted({ confidence: 1 }).confidence).toBe(1)
  })

  it('missing is_issue defaults to TRUE so a real ticket is never silently dropped', () => {
    expect(sanitiseExtracted({}).is_issue).toBe(true)
    expect(sanitiseExtracted({ is_issue: false }).is_issue).toBe(false)
  })

  it('title is defaulted and truncated to 80 chars', () => {
    expect(sanitiseExtracted({}).title).toBe('Maintenance request')
    const long = 'x'.repeat(200)
    expect(sanitiseExtracted({ title: long }).title).toHaveLength(80)
  })

  it('missing description falls back to the transcript, then to a stub', () => {
    expect(sanitiseExtracted({}, 'raw transcript words').description).toBe('raw transcript words')
    expect(sanitiseExtracted({}).description).toBe('No description provided')
  })
})

describe('impactToPriority — mirrors the health engine derivation', () => {
  it.each([
    ['cannot_trade', 'P1', 'critical'],
    ['safety_risk', 'P1', 'critical'],
    ['trading_affected', 'P2', 'high'],
    ['customer_visible', 'P3', 'medium'],
    ['staff_inconvenience', 'P3', 'medium'],
    ['cosmetic', 'P4', 'low'],
    ['none', 'P4', 'low'],
  ] as const)('%s → %s / %s', (impact, priority, severity) => {
    expect(impactToPriority(impact as any)).toEqual({ priority, severity })
  })
})
