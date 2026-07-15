'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime } from '@/lib/utils'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import type { TimelineEvent } from '@/lib/ticket-timeline'

type PhotoGroup = { label: string; urls: string[] }
type Update = { body: string; created_at: string }
type Tab = 'photos' | 'documents' | 'quotes' | 'completion' | 'dispute' | 'activity' | 'timeline' | 'history'

/** Lower tabbed section of the RM ticket detail — Photos (every image on the
 *  ticket, grouped by source), Documents (COC/invoice/quote/VO attachments),
 *  Quotes (the approved quote + any under review), Completion (the approved COC
 *  & POC), Activity (supplier updates) and the full Timeline. */
export function RmTicketTabs({
  ticketId, photoGroups, updates, timeline, history, documents, quotes, completion, dispute, defaultTab,
}: {
  ticketId: string
  photoGroups: PhotoGroup[]
  updates: Update[]
  timeline: TimelineEvent[]
  history?: ReactNode
  documents?: ReactNode
  quotes?: ReactNode
  completion?: ReactNode
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
    ...(dispute ? [{ key: 'dispute' as Tab, label: 'Dispute' }] : []),
    { key: 'activity', label: `Activity${updates.length ? ` (${updates.length})` : ''}` },
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
                <PhotoThumbs urls={g.urls} ticketId={ticketId} label={g.label} />
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

      {tab === 'dispute' && (
        dispute ?? <p className="text-sm text-[var(--text-faint)]">No dispute on this ticket.</p>
      )}

      {tab === 'activity' && (
        updates.length ? (
          <div>
            {updates.map((u, i) => {
              const photo = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/)
              return (
                <div key={i} className="border-b border-[var(--border)] py-2.5 last:border-0">
                  {photo
                    ? <ViewTrackedLink ticketId={ticketId} itemType="photo" itemLabel="Supplier progress photo" href={photo[1]} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"><Camera size={14} /> View progress photo</ViewTrackedLink>
                    : <p className="text-sm text-[var(--text)] whitespace-pre-line">{u.body}</p>}
                  <p className="text-[11px] text-[var(--text-faint)]">Supplier · {formatDateTime(u.created_at)}</p>
                </div>
              )
            })}
          </div>
        ) : <p className="text-sm text-[var(--text-faint)]">No updates from the supplier yet.</p>
      )}

      {tab === 'timeline' && <TicketTimeline items={timeline} />}

      {tab === 'history' && (
        history ?? <p className="text-sm text-[var(--text-faint)]">Nothing archived yet.</p>
      )}
      </div>
    </Card>
  )
}
