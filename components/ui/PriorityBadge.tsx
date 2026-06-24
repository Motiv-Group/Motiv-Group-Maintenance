// Priority badge in plain store-manager terms (Low / Medium / High / Urgent),
// styled like the status badges. Accepts either the health-engine codes
// (P1–P4) or the classic low/medium/high/urgent values. Pure/server-safe.
import { PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/utils'
import type { Priority } from '@/lib/types'

// P1 is the most urgent band; map it to the classic words the SM expects.
const TO_CLASSIC: Record<string, Priority> = {
  P1: 'urgent', P2: 'high', P3: 'medium', P4: 'low',
  urgent: 'urgent', high: 'high', medium: 'medium', low: 'low',
}

export function PriorityBadge({ priority, className = '' }: { priority?: string | null; className?: string }) {
  if (!priority) return null
  const c = TO_CLASSIC[priority]
  if (!c) return null
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_COLORS[c]} ${className}`}>
      {PRIORITY_LABELS[c]}
    </span>
  )
}
