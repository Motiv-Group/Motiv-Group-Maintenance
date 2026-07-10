'use client'

import { useState } from 'react'
import { Card } from '@/components/exec/ui'
import { PhotoThumbs } from '@/components/ui/PhotoThumbs'
import { formatDateTime } from '@/lib/utils'

type Update = { body: string; created_at: string }

// Lower tabbed section of the SM ticket detail — only the content a store
// manager is allowed to see: the ticket photos and the plain activity log.
// (No Documents / Comments / History — those are internal to other roles.)
export function SmTicketTabs({ photoUrls, ticketId, updates }: { photoUrls: string[]; ticketId: string; updates: Update[] }) {
  const [tab, setTab] = useState<'photos' | 'activity'>(photoUrls.length ? 'photos' : 'activity')
  const tabs: { key: 'photos' | 'activity'; label: string }[] = [
    { key: 'photos', label: `Photos${photoUrls.length ? ` (${photoUrls.length})` : ''}` },
    { key: 'activity', label: `Activity${updates.length ? ` (${updates.length})` : ''}` },
  ]

  return (
    <Card className="p-5">
      <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? 'border-blue-600 text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'photos' ? (
        photoUrls.length ? (
          <PhotoThumbs urls={photoUrls} ticketId={ticketId} />
        ) : (
          <p className="text-sm text-[var(--text-faint)]">No photos attached.</p>
        )
      ) : (
        updates.length ? (
          <div>
            {updates.map((u, i) => (
              <div key={i} className="border-b border-[var(--border)] py-2.5 last:border-0">
                <p className="text-sm text-[var(--text)]">{u.body}</p>
                <p className="text-[11px] text-[var(--text-faint)]">{formatDateTime(u.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">No updates yet.</p>
        )
      )}
    </Card>
  )
}
