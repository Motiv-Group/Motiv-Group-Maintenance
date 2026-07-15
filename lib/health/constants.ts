// MOTIV health engine v3 — weights, bands, penalties, thresholds (spec §7–§11)
import type { HealthStatus, OperationalImpact, SlaTargets, Priority } from './types'

export const STORE_WEIGHTS = {
  operationalRisk: 30, sla: 20, ticketLoad: 15,
  repeatDefect: 15, commercialBlocker: 10, dataQuality: 10,
} as const

// §8 status bands (same wording for store/region/estate)
// Controlled 95–100 · Attention 80–94 · At Risk 51–79 · Critical 0–50
export function statusForScore(score: number | null | undefined): HealthStatus {
  if (score == null || Number.isNaN(score)) return 'critical'
  if (score >= 95) return 'controlled'
  if (score >= 80) return 'attention'
  if (score >= 51) return 'at_risk'
  return 'critical'
}
export const STATUS_RANK: Record<HealthStatus, number> = { controlled: 0, attention: 1, at_risk: 2, critical: 3 }
export const STATUS_LABELS: Record<HealthStatus, string> = {
  controlled: 'Controlled', attention: 'Attention Required', at_risk: 'At Risk', critical: 'Critical',
}
// Dark-navy/gold brand-aligned classes
export const STATUS_COLORS: Record<HealthStatus, string> = {
  controlled: 'bg-emerald-500/15 text-emerald-400',
  attention:  'bg-blue-500/15 text-blue-500',
  at_risk:    'bg-red-500/15 text-red-400',
  critical:   'bg-red-800/30 text-red-300',
}
export const STATUS_STROKE: Record<HealthStatus, string> = {
  controlled: '#10b981', attention: '#f59e0b', at_risk: '#ef4444', critical: '#b91c1c',
}
export function bandCeiling(s: HealthStatus): number {
  return s === 'critical' ? 50 : s === 'at_risk' ? 79 : s === 'attention' ? 94 : 100
}

// §7.1 Operational Risk — deduction by highest active impact
export const OP_IMPACT_DEDUCTION: Record<OperationalImpact, number> = {
  none: 0, cosmetic: 3, customer_visible: 8, staff_inconvenience: 10,
  trading_affected: 18, safety_risk: 25, cannot_trade: 30,
}

// §10 Regional penalties
export const REGIONAL_PENALTIES = {
  anyCritical: 5, threeOrMoreAtRisk: 5, criticalTicketOverdue: 5,
  internalBreachOver3d: 3, supplierBreachOver3d: 3, repeatAcrossStores: 3,
  highValueBlocker: 3, missingCriticalUpdates: 3,
} as const

// §11 Estate penalties
export const ESTATE_PENALTIES = {
  anyCriticalRegion: 5, criticalStoresOver5pct: 5, atRiskStoresOver10pct: 5,
  supplierTrendUp: 3, internalTrendUp: 3, commercialBacklogUp: 3,
  repeatTrendUp: 3, costExposureOverThreshold: 3, criticalTicketOverdue: 5,
} as const

export const THRESHOLDS = {
  highValueQuote: 25_000,
  blockerMaxDays: 7,
  repeatWindowDays: 30,
  repeatAssetWindowDays: 90,
  criticalStaleHours: 48,
  atRiskElapsedFraction: 0.8,   // ≥80% of resolution window elapsed = "at risk"
  estateCostExposure: 1_000_000,
  staleUpdateDays: 7,
} as const

// Fallback SLA if a rule row is missing (mirrors seeded P3)
export const FALLBACK_SLA: Record<Priority, SlaTargets> = {
  // resolution_mins is the headline "priority window" (time-to-resolve before overdue):
  // P1 Urgent 4h · P2 High 1 day · P3 Medium 5 days · P4 Low 7 days.
  P1: { priority: 'P1', first_response_mins: 60,   attendance_mins: 240,  quote_due_mins: 240,  resolution_mins: 240,   internal_decision_mins: 240 },
  P2: { priority: 'P2', first_response_mins: 240,  attendance_mins: 480,  quote_due_mins: 480,  resolution_mins: 1440,  internal_decision_mins: 480 },
  P3: { priority: 'P3', first_response_mins: 1440, attendance_mins: 2880, quote_due_mins: 2880, resolution_mins: 7200,  internal_decision_mins: 2880 },
  P4: { priority: 'P4', first_response_mins: 2880, attendance_mins: 7200, quote_due_mins: 7200, resolution_mins: 10080, internal_decision_mins: 7200 },
}
