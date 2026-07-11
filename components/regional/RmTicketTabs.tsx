'use client'

import { useState, type ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime } from '@/lib/utils'
import type { TimelineEvent } from '@/lib/ticket-timeline'

type PhotoGroup = { label: string; urls: string[] }
type Update = { body: string; created_at: string }
type Tab = 'photos' | 'documents' | 'quotes' | 'activity' | 'timeline' | 'history'

/** Lower tabbed section of the RM ticket detail — Photos (every image on the
 *  ticket, grouped by source), Documents (COC/invoice/quote/VO attachments),
 *  Quotes (the approved quote + any under review), Activity (supplier updates)
 *  and the full Timeline (status changes, edits, attachments viewed, …). */
export function RmTicketTabs({
  ticketId, photoGroups, updates, timeline, history, documents, quotes,
}: {
  ticketId: string
  photoGroups: PhotoGroup[]
  updates: Update[]
  timeline: TimelineEvent[]
  history?: ReactNode
  documents?: ReactNode
  quotes?: ReactNode
}) {
  const totalPhotos = photoGroups.reduce((n, g) => n + g.urls.length, 0)
  const [tab, setTab] = useState<Tab>(totalPhotos ? 'photos' : 'timeline')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'photos', label: `Photos${totalPhotos ? ` (${totalPhotos})` : ''}` },
    { key: 'documents', label: 'Documents' },
    { key: 'quotes', label: 'Quotes' },
    { key: 'activity', label: `Activity${updates.length ? ` (${updates.length})` : ''}` },
    { key: 'timeline', label: 'Timeline' },
    { key: 'history', label: 'History' },
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

      {tab === 'timeline' && (
        timeline.length ? (
          // Same look & feel as the store-manager Timeline (dot + connecting line),
          // but the RM also sees who acted — who viewed a photo/attachment, edits, etc.
          <ol className="space-y-4">
            {timeline.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${i === timeline.length - 1 ? 'bg-blue-500' : 'bg-[var(--text-faint)]'}`} />
                  {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--border)]" />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium text-[var(--text)]">{e.label}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{e.who ? `${e.who} · ` : ''}{formatDateTime(e.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-[var(--text-faint)]">No history yet.</p>
      )}

      {tab === 'history' && (
        history ?? <p className="text-sm text-[var(--text-faint)]">Nothing archived yet.</p>
      )}
    </Card>
  )
}
