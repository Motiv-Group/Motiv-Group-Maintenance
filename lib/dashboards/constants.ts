// ============================================================
// Dashboards v2 — scoring constants & shared RAG helpers
//
// Single source of truth for weights, band thresholds and labels used by
// the store / regional / estate health engines. Tune here, not inline.
// ============================================================
import type { RagStatus, Priority } from '@/lib/types'

// ── Store Health weights (sum = 100) ─────────────────────────
export const STORE_WEIGHTS = {
  operationalRisk: 30,
  sla: 20,
  ticketLoad: 15,
  repeatDefect: 15,
  commercialBlocker: 10,
  dataQuality: 10,
} as const

// ── RAG band thresholds (same bands for store / region / estate) ──
//   85-100 green · 70-84 amber · 50-69 red · 0-49 critical
export function ragForScore(score: number | null | undefined): RagStatus | null {
  if (score == null || Number.isNaN(score)) return null
  if (score >= 85) return 'green'
  if (score >= 70) return 'amber'
  if (score >= 50) return 'red'
  return 'critical'
}

// Numeric severity rank — higher = worse. Critical sorts/aggregates first.
export const RAG_RANK: Record<RagStatus, number> = {
  green: 0, amber: 1, red: 2, critical: 3,
}

export const RAG_LABELS: Record<RagStatus, string> = {
  green: 'Controlled',
  amber: 'Attention Required',
  red: 'At Risk',
  critical: 'Immediate Intervention Required',
}

// Portfolio / estate share the band words but a slightly different green label.
export const PORTFOLIO_LABELS: Record<RagStatus, string> = {
  green: 'Excellent / Controlled',
  amber: 'Attention Required',
  red: 'At Risk',
  critical: 'Immediate Intervention Required',
}

// Tailwind classes per RAG band — reused by every dashboard badge/gauge.
export const RAG_COLORS: Record<RagStatus, string> = {
  green:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
}

export const RAG_STROKE: Record<RagStatus, string> = {
  green: '#22c55e', amber: '#f59e0b', red: '#ef4444', critical: '#b91c1c',
}

// ── Regional portfolio risk penalties (spec §4) ──────────────
export const REGIONAL_PENALTIES = {
  anyCriticalStore: 5,
  threeOrMoreRedStores: 5,
  criticalTicketOverdue: 5,
  internalSlaBreachOver3d: 3,
  supplierSlaBreachOver3d: 3,
  repeatDefectAcrossStores: 3,
  quoteApprovalBacklog: 3,
  missingCriticalUpdates: 3,
} as const

// ── Estate risk penalties (spec §5) ──────────────────────────
export const ESTATE_PENALTIES = {
  anyCriticalRegion: 5,
  criticalStoresOver5pct: 5,
  redStoresOver10pct: 5,
  supplierSlaTrendUp: 3,
  internalSlaTrendUp: 3,
  quoteBacklogTrendUp: 3,
  repeatDefectsTrendUp: 3,
  costExposureOverThreshold: 3,
  criticalTicketOverdue: 5,
} as const

// ── Operational thresholds (tunable) ─────────────────────────
export const THRESHOLDS = {
  // Repeat defects: same category at one store within N days
  repeatWindowDays: 30,
  repeatStoreRedCount: 3,        // >3 repeats in 30d → store override Red
  // Critical ticket stale → store Red if no update for this long
  criticalStaleHours: 48,
  // Quote approval backlog (region) above this count → penalty
  quoteBacklogCount: 5,
  // High-value quote threshold (ZAR)
  highValueQuote: 25_000,
  // Cost exposure threshold for estate penalty (ZAR pending quote value)
  estateCostExposure: 1_000_000,
  // Ticket-load scoring: open tickets at/above this score 0 for load
  loadOpenTicketsMax: 15,
  loadAgeingDays: 14,            // open older than this counts as ageing backlog
} as const

// ── Internal SLA breach severity wording ─────────────────────
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
