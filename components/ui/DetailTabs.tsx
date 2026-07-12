'use client'

import { useState, type ReactNode } from 'react'
import { Card } from '@/components/exec/ui'

export type DetailTab = { key: string; label: string; content: ReactNode }

// Generic tabbed card for a ticket-detail lower section (mirrors the RM RmTicketTabs
// look). Tabs whose content is null/false are dropped, so a page can pass every
// possible section and only the ones with content show. Content is server-rendered
// and passed through as ReactNode — no functions cross the boundary.
export function DetailTabs({ tabs, initial }: { tabs: DetailTab[]; initial?: string }) {
  const avail = tabs.filter(t => t.content != null && t.content !== false)
  const [tab, setTab] = useState<string>(initial && avail.some(t => t.key === initial) ? initial : (avail[0]?.key ?? ''))
  if (!avail.length) return null
  const active = avail.find(t => t.key === tab) ?? avail[0]
  return (
    <Card className="p-5">
      <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)]">
        {avail.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={active.key === t.key ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active.key === t.key ? 'border-blue-600 text-[var(--text)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{active.content}</div>
    </Card>
  )
}
