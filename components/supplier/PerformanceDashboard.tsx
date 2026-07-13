// Supplier Performance dashboard — presentational, server-safe (no hooks) so it
// renders from the data page and a preview harness alike. All numbers come from
// the caller (derived from real tickets); this file only lays them out.
import type { ReactNode } from 'react'
import { BarChart2, Clock, ShieldCheck, Wrench, Camera, AlertTriangle, RefreshCw, CheckCircle2, TrendingUp, Timer, Star } from 'lucide-react'
import type { SupplierPerformance } from '@/lib/health/supplierPerformance'
import { Card, Donut, Pill, BreakdownList } from '@/components/exec/ui'
import { Stars } from '@/components/ui/Stars'
import { formatDate } from '@/lib/utils'

export interface RecentJob { id: string; jobRef: string | null; title: string; storeName: string; category: string | null; isIndividual: boolean; breached: boolean; date: string }

const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n)))
const pct = (n: number) => `${Math.round(n * 100)}%`

// Good / watch / poor tone from a value against two thresholds.
function tone(value: number, good: number, warn: number, higherIsBetter = true): string {
  const ok = higherIsBetter ? value >= good : value <= good
  const mid = higherIsBetter ? value >= warn : value <= warn
  return ok ? 'text-emerald-600 dark:text-emerald-400' : mid ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
}

function Metric({ icon, label, value, sub, valueCls }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; valueCls?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueCls ?? 'text-[var(--text)]'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </Card>
  )
}

export function PerformanceDashboard({ perf, recent, rating }: { perf: SupplierPerformance; recent: RecentJob[]; rating: { avg: number; count: number } }) {
  const axes = {
    response: perf.avgResponseMins == null ? 14 : clamp(20 - perf.avgResponseMins / 60),
    completion: perf.avgResolutionMins == null ? 14 : clamp(20 - (perf.avgResolutionMins / 1440) * 1.5),
    firstFix: clamp(perf.firstTimeFixRate * 20),
    evidence: clamp(perf.evidenceCompletionRate * 20),
    communication: clamp(20 - perf.escalationCount * 3),
  }
  const onTime = Math.max(0, perf.completedTickets - perf.slaBreaches)
  const onTimeRate = perf.completedTickets ? onTime / perf.completedTickets : 1
  const latePct = perf.completedTickets ? (perf.slaBreaches / perf.completedTickets) * 100 : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><BarChart2 className="text-slate-600 dark:text-slate-400" size={22} /> Performance</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">Your SLA delivery and quality — computed from your own jobs.</p>
      </div>

      {/* Hero — SLA score donut + factor breakdown */}
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <Donut value={perf.performanceScore} status={perf.band} size={148} label="SLA" />
            <Pill status={perf.band} />
          </div>
          <div className="w-full flex-1 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">Score breakdown</p>
              <span className="text-[11px] text-[var(--text-faint)]">out of 20 each</span>
            </div>
            <BreakdownList rows={[
              { label: 'Response Time', value: axes.response, max: 20 },
              { label: 'Completion Time', value: axes.completion, max: 20 },
              { label: 'First Time Fix', value: axes.firstFix, max: 20 },
              { label: 'Evidence Quality', value: axes.evidence, max: 20 },
              { label: 'Communication', value: axes.communication, max: 20 },
            ]} />
          </div>
        </div>
      </Card>

      {/* Headline outcomes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[var(--text-muted)]"><Star size={15} className="shrink-0 text-[#C6A35D]" /><span className="text-[11px] font-medium uppercase tracking-wide">Client rating</span></div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{rating.avg.toFixed(1)}</span>
            <Stars value={rating.avg} size={14} />
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">{rating.count} rating{rating.count === 1 ? '' : 's'}</div>
        </Card>
        <Metric icon={<TrendingUp size={15} />} label="On-time delivery" value={pct(onTimeRate)} valueCls={tone(onTimeRate, 0.9, 0.75)} sub={`${onTime} of ${perf.completedTickets} on time`} />
        <Metric icon={<CheckCircle2 size={15} />} label="Completed" value={perf.completedTickets} sub={`${perf.assignedTickets} assigned`} />
        <Metric icon={<Wrench size={15} />} label="First-time fix" value={pct(perf.firstTimeFixRate)} valueCls={tone(perf.firstTimeFixRate, 0.9, 0.75)} sub="target ≥ 90%" />
      </div>

      {/* SLA delivery split bar */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" /> SLA delivery</p>
          <span className="text-[11px] text-[var(--text-faint)]">{perf.completedTickets} completed job{perf.completedTickets === 1 ? '' : 's'}</span>
        </div>
        {perf.completedTickets === 0 ? (
          <p className="py-3 text-sm text-[var(--text-faint)]">No completed jobs yet — your SLA delivery will appear here.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="bg-emerald-500" style={{ width: `${100 - latePct}%` }} />
              <div className="bg-red-500" style={{ width: `${latePct}%` }} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> On time <span className="font-semibold text-[var(--text)]">{onTime}</span></span>
              <span className="flex items-center gap-1.5 text-[var(--text-muted)]"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Breached <span className="font-semibold text-[var(--text)]">{perf.slaBreaches}</span></span>
            </div>
          </>
        )}
      </Card>

      {/* Quality & responsiveness detail */}
      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Quality &amp; responsiveness</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<Camera size={15} />} label="Evidence rate" value={pct(perf.evidenceCompletionRate)} valueCls={tone(perf.evidenceCompletionRate, 0.95, 0.8)} sub="COC + photos" />
          <Metric icon={<Clock size={15} />} label="Avg response" value={perf.avgResponseMins == null ? '—' : `${(perf.avgResponseMins / 60).toFixed(1)}h`} sub="to accept / quote" />
          <Metric icon={<Timer size={15} />} label="Avg completion" value={perf.avgResolutionMins == null ? '—' : `${(perf.avgResolutionMins / 1440).toFixed(1)}d`} sub="assign → done" />
          <Metric icon={<AlertTriangle size={15} />} label="SLA breaches" value={perf.slaBreaches} valueCls={tone(perf.slaBreaches, 0, 2, false)} />
          <Metric icon={<RefreshCw size={15} />} label="Repeat defects" value={perf.repeatDefectInvolvement} valueCls={tone(perf.repeatDefectInvolvement, 0, 1, false)} sub="return visits" />
          <Metric icon={<AlertTriangle size={15} />} label="Escalations" value={perf.escalationCount} valueCls={tone(perf.escalationCount, 0, 1, false)} sub="P1 breaches" />
          <Metric icon={<CheckCircle2 size={15} />} label="Assigned" value={perf.assignedTickets} />
          <Metric icon={<Wrench size={15} />} label="Active now" value={Math.max(0, perf.assignedTickets - perf.completedTickets)} sub="in progress" />
        </div>
      </div>

      {/* Recent completed jobs */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <p className="text-sm font-semibold text-[var(--text)]">Recent completed jobs</p>
          <span className="text-[11px] text-[var(--text-faint)]">last {recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--text-faint)]">No completed jobs yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recent.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{t.jobRef ? `${t.jobRef} · ` : ''}{t.title}</p>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">{t.isIndividual ? 'Individual' : t.storeName}{t.category ? ` · ${t.category}` : ''} · {formatDate(t.date)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.breached ? 'bg-red-500/15 text-red-700 dark:text-red-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>{t.breached ? 'Late' : 'On time'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
