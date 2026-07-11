'use client'

import { useState, type ReactNode } from 'react'
import { Camera } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { formatDateTime } from '@/lib/utils'
import type { TimelineEvent, TimelineTone } from '@/lib/ticket-timeline'

type PhotoGroup = { label: string; urls: string[] }
type Update = { body: string; created_at: string }
type Tab = 'photos' | 'activity' | 'timeline' | 'history'

// Dot colour per event tone — mirrors the app's status palette (matches the old
// AuditTrail dots) so the timeline reads at a glance.
const DOT_TONE: Record<TimelineTone, string> = {
  logged: 'bg-blue-500', info_requested: 'bg-amber-500', info_added: 'bg-teal-500',
  quote_requested: 'bg-cyan-500', quote_submitted: 'bg-violet-500',
  quote_approved: 'bg-emerald-500', quote_declined: 'bg-red-500', scheduled: 'bg-indigo-500',
  completion_submitted: 'bg-[#C6A35D]', completion_approved: 'bg-emerald-500', completion_rejected: 'bg-red-500',
  completed: 'bg-emerald-500', cancelled: 'bg-red-500', edited: 'bg-slate-400', update: 'bg-[#C6A35D]',
  viewed: 'bg-slate-400',
  variation: 'bg-purple-500', variation_approved: 'bg-emerald-500', variation_declined: 'bg-red-500',
}

/** Lower tabbed section of the RM ticket detail — Photos (every image on the
 *  ticket, grouped by source), Activity (supplier updates/progress notes) and
 *  the full Timeline (status changes, edits, attachments/photos viewed, …). */
export function RmTicketTabs({
  ticketId, photoGroups, updates, timeline, history,
}: {
  ticketId: string
  photoGroups: PhotoGroup[]
  updates: Update[]
  timeline: TimelineEvent[]
  history?: ReactNode
}) {
  const totalPhotos = photoGroups.reduce((n, g) => n + g.urls.length, 0)
  const [tab, setTab] = useState<Tab>(totalPhotos ? 'photos' : 'timeline')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'photos', label: `Photos${totalPhotos ? ` (${totalPhotos})` : ''}` },
    { key: 'activity', label: `Activity${updates.length ? ` (${updates.length})` : ''}` },
    { key: 'timeline', label: 'Timeline' },
    ...(history ? [{ key: 'history' as Tab, label: 'History' }] : []),
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

      {tab === 'activity' && (
        updates.length ? (
          <div>
            {updates.map((u, i) => {
              const photo = String(u.body).match(/^📷\s*Progress photo:\s*(\S+)/)
              return (
                <div key={i} className="border-b border-[var(--border)] py-2.5 last:border-0">
                  {photo
                    ? <ViewTrackedLink ticketId={ticketId} itemType="photo" itemLabel="Supplier progress photo" href={photo[1]} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C6A35D] hover:underline"><Camera size={14} /> View progress photo</ViewTrackedLink>
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
          <ol className="relative ml-1.5 space-y-4 border-l border-[var(--border)]">
            {timeline.map((e, i) => (
              <li key={i} className="ml-4">
                <span className={`absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)] ${DOT_TONE[e.tone] ?? 'bg-[#C6A35D]'}`} />
                <p className="text-sm text-[var(--text)]">{e.label}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{e.who ? `${e.who} · ` : ''}{formatDateTime(e.at)}</p>
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
