'use client'

import { useState, type ReactNode } from 'react'

// Two-tab switcher for the admin Suppliers page: Directory (all suppliers across
// companies + the Motiv pool) and Review (self-signup verification queue). Both
// panels are server-rendered and passed in as nodes so server-only work (signed
// URLs in Review) stays on the server.
export function SupplierTabs({ directory, review, pendingCount, defaultTab = 'directory' }: {
  directory: ReactNode
  review: ReactNode
  pendingCount: number
  defaultTab?: 'directory' | 'review'
}) {
  const [tab, setTab] = useState<'directory' | 'review'>(defaultTab)
  const tabCls = (active: boolean) =>
    `px-3 py-2 rounded-xl text-sm font-semibold transition ${active ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'}`
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-1 w-fit">
        <button type="button" onClick={() => setTab('directory')} className={tabCls(tab === 'directory')} aria-current={tab === 'directory' ? 'page' : undefined}>Directory</button>
        <button type="button" onClick={() => setTab('review')} className={`${tabCls(tab === 'review')} inline-flex items-center gap-1.5`} aria-current={tab === 'review' ? 'page' : undefined}>
          Review{pendingCount > 0 && <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-bold leading-none">{pendingCount}</span>}
        </button>
      </div>
      <div className={tab === 'directory' ? '' : 'hidden'}>{directory}</div>
      <div className={tab === 'review' ? '' : 'hidden'}>{review}</div>
    </div>
  )
}
