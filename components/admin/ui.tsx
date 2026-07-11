// Shared building blocks for the infra provider pages. Server-safe (no client
// state of their own); the interactive leaves (InfoTip, RefreshButton) are
// imported client components. Colours use theme CSS vars — never hardcode hex.
import type { ReactNode } from 'react'
import { ExternalLink, AlertTriangle, Info as InfoIcon, XCircle } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { RefreshButton } from './RefreshButton'
import { pctOf } from '@/lib/admin/limits'
import type { ProviderResult, ProviderStatus } from '@/lib/admin/types'

const STATUS_DOT: Record<ProviderStatus, string> = {
  ok: 'bg-emerald-500', degraded: 'bg-amber-500', unconfigured: 'bg-slate-400', error: 'bg-red-500',
}
const STATUS_WORD: Record<ProviderStatus, string> = {
  ok: 'Live', degraded: 'Partial', unconfigured: 'Not configured', error: 'Error',
}

/** Page header for a provider panel: icon + name, an InfoTip explaining why the
 *  provider matters, a live/error status dot, an external link to the real
 *  dashboard, and the manual refresh button. */
export function ProviderHeader({
  name, icon, whatItIs, result, dashboardUrl, dashboardLabel = 'Open dashboard',
}: {
  name: string
  icon: ReactNode
  whatItIs: ReactNode
  result: ProviderResult<unknown>
  dashboardUrl: string
  dashboardLabel?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
            {icon}
            {name}
            <InfoTip title={`What is ${name}?`} align="left">{whatItIs}</InfoTip>
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[result.status]}`} />
            {STATUS_WORD[result.status]}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton fetchedAt={result.fetchedAt} />
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--hover)] transition"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">{dashboardLabel}</span>
          </a>
        </div>
      </div>
      {result.message && (
        <Notice variant={result.status === 'error' ? 'error' : result.status === 'unconfigured' ? 'info' : 'warn'}>
          {result.message}
        </Notice>
      )}
    </div>
  )
}

/** A single metric tile: label + InfoTip explanation + big value + optional hint. */
export function StatTile({
  label, value, info, hint, tone = 'default', icon,
}: {
  label: string
  value: ReactNode
  info: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' | 'gold'
  icon?: ReactNode
}) {
  const toneCls: Record<string, string> = {
    default: 'text-[var(--text-muted)]', good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-500', bad: 'text-red-600 dark:text-red-400',
    info: 'text-blue-600 dark:text-blue-400', gold: 'text-amber-600 dark:text-[#C6A35D]',
  }
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-w-0">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${toneCls[tone]}`}>
        {icon}
        <span className="truncate">{label}</span>
        <InfoTip title={label}>{info}</InfoTip>
      </div>
      <div className="text-2xl font-bold leading-none text-[var(--text)] tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-[var(--text-faint)]">{hint}</div>}
    </Card>
  )
}

/** Usage-vs-free-tier bar. Turns amber ≥75% and red ≥90% so a looming cliff
 *  reads at a glance. */
export function UsageBar({
  value, limit, unitLabel,
}: { value: number | null; limit: number; unitLabel?: string }) {
  const pct = pctOf(value, limit)
  if (pct == null) return <div className="text-[11px] text-[var(--text-faint)]">Usage unavailable</div>
  const color = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)]">
        <span>{pct}% of free tier</span>
        {unitLabel && <span>{unitLabel}</span>}
      </div>
    </div>
  )
}

/** Inline callout for tier limits, degraded state, and errors. */
export function Notice({ variant = 'info', children }: { variant?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const map = {
    info:  { cls: 'bg-blue-500/10 ring-blue-500/30 text-blue-700 dark:text-blue-300', icon: <InfoIcon size={14} /> },
    warn:  { cls: 'bg-amber-500/10 ring-amber-500/30 text-amber-700 dark:text-amber-400', icon: <AlertTriangle size={14} /> },
    error: { cls: 'bg-red-500/10 ring-red-500/30 text-red-700 dark:text-red-300', icon: <XCircle size={14} /> },
  }[variant]
  return (
    <div className={`flex items-start gap-2 rounded-xl ring-1 p-3 text-xs leading-relaxed ${map.cls}`}>
      <span className="mt-0.5 shrink-0">{map.icon}</span>
      <span>{children}</span>
    </div>
  )
}
