// MOTIV dashboard UI kit. Theme-aware via CSS vars (see globals.css): surfaces
// use --surface/--border/--text/--text-muted/--text-faint so light + dark both
// work. Status accents use a darker hue in light mode for readability.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { HealthStatus } from '@/lib/health/types'

export const GOLD = '#C6A35D'

export const STATUS_PILL: Record<HealthStatus, string> = {
  controlled: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30',
  attention:  'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D] ring-1 ring-[#C6A35D]/30',
  at_risk:    'bg-red-500/15 text-red-700 dark:text-red-400 ring-1 ring-red-500/30',
  critical:   'bg-red-700/20 text-red-800 dark:text-red-300 ring-1 ring-red-600/40',
}
export const STATUS_TEXT: Record<HealthStatus, string> = {
  controlled: 'text-emerald-600 dark:text-emerald-400', attention: 'text-amber-600 dark:text-[#C6A35D]',
  at_risk: 'text-red-600 dark:text-red-400', critical: 'text-red-700 dark:text-red-300',
}
export const STATUS_STROKE: Record<HealthStatus, string> = {
  controlled: '#10b981', attention: GOLD, at_risk: '#f87171', critical: '#dc2626',
}
const STATUS_WORD: Record<HealthStatus, string> = {
  controlled: 'Controlled', attention: 'Attention Required', at_risk: 'At Risk', critical: 'Critical',
}

export function Pill({ status, label }: { status: HealthStatus; label?: string }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>{label ?? STATUS_WORD[status]}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-[var(--surface)] ring-1 ring-black/10 dark:ring-white/10 shadow-sm dark:shadow-md dark:shadow-black/20 ${className}`}>{children}</div>
}

export function SectionCard({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

export interface Kpi { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'default' | 'info' | 'gold' | 'good' | 'warn' | 'bad' | 'neutral'; trend?: Trend; href?: string }
// Tone colours the icon + label so each metric reads at a glance; the number
// stays white for contrast.
const TONE: Record<NonNullable<Kpi['tone']>, string> = {
  default: 'text-[var(--text-muted)]',
  info:    'text-blue-600 dark:text-blue-400',
  gold:    'text-amber-600 dark:text-[#C6A35D]',
  good:    'text-emerald-600 dark:text-emerald-400',
  warn:    'text-amber-600 dark:text-amber-500',
  bad:     'text-red-600 dark:text-red-400',
  neutral: 'text-[var(--text-muted)]',
}
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const body = (
    <Card className={`p-4 flex flex-col gap-1.5 min-w-0${kpi.href ? ' h-full transition hover:ring-[#C6A35D]/50 hover:-translate-y-0.5 cursor-pointer' : ''}`}>
      <div className={`flex items-center justify-between gap-2 text-[11px] font-semibold ${TONE[kpi.tone ?? 'default']}`}>
        <span className="flex items-center gap-1.5 truncate">{kpi.icon}{kpi.label}</span>
        {kpi.trend && <TrendArrow t={kpi.trend} />}
      </div>
      <div className="text-2xl font-bold leading-none text-[var(--text)]">{kpi.value}</div>
      {kpi.hint && <div className="text-[11px] text-[var(--text-faint)]">{kpi.hint}</div>}
    </Card>
  )
  return kpi.href
    ? <Link href={kpi.href} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A35D]/50">{body}</Link>
    : body
}
export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}</div>
}

export type Trend = { dir: 'up' | 'down' | 'flat'; label?: string; good?: boolean }
export function TrendArrow({ t }: { t: Trend }) {
  if (t.dir === 'flat') return <span className="text-[var(--text-faint)] text-[11px]">→ {t.label}</span>
  const up = t.dir === 'up'
  const bad = 'text-red-600 dark:text-red-400', good = 'text-emerald-600 dark:text-emerald-400'
  const color = t.good === undefined ? (up ? bad : good) : (t.good ? good : bad)
  return <span className={`text-[11px] ${color}`}>{up ? '↑' : '↓'} {t.label}</span>
}

/** Circular score gauge. */
export function Donut({ value, status, size = 120, label }: { value: number; status: HealthStatus; size?: number; label?: string }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r, off = c * (1 - value / 100), cx = size / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-white/10" />
        <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={STATUS_STROKE[status]} strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color: STATUS_STROKE[status] }}>{value}%</span>
        {label && <span className="text-[9px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>}
      </div>
    </div>
  )
}

type Counts = { controlled: number; attention: number; at_risk: number; critical: number }

/** Multi-segment store distribution ring with a total in the centre. */
export function StoreDistributionDonut({ counts, size = 150 }: { counts: Counts; size?: number }) {
  const segs = [
    { color: '#10b981', n: counts.controlled },
    { color: GOLD, n: counts.attention },
    { color: '#f87171', n: counts.at_risk },
    { color: '#991b1b', n: counts.critical },
  ]
  const total = segs.reduce((s, x) => s + x.n, 0) || 1
  const r = size / 2 - 12, c = 2 * Math.PI * r, cx = size / 2
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth="12" className="stroke-slate-200 dark:stroke-white/5" />
        {segs.map((s, i) => {
          if (s.n <= 0) return null
          const len = (s.n / total) * c
          const el = (
            <circle key={i} cx={cx} cy={cx} r={r} fill="none" strokeWidth="12" strokeLinecap="butt"
              stroke={s.color} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-[var(--text)] tabular-nums">{total}</span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Total Stores</span>
      </div>
    </div>
  )
}

/** Legend row: swatch · label · count · percentage. */
export function DistributionLegend({ counts }: { counts: Counts }) {
  const total = counts.controlled + counts.attention + counts.at_risk + counts.critical || 1
  const rows: { color: string; label: string; n: number }[] = [
    { color: 'bg-emerald-500', label: 'Green (Controlled)', n: counts.controlled },
    { color: 'bg-[#C6A35D]', label: 'Amber (Attention)', n: counts.attention },
    { color: 'bg-red-400', label: 'Red (At Risk)', n: counts.at_risk },
    { color: 'bg-red-800', label: 'Critical', n: counts.critical },
  ]
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <i className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
          <span className="text-[var(--text-muted)] flex-1 truncate">{r.label}</span>
          <span className="text-[var(--text)] font-semibold tabular-nums">{r.n}</span>
          <span className="text-[var(--text-faint)] tabular-nums w-9 text-right">{Math.round((r.n / total) * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

/** Breakdown line: label · bar · "x / max". */
export function BreakdownList({ rows }: { rows: { label: string; value: number; max: number }[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const pct = r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0
        const tone = pct >= 85 ? '#10b981' : pct >= 60 ? GOLD : '#f87171'
        return (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)] w-32 shrink-0">{r.label}</span>
            <span className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} /></span>
            <span className="text-[var(--text)] w-12 text-right tabular-nums">{round(r.value)} / {r.max}</span>
          </div>
        )
      })}
    </div>
  )
}

export function DistributionChips({ counts }: { counts: { controlled: number; attention: number; at_risk: number; critical: number } }) {
  const total = counts.controlled + counts.attention + counts.at_risk + counts.critical || 1
  const cells: { k: HealthStatus; label: string; n: number }[] = [
    { k: 'controlled', label: 'Green', n: counts.controlled },
    { k: 'attention', label: 'Amber', n: counts.attention },
    { k: 'at_risk', label: 'Red', n: counts.at_risk },
    { k: 'critical', label: 'Critical', n: counts.critical },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {cells.map(c => (
        <div key={c.k} className={`rounded-lg px-2 py-2 text-center ${STATUS_PILL[c.k]}`}>
          <div className="text-[10px] opacity-80">{c.label}</div>
          <div className="text-lg font-bold leading-none">{c.n}</div>
          <div className="text-[10px] opacity-70">({Math.round((c.n / total) * 100)}%)</div>
        </div>
      ))}
    </div>
  )
}

/** Horizontal stacked distribution bar (Stores hero). */
export function DistributionBar({ counts }: { counts: { controlled: number; attention: number; at_risk: number; critical: number } }) {
  const total = counts.controlled + counts.attention + counts.at_risk + counts.critical || 1
  const seg = [
    { c: 'bg-emerald-500', n: counts.controlled }, { c: 'bg-[#C6A35D]', n: counts.attention },
    { c: 'bg-red-500', n: counts.at_risk }, { c: 'bg-red-800', n: counts.critical },
  ]
  return (
    <div className="h-3 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
      {seg.map((s, i) => s.n > 0 && <div key={i} className={`h-full ${s.c}`} style={{ width: `${(s.n / total) * 100}%` }} />)}
    </div>
  )
}

export function QuickRow({ label, value, icon, tone }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'default' | 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-[var(--border)] last:border-0">
      <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{icon}{label}</span>
      <span className={`flex items-center gap-1 text-xs font-semibold ${tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{value}<ChevronRight size={13} className="text-[var(--text-faint)]" /></span>
    </div>
  )
}

export function RecommendedAction({ text }: { text: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Recommended Action</div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{text}</p>
    </div>
  )
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-500" />Controlled ≥80%</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-[#C6A35D]" />Attention 60–79%</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-red-500" />At Risk &lt;60%</span>
    </div>
  )
}

function round(n: number) { return Math.round(n * 10) / 10 }
