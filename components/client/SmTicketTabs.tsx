'use client'

import { useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { TicketTimeline } from '@/components/ui/TicketTimeline'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import type { TimelineEvent } from '@/lib/ticket-timeline'

type Tab = 'photos' | 'timeline'

function docName(url: string): string {
  try { return decodeURIComponent(url.split('?')[0].split('/').pop() || 'Document') } catch { return 'Document' }
}

// Lower tabbed section of the SM ticket detail — only content a store manager
// may see: attachments (photos + documents) and the Timeline (the shared
// engine's SM-safe subset — see filterTimelineForSm; supplier updates fold
// into it). No internal Documents/Comments/History.
export function SmTicketTabs({
  photoUrls, docUrls, ticketId, timeline,
}: {
  photoUrls: string[]
  docUrls: string[]
  ticketId: string
  timeline: TimelineEvent[]
}) {
  const [tab, setTab] = useState<Tab>(photoUrls.length || docUrls.length ? 'photos' : 'timeline')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'photos', label: `Photos${photoUrls.length ? ` (${photoUrls.length})` : ''}` },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <Card className="p-5">
      <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)]">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? 'border-blue-600 text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'photos' && (
        <div className="space-y-4">
          {photoUrls.length ? <PhotoThumbs urls={photoUrls} ticketId={ticketId} label="Job photo" /> : <p className="text-sm text-[var(--text-faint)]">No photos attached.</p>}
          {docUrls.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Documents</p>
              <ul className="space-y-1">
                {docUrls.map((u, i) => (
                  <li key={i}>
                    <ViewTrackedLink ticketId={ticketId} itemType="attachment" itemLabel={docName(u)} href={u} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 transition hover:bg-[var(--hover)]">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--text)]"><FileText size={14} className="shrink-0 text-blue-500" /> <span className="truncate">{docName(u)}</span></span>
                      <Download size={14} className="shrink-0 text-[var(--text-faint)]" />
                    </ViewTrackedLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && <TicketTimeline items={timeline} />}
    </Card>
  )
}
