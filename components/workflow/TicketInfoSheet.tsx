'use client'

// Shared "ticket sheet" building blocks for the detail pop-ups (RM "Ticket &
// quotes" / supplier "Ticket"): a job-ref + badges header, sectioned blocks with
// faint uppercase labels, and a label/value info grid — one visual language for
// both roles (spec: the client's reference layout, restyled with our badges,
// fonts and CSS-var colours).
import type { ReactNode } from 'react'

/** Job ref (muted, top-left) + badges (top-right) over the bold title. */
export function SheetHeader({ jobRef, title, badges }: { jobRef?: string | null; title: string; badges?: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-0.5 text-sm text-[var(--text-muted)]">{jobRef ?? ''}</p>
        {badges && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{badges}</div>}
      </div>
      <h3 className="break-words text-2xl font-bold leading-snug text-[var(--text)]">{title}</h3>
    </div>
  )
}

/** A titled section — top divider, faint uppercase label, content below. */
export function SheetSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      {children}
    </div>
  )
}

/** Label/value rows for the TICKET INFORMATION section ("—" for empty values). */
export function InfoRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label} className="grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[11rem_1fr]">
          <p className="text-sm text-[var(--text-muted)]">{r.label}</p>
          <div className="min-w-0 break-words text-sm font-medium text-[var(--text)]">{r.value ?? '—'}</div>
        </div>
      ))}
    </div>
  )
}

/** Bottom action row — the primary button sits bottom-right (reference layout). */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end border-t border-[var(--border)] pt-4">{children}</div>
}
