// Presentational primitives shared by the Regional + Executive dashboards.
// Server components (no client JS) — pure rendering from props.
import Link from 'next/link'
import type { RagStatus } from '@/lib/types'
import { RAG_COLORS, RAG_STROKE, RAG_LABELS } from '@/lib/dashboards/constants'

export function RagBadge({ rag, label }: { rag: RagStatus; label?: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RAG_COLORS[rag]}`}>
      {label ?? RAG_LABELS[rag]}
    </span>
  )
}

/** Circular 0-100 health gauge coloured by RAG band. */
export function HealthGauge({
  score, rag, size = 140, label = 'Health',
}: { score: number | null; rag: RagStatus | null; size?: number; label?: string }) {
  const r = size / 2 - 16
  const c = 2 * Math.PI * r
  const offset = score == null ? c : c * (1 - score / 100)
  const stroke = rag ? RAG_STROKE[rag] : '#9ca3af'
  const cx = size / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
        <circle
          cx={cx} cy={cx} r={r} fill="none" strokeWidth="12" strokeLinecap="round"
          stroke={stroke} strokeDasharray={c} strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color: stroke }}>{score == null ? '—' : `${score}%`}</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      </div>
    </div>
  )
}

export interface KpiSpec {
  label: string
  value: string | number
  hint?: string
  accent?: string         // e.g. 'border-l-red-500'
  href?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}

const TONE: Record<NonNullable<KpiSpec['tone']>, string> = {
  default: 'text-gray-900 dark:text-white',
  good: 'text-green-600 dark:text-green-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
}

export function KpiCard({ spec }: { spec: KpiSpec }) {
  const inner = (
    <div className={`bg-slate-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${spec.accent ?? 'border-l-brand-500'} p-3 h-full flex flex-col justify-between gap-1`}>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-tight">{spec.label}</p>
      <p className={`text-xl font-bold leading-none ${TONE[spec.tone ?? 'default']}`}>{spec.value}</p>
      {spec.hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{spec.hint}</p>}
    </div>
  )
  return spec.href
    ? <Link href={spec.href} className="hover:opacity-80 transition-opacity">{inner}</Link>
    : <div>{inner}</div>
}

export function KpiGrid({ specs }: { specs: KpiSpec[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {specs.map(s => <KpiCard key={s.label} spec={s} />)}
    </div>
  )
}

/** Green/Amber/Red/Critical stacked distribution bar with legend. */
export function DistributionBar({
  counts,
}: { counts: { green: number; amber: number; red: number; critical: number } }) {
  const total = counts.green + counts.amber + counts.red + counts.critical
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  const seg: { key: RagStatus; color: string; n: number }[] = [
    { key: 'green', color: 'bg-green-500', n: counts.green },
    { key: 'amber', color: 'bg-amber-500', n: counts.amber },
    { key: 'red', color: 'bg-red-500', n: counts.red },
    { key: 'critical', color: 'bg-red-800', n: counts.critical },
  ]
  return (
    <div className="space-y-2">
      <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
        {seg.map(s => s.n > 0 && (
          <div key={s.key} className={`h-full ${s.color}`} style={{ width: `${pct(s.n)}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Legend color="bg-green-500"  label="Controlled"  n={counts.green}    total={total} />
        <Legend color="bg-amber-500"  label="Attention"   n={counts.amber}    total={total} />
        <Legend color="bg-red-500"    label="At Risk"     n={counts.red}      total={total} />
        <Legend color="bg-red-800"    label="Critical"    n={counts.critical} total={total} />
      </div>
    </div>
  )
}

function Legend({ color, label, n, total }: { color: string; label: string; n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <span className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
      <span className={`w-2 h-2 rounded-full ${color} inline-block`} />{label} {n} ({pct}%)
    </span>
  )
}

export function SectionCard({
  title, icon, children, action,
}: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
