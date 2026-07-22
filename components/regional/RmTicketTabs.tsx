'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import type { TimelineEvent } from '@/lib/ticket-timeline'
import { ticketPhotoLabel, completionPhotoLabel, progressPhotoLabel } from '@/lib/attachment-labels'

type PhotoGroup = { label: string; urls: string[]; kind?: 'logged' | 'before' | 'after' | 'progress'; supplierName?: string | null; submissionNo?: number | null }

// Specific per-photo audit label for a group ("ABC Plumbing — Before photo 1
// (Submission #2)"), so the timeline "Viewed …" row is never vague.
function photoTrackLabel(g: PhotoGroup): (i: number) => string {
  return (i: number) => {
    if (g.kind === 'logged') return ticketPhotoLabel(i + 1)
    if (g.kind === 'before' || g.kind === 'after') return completionPhotoLabel(g.kind, i + 1, g.supplierName, g.submissionNo)
    if (g.kind === 'progress') return progressPhotoLabel(i + 1, g.supplierName)
    return `${g.label} ${i + 1}`
  }
}
type Tab = 'photos' | 'documents' | 'quotes' | 'completion' | 'variations' | 'dispute' | 'timeline' | 'history'

/** Lower tabbed section of the RM ticket detail — Photos (every image on the
 *  ticket, grouped by source), Documents (COC/invoice/quote/VO attachments),
 *  Quotes (the approved quote + any under review), Completion (the approved COC
 *  & POC), Variation orders (once any exist) and the full Timeline (supplier
 *  updates fold into it). */
export function RmTicketTabs({
  ticketId, photoGroups, timeline, history, documents, quotes, completion, variations, dispute, defaultTab,
}: {
  ticketId: string
  photoGroups: PhotoGroup[]
  timeline: TimelineEvent[]
  history?: ReactNode
  documents?: ReactNode
  quotes?: ReactNode
  completion?: ReactNode
  variations?: ReactNode
  dispute?: ReactNode
  /** Tab selected on first render (e.g. 'completion' when a COC/POC is under review). */
  defaultTab?: Tab
}) {
  const totalPhotos = photoGroups.reduce((n, g) => n + g.urls.length, 0)
  const [tab, setTab] = useState<Tab>(defaultTab ?? (totalPhotos ? 'photos' : 'timeline'))
  const tabs: { key: Tab; label: string }[] = [
    { key: 'photos', label: `Photos${totalPhotos ? ` (${totalPhotos})` : ''}` },
    { key: 'documents', label: 'Documents' },
    { key: 'quotes', label: 'Quotes' },
    { key: 'completion', label: 'Completion' },
    ...(variations ? [{ key: 'variations' as Tab, label: 'Variation orders' }] : []),
    ...(dispute ? [{ key: 'dispute' as Tab, label: 'Dispute' }] : []),
    { key: 'timeline', label: 'Timeline' },
    { key: 'history', label: 'History' },
  ]

  // Swipe the content area left/right to move between tabs (mobile). The active
  // tab is kept scrolled into view in the strip so it never hides off-edge.
  const stripRef = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const idx = tabs.findIndex(t => t.key === tab)
  const go = (delta: number) => { const next = tabs[idx + delta]; if (next) setTab(next.key) }
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y
    touch.current = null
    // Horizontal intent only (don't hijack vertical scroll).
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }
  useEffect(() => {
    const el = stripRef.current?.querySelector('[aria-current="page"]') as HTMLElement | null
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  return (
    <Card className="p-4 sm:p-5">
      {/* Tab strip scrolls sideways (contained, controls not content). Full-bleed to
          the card edges (-mx-5) so the last tab swipes clear of the p-5 padding;
          scroll-snap + no-scrollbar keep it clean (a scrollbar would draw a line
          across the tabs and the block below). */}
      <div ref={stripRef} className="no-scrollbar -mx-5 mb-4 flex snap-x gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)] px-5 [-webkit-overflow-scrolling:touch]">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px shrink-0 snap-start border-b-2 px-3 py-2 text-[13px] font-semibold transition sm:px-4 sm:text-sm ${
              tab === t.key ? 'border-blue-600 text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Swipe left/right anywhere in the panel to move to the next/prev tab. */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
      {tab === 'photos' && (
        totalPhotos ? (
          <div className="space-y-4">
            {photoGroups.map((g, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{g.label}</p>
                <PhotoThumbs urls={g.urls} ticketId={ticketId} label={g.label} trackLabel={photoTrackLabel(g)} />
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-[var(--text-faint)]">No photos attached.</p>
      )}

      {tab === 'documents' && (
        documents ?? <p className="text-sm text-[var(--text-faint)]">No documents attached yet.</p>
      )}

      {tab === 'quotes' && (
        quotes ?? <p className="text-sm text-[var(--text-faint)]">No quotes yet.</p>
      )}

      {tab === 'completion' && (
        completion ?? <p className="text-sm text-[var(--text-faint)]">Not completed yet.</p>
      )}

      {tab === 'variations' && (
        variations ?? <p className="text-sm text-[var(--text-faint)]">No variation orders.</p>
      )}

      {tab === 'dispute' && (
        dispute ?? <p className="text-sm text-[var(--text-faint)]">No dispute on this ticket.</p>
      )}

      {tab === 'timeline' && <TicketTimeline items={timeline} />}

      {tab === 'history' && (
        history ?? <p className="text-sm text-[var(--text-faint)]">Nothing archived yet.</p>
      )}
      </div>
    </Card>
  )
}
