import { CheckCircle2, ChevronDown, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompletionBody } from '@/components/workflow/CompletionBody'
import { formatDateTime } from '@/lib/utils'

// One COC/POC submission card — the single shared implementation behind the RM and
// supplier ticket detail pages. Reused across the under-review, sent-back (snag),
// evidence-requested and approved blocks so both sides see the full submission
// history; a sent-back card carries the reason it was returned.
//
// The small per-page differences are plain props (no role branching):
// - `tone` — explicit on the RM page; defaults from `s.status` on the supplier page.
// - `icon` — defaults to the RM's per-tone icon; the supplier passes ClipboardCheck.
// - `badgeLabel` — defaults to the RM wording ("Sent back"); the supplier passes
//   "Rejected" for snagged submissions.
// - `snag` — supplier-only enrichment of a rejected submission (description /
//   required correction / severity inside the "why it was sent back" box).
// - `freshEvidence` — RM-only green highlight for a resubmission after an
//   evidence request.
// - `chevron` — the supplier's collapsible variant shows a rotating chevron.
// - `hideTimestampOnMobile` — the RM header drops the timestamp under `sm`.
// Pure presentational (native <details>, no hooks) — safe in Server Components.

export type SignoffTone = 'review' | 'snag' | 'approved' | 'evidence'

const TONE_META: Record<SignoffTone, { badge: string; label: string; Icon: LucideIcon; iconCls: string; title: string }> = {
  approved: { badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'Approved', Icon: CheckCircle2, iconCls: 'text-emerald-500', title: 'Approved completion' },
  snag: { badge: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Sent back', Icon: FileText, iconCls: 'text-red-500', title: 'Snagged completion' },
  evidence: { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'More info requested', Icon: FileText, iconCls: 'text-amber-500', title: 'Sent back for more evidence' },
  review: { badge: 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b]', label: 'Under review', Icon: FileText, iconCls: 'text-[#f59e0b]', title: 'Submitted completion' },
}

// Default tone from the signoff row's DB status (the supplier page relies on this;
// the RM page passes `tone` explicitly, e.g. from the durable signoff_rounds kind).
const toneForStatus = (status: string): SignoffTone =>
  status === 'accepted' ? 'approved' : status === 'rejected' ? 'snag' : status === 'evidence_requested' ? 'evidence' : 'review'

export function SignoffCard({ s, tone, ticketId, collapsible = false, defaultOpen = false, title, reason, snag, freshEvidence = false, icon, badgeLabel, chevron = false, hideTimestampOnMobile = false, footer }: {
  s: any
  tone?: SignoffTone
  ticketId: string
  collapsible?: boolean
  defaultOpen?: boolean
  title?: string
  reason?: string | null
  snag?: { description?: string | null; required_correction?: string | null; severity?: string | null } | null
  freshEvidence?: boolean
  icon?: LucideIcon
  badgeLabel?: string
  chevron?: boolean
  hideTimestampOnMobile?: boolean
  footer?: React.ReactNode
}) {
  const resolvedTone = tone ?? toneForStatus(s.status)
  const meta = TONE_META[resolvedTone]
  const Icon = icon ?? meta.Icon
  // Prefer the durable round reason; fall back to the reason stored on the signoff.
  const reasonText = reason ?? s.reject_reason
  const before = (s.before_urls ?? []) as string[]
  const after = (s.after_urls ?? []) as string[]
  // Header doubles as the click-to-expand summary when collapsible. The RM flavor
  // hides the timestamp on phones (it eats the title's space).
  const header = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] min-w-0"><Icon size={15} className={`${meta.iconCls} shrink-0`} /><span className="truncate">{title ?? meta.title}<span className={hideTimestampOnMobile ? 'hidden sm:inline' : undefined}> · {formatDateTime(s.created_at)}</span></span></span>
      <span className="flex items-center gap-1.5 shrink-0">
        {freshEvidence && <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">New evidence</span>}
        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.badge}`}>{badgeLabel ?? meta.label}</span>
      </span>
    </>
  )
  const body = (
    <>
        {resolvedTone === 'snag' && (reasonText || snag?.description || snag?.required_correction) && (
          // The supplier flavor (which passes `snag`, even as null) spaces the reason
          // lines with space-y-1; the RM flavor renders label + reason flush.
          <div className={`rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-3${snag !== undefined ? ' space-y-1' : ''}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Why it was sent back</p>
            {(reasonText || snag?.description) && <p className="text-sm text-[var(--text)]">{reasonText || snag?.description}</p>}
            {snag?.required_correction && <p className="text-sm text-[var(--text-muted)]"><span className="font-medium text-[var(--text)]">Required correction:</span> {snag.required_correction}</p>}
            {snag?.severity && <p className="text-[11px] text-[var(--text-muted)] capitalize">Severity: {String(snag.severity).replace(/_/g, ' ')}</p>}
          </div>
        )}
        {resolvedTone === 'evidence' && reasonText && (
          <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Why more evidence was requested</p>
            <p className="text-sm text-[var(--text)]">{reasonText}</p>
          </div>
        )}
        {/* Resubmission after a "more evidence" request — the new after photos, COC
            and notes are highlighted in green so the RM can spot what's new. */}
        {freshEvidence && (
          <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">New evidence submitted</p>
            <p className="text-sm text-[var(--text)]">The supplier uploaded the additional evidence you requested — the new after photos, COC and notes are shown in green below.</p>
          </div>
        )}
        <CompletionBody ticketId={ticketId} beforeUrls={before} afterUrls={after} cocUrl={s.coc_url} invoiceUrl={s.invoice_url} notes={s.notes} uploadedAt={s.created_at} />
    </>
  )
  // Collapsed by default — tap the header row to reveal the proof-of-completion,
  // COC and notes.
  if (collapsible) {
    return (
      <details open={defaultOpen} className={`${chevron ? 'group ' : ''}rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden`}>
        {chevron ? (
          <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">{header}</span>
            <ChevronDown size={16} className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180" />
          </summary>
        ) : (
          <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-[var(--hover)] transition">{header}</summary>
        )}
        <div className={`p-4 space-y-4 border-t border-[var(--border)]`}>{body}</div>
        {footer && <div className={`border-t border-[var(--border)] px-4 py-3`}>{footer}</div>}
      </details>
    )
  }
  return (
    <div className={`rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)]`}>{header}</div>
      <div className="p-4 space-y-4">{body}</div>
      {footer && <div className={`border-t border-[var(--border)] px-4 py-3`}>{footer}</div>}
    </div>
  )
}
