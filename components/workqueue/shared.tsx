'use client'

// Shared internals for the role-specific Priority Work Queues
// (components/regional/RegionalPriorityWorkQueue.tsx and
// components/supplier/SupplierPriorityWorkQueue.tsx). Both queues share the
// same look — filtering KPI cards, an urgency-sorted queue card, and per-row
// title / badge / next-step cells — while the role-specific pieces (filters,
// status computation, next-step copy, CTAs) stay in each wrapper.
//
// `compact` selects the mobile-dense variant (used by the RM queue): tighter
// base spacing with `sm:` restoring the desktop look. The two variants are
// pixel-identical at sm and up.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, MessageSquare } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CategoryIcon } from '@/components/client/ticketBadges'
import { formatDate, formatDateTime, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

export type Tone = 'red' | 'purple' | 'gold' | 'green' | 'orange' | 'blue'

const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }
const INACTIVE = new Set(['completed', 'cancelled', 'declined'])
export const isActive = (s: string) => !INACTIVE.has(s)

// Queue order: urgency first, then most recent.
export function byUrgencyThenNewest(a: { priority: unknown; createdAt: string }, b: { priority: unknown; createdAt: string }): number {
  return (URGENCY_RANK[String(a.priority)] ?? 9) - (URGENCY_RANK[String(b.priority)] ?? 9)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

// Genuinely critical (P1 / urgent) tickets get a RED action button so they stand out.
export const isCriticalPriority = (p: unknown) => ['P1', 'urgent'].includes(String(p))

// Same outline form-factor + size for every queue CTA, so the queue's CTAs are
// consistent. Sits above the whole-row link (z-20) so its click opens the
// pop-up / navigates on its own.
export function queueCtaClass(critical: boolean): string {
  return `relative z-20 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition lg:w-40 ${critical ? 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300' : 'border-blue-500/60 text-blue-600 hover:bg-blue-500/10 dark:text-blue-300'}`
}

export function priorityBadgeClass(p: string): string {
  if (p === 'urgent' || p === 'P1') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (p === 'high' || p === 'P2') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
  if (p === 'medium' || p === 'P3') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
}

export function MetricButton({ active, icon, label, value, sub, subActive, onClick, compact }: {
  active: boolean; icon: ReactNode; tone?: Tone; label: string; value: number; sub: string; subActive: boolean; onClick: () => void; compact?: boolean
}) {
  const zero = value === 0
  // Icon chip, value, border and the (active) sub-line all share ONE state colour:
  // green when the count is 0 (all clear), amber when there's work outstanding.
  const stateText = zero ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const iconChip = zero ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20'
  const stateBorder = zero ? 'border-2 border-[var(--border)] dark:border-white/10' : 'border-2 border-amber-500/70'

  return (
    <button type="button" onClick={onClick}
      className={`block rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${active ? 'ring-2 ring-blue-500/70' : ''}`}>
      <Card className={`h-full ${compact ? 'p-3 sm:p-4' : 'p-4'} transition hover:-translate-y-0.5 hover:ring-blue-500/30 ${stateBorder} ${active ? 'ring-blue-500/60' : ''}`}>
        <div className={`flex items-center ${compact ? 'gap-2.5 sm:gap-4' : 'gap-4'}`}>
          <span className={`grid ${compact ? 'h-10 w-10 sm:h-12 sm:w-12' : 'h-12 w-12'} shrink-0 place-items-center rounded-full ring-1 ${iconChip}`}>{icon}</span>
          <div className="min-w-0">
            <p className={compact ? 'line-clamp-2 text-[11px] font-semibold text-[var(--text-muted)] sm:line-clamp-none sm:truncate sm:text-xs' : 'truncate text-xs font-semibold text-[var(--text-muted)]'}>{label}</p>
            <p className={`${compact ? 'mt-0.5 text-xl sm:mt-1 sm:text-2xl' : 'mt-1 text-2xl'} font-bold leading-none ${stateText}`}>{value}</p>
            <p className={`${compact ? 'mt-0.5 truncate text-[11px] sm:mt-1 sm:text-xs' : 'mt-1 truncate text-xs'} font-semibold ${subActive ? stateText : 'text-[var(--text-faint)]'}`}>{sub}</p>
          </div>
        </div>
      </Card>
    </button>
  )
}

// The queue card: header, the rows (children) inside the rounded frame, and the
// "View all tickets" link to the role's ticket list.
export function QueueCard({ viewAllHref, compact, children }: { viewAllHref: string; compact?: boolean; children: ReactNode }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex items-start gap-3 border-b border-[var(--border)] ${compact ? 'px-4 py-4 sm:px-5 sm:py-5' : 'px-5 py-5'}`}>
        <span className={`grid ${compact ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-11 w-11'} shrink-0 place-items-center rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-300`}>
          <ClipboardList size={21} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Priority Work Queue</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Sorted by urgency, then most recent</p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {children}
          <div className="border-t border-[var(--border)] px-4 py-4">
            <Link href={viewAllHref} className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400">
              View all tickets <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

// One queue row's frame: the responsive 4-column grid plus the whole-row link
// (except the CTA island, which sits above it at z-20).
export function QueueRowShell({ href, ariaLabel, compact, children }: { href: string; ariaLabel: string; compact?: boolean; children: ReactNode }) {
  return (
    <div className={`relative grid ${compact ? 'gap-3' : 'gap-4'} border-b border-[var(--border)] px-4 ${compact ? 'py-3' : 'py-4'} transition last:border-b-0 hover:bg-[var(--hover)] ${compact ? 'sm:gap-4 sm:py-4 ' : ''}lg:grid-cols-[1fr_200px_1.1fr_160px] lg:items-center`}>
      <Link href={href} aria-label={ariaLabel} className="absolute inset-0 z-10" />
      {children}
    </div>
  )
}

// Column 1: category icon + job ref + title + who/where line.
export function QueueRowTitle({ category, title, priority, jobId, subtitle }: {
  category: string | null; title: string; priority: string; jobId: string | null; subtitle: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CategoryIcon category={category ?? title} priority={priority} />
      <div className="min-w-0">
        {jobId && <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">{jobId}</p>}
        <p className="truncate text-base font-bold text-[var(--text)]">{category || title}</p>
        <p className="truncate text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  )
}

// Column 2: priority + status badges (with the "New message" dispute chip and the
// unread ticket-chat count chip) over a role-specific note line.
export function QueueRowBadges({ priority, statusCls, statusLabel, disputeUnread, chatUnread = 0, note }: {
  priority: string; statusCls: string; statusLabel: string; disputeUnread: boolean; chatUnread?: number; note: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex w-[72px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(priority)}`}>{PRIORITY_LEVEL_LABELS[priority] ?? 'Medium'}</span>
        <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
        {disputeUnread && <span className="relative z-20 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-blue-500/15 px-1.5 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400"><MessageSquare size={10} /> New message</span>}
        {chatUnread > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400"><MessageSquare size={11} /> {chatUnread}</span>}
      </div>
      <p className="mt-1.5 truncate text-sm text-[var(--text-muted)]">{note}</p>
    </div>
  )
}

// Column 3: next step + SLA countdown / breach. `deadlineHiddenOnMobile` hides
// the absolute deadline under sm (it duplicates the countdown) — RM queue only.
export function QueueRowNextStep({ createdAt, nextStep, breached, slaMs, slaDeadline, deadlineHiddenOnMobile }: {
  createdAt: string; nextStep: string; breached: boolean; slaMs: number; slaDeadline: string; deadlineHiddenOnMobile?: boolean
}) {
  return (
    <div className="min-w-0 border-l-0 border-[var(--border)] lg:border-l lg:pl-6">
      <p className="truncate text-xs text-[var(--text-muted)]">Next step · Logged {formatDate(createdAt)}</p>
      <p className="truncate text-sm font-bold text-[var(--text)]">{nextStep}</p>
      {breached ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400"><AlertCircle size={14} /> SLA breached</p>
      ) : (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"><CalendarClock size={14} /> SLA in {humanizeDuration(slaMs)}</p>
          <p className={deadlineHiddenOnMobile ? 'hidden truncate text-xs text-[var(--text-muted)] sm:block' : 'truncate text-xs text-[var(--text-muted)]'}>Next deadline · {formatDateTime(slaDeadline)}</p>
        </>
      )}
    </div>
  )
}

export function EmptyQueue({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><CheckCircle2 size={24} /></div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{copy}</p>
      </div>
    </div>
  )
}
