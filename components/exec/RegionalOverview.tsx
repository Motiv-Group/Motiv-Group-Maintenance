'use client'

import Link from 'next/link'
import { Building2, Truck, ListTodo, Banknote } from 'lucide-react'
import type { RegionalDashboardData, RegionalTicketAction } from '@/lib/health/data'
import { SectionCard, Card, DistributionBar, RagBlocks, STATUS_TEXT } from '@/components/exec/ui'
import { DashboardHealthHeader } from '@/components/exec/DashboardHealthHeader'
import { RegionalPriorityWorkQueue } from '@/components/regional/RegionalPriorityWorkQueue'
import { Stars } from '@/components/ui/Stars'
import type { Briefing } from '@/lib/briefing/facts'
import { formatCurrency, humanizeDuration } from '@/lib/utils'

export function RegionalOverview({ data, name, briefing, briefingScopeId, motivSuppliers = [] }: { data: RegionalDashboardData; name: string | null; briefing?: Briefing; briefingScopeId?: string; motivSuppliers?: { id: string; name: string; avgRating?: number; ratingCount?: number; category?: string | null }[] }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  // eslint-disable-next-line react-hooks/purity -- cosmetic "time remaining" readouts, recomputed per render by design
  const nowMs = Date.now()
  const actions = topFocusActions(data)
  // Items awaiting the RM's approval action (quotes + variation orders to review).
  const awaitingApproval = data.tickets.filter(t => ['quoted', 'quote_revision', 'variation_review'].includes(t.status)).length
  // Company suppliers for the Today queue's in-place "Assign supplier" picker.
  const assignSuppliers = data.suppliers.map(s => ({ id: s.id, name: s.name, avgRating: s.avgRating, ratingCount: s.ratingCount, category: s.category }))

  return (
    <div className="space-y-5">
      {/* Page header — greeting (left) · region health donut + AI briefing (right). */}
      <DashboardHealthHeader
        greeting={greeting}
        name={name}
        subtitle="Regional portfolio overview"
        scopePrefix="Portfolio"
        score={p.finalPortfolioHealth}
        status={p.status}
        briefingBody={briefing?.body}
        briefingHeadline={briefing?.headline}
        briefingScope="region"
        briefingScopeId={briefingScopeId}
      />

      {/* KPI cards + priority work queue (same as the store-manager home). */}
      <RegionalPriorityWorkQueue tickets={data.tickets} generatedAt={data.generatedAt} suppliers={assignSuppliers} motivSuppliers={motivSuppliers} />

      {/* Portfolio blocks side by side: distribution · focus · supplier perf · quote value */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SectionCard title="Store Health Distribution" icon={<Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />} action={<Link href="/regional/stores" className="text-xs text-blue-500 hover:underline">View all</Link>}>
          <DistributionBar counts={p.counts} />
          {/* Each RAG block deep-links into the Stores tab filtered to that status. */}
          <div className="mt-3"><RagBlocks counts={p.counts} unitLabel="stores" hrefFor={s => `/regional/stores?status=${s}`} /></div>
        </SectionCard>

        <SectionCard title="Recommended Focus Today" icon={<ListTodo size={15} className="text-[#f59e0b]" />}>
          {actions.length ? (
            <ul className="space-y-2">
              {actions.map(a => {
                const tone = FOCUS_TONE[focusTone(String(a.priority))]
                return (
                  <li key={a.id}>
                    <Link href={`/regional/tickets/${a.id}`} className={`block rounded-xl border p-2.5 transition hover:bg-[var(--hover)] ${tone.card}`}>
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.cls}`}>{tone.tag}</span>
                        <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{a.nextAction}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-[var(--text-muted)]">{a.storeName} · {focusMetric(a, nowMs)}</span>
                        <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400">{focusCta(a.nextAction)}</span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-[var(--text-faint)]">Nothing urgent — portfolio under control.</p>}
        </SectionCard>

        <SectionCard title="Supplier Performance" icon={<Truck size={15} className="text-teal-600 dark:text-teal-400" />} action={<Link href="/regional/suppliers" className="text-xs text-blue-500 hover:underline">View all</Link>}>
          {data.suppliers.slice(0, 5).map(s => (
            <Link key={s.id} href={`/regional/suppliers?supplier=${s.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{s.name}</p>
                <Stars value={s.avgRating} count={s.ratingCount} />
              </div>
              <span className={`text-sm font-semibold shrink-0 ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span>
            </Link>
          ))}
          {!data.suppliers.length && <p className="text-sm text-[var(--text-faint)]">No suppliers active in your region yet.</p>}
        </SectionCard>

        <QuotePipelineCard accepted={data.quoteTotals.accepted} pending={data.quoteTotals.pending} voPending={data.quoteTotals.voPending} awaitingCount={awaitingApproval} />
      </div>
    </div>
  )
}

/** Commercial snapshot: total quote value in workflow, split into accepted /
 *  awaiting approval / variation orders, a composition bar, and a one-line
 *  "% approved · items awaiting action" footer. Read-only summary metric. */
function QuotePipelineCard({ accepted, pending, voPending, awaitingCount }: { accepted: number; pending: number; voPending: number; awaitingCount: number }) {
  const total = accepted + pending + voPending
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return (
    <Card className="p-4 flex flex-col min-w-0 h-full">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]"><Banknote size={13} /> Quote Pipeline</div>
      <div className="mt-1.5">
        <div className="text-2xl font-bold leading-tight text-[var(--text)] tabular-nums">{formatCurrency(total)}</div>
        <div className="text-[11px] text-[var(--text-faint)]">Total value in workflow</div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Accepted</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(accepted)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-600 dark:text-amber-500">Awaiting approval</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(pending)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-purple-600 dark:text-purple-400">Variation orders</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(voPending)}</span>
        </div>
      </div>
      {/* Slim composition bar: accepted (green) · awaiting (amber) · VO (purple). */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--hover)]">
        {accepted > 0 && <div className="h-full bg-emerald-500" style={{ width: `${pct(accepted)}%` }} />}
        {pending > 0 && <div className="h-full bg-amber-500" style={{ width: `${pct(pending)}%` }} />}
        {voPending > 0 && <div className="h-full bg-purple-500" style={{ width: `${pct(voPending)}%` }} />}
      </div>
      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        {pct(accepted)}% approved · {awaitingCount} item{awaitingCount === 1 ? '' : 's'} awaiting action
      </div>
    </Card>
  )
}

// ── Recommended Focus Today — top 3 next actions ─────────────────────────────
// Urgency tag + tint derived from the ticket priority (classic + engine forms).
const FOCUS_TONE = {
  critical: { tag: 'Critical', cls: 'bg-red-500/15 text-red-700 dark:text-red-400',       card: 'border-red-500/40 bg-red-500/[0.04]' },
  high:     { tag: 'High',     cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',  card: 'border-[var(--border)]' },
  medium:   { tag: 'Medium',   cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',     card: 'border-[var(--border)]' },
  low:      { tag: 'Low',      cls: 'bg-[var(--hover)] text-[var(--text-muted)]',          card: 'border-[var(--border)]' },
} as const
type FocusTone = keyof typeof FOCUS_TONE
function focusTone(priority: string): FocusTone {
  if (['P1', 'urgent'].includes(priority)) return 'critical'
  if (['P2', 'high'].includes(priority)) return 'high'
  if (['P3', 'medium'].includes(priority)) return 'medium'
  return 'low'
}
const FOCUS_RANK: Record<FocusTone, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// Contextual CTA verb inferred from the next-action wording.
function focusCta(nextAction: string): string {
  const s = nextAction.toLowerCase()
  if (/assign/.test(s)) return 'Assign →'
  if (/sign.?off/.test(s)) return 'Sign off →'
  if (/approv|quote|variation|review/.test(s)) return 'Review →'
  if (/escalat/.test(s)) return 'Escalate →'
  if (/resolve|dispute|snag/.test(s)) return 'Resolve →'
  return 'View ticket →'
}

// Time-remaining readout (falls back to the SLA label / age when no deadline).
function focusMetric(a: RegionalTicketAction, nowMs: number): string {
  if (a.nextActionDueAt) {
    const diff = +new Date(a.nextActionDueAt) - nowMs
    return diff >= 0 ? `${humanizeDuration(diff)} remaining` : `overdue by ${humanizeDuration(-diff)}`
  }
  return a.slaLabel || `${a.ageDays}d open`
}

// Top 3 actions for today — most urgent first, then soonest deadline.
function topFocusActions(data: RegionalDashboardData): RegionalTicketAction[] {
  return [...data.ticketActions]
    .sort((a, b) => {
      const r = FOCUS_RANK[focusTone(String(a.priority))] - FOCUS_RANK[focusTone(String(b.priority))]
      if (r) return r
      const da = a.nextActionDueAt ? +new Date(a.nextActionDueAt) : Infinity
      const db = b.nextActionDueAt ? +new Date(b.nextActionDueAt) : Infinity
      return da - db
    })
    .slice(0, 3)
}
