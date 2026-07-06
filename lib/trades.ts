// Canonical supplier trades — the multi-select on supplier onboarding and the
// directory filters share this list. Aligned with (a superset of) the ticket
// categories so a ticket's category can match suppliers by trade.
export const TRADES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Refrigeration',
  'Gas',
  'Structural',
  'Painting',
  'Carpentry',
  'Shopfitting',
  'Appliances',
  'Locksmith',
  'Cleaning',
  'General',
] as const

export type Trade = typeof TRADES[number]

export function sanitiseTrades(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const set = new Set<string>()
  for (const t of input) if (typeof t === 'string' && (TRADES as readonly string[]).includes(t)) set.add(t)
  return [...set]
}
