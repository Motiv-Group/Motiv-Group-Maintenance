'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BellOff, Search, X, Check, CheckCheck, Archive, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { BackButton } from '@/components/ui/BackButton'
import type { Notification } from '@/lib/types'

type Filter = 'all' | 'unread' | 'read'

const TYPE_LABELS: Record<string, string> = {
  new_ticket: 'New ticket', ticket_update: 'Ticket update',
  new_quote: 'New quote', quote: 'Quote', quote_accepted: 'Quote accepted', quote_declined: 'Quote declined',
  sign_off_request: 'Sign-off request', sign_off_approved: 'Job completed',
  invite: 'Invitation', supplier_review: 'Supplier review',
}
const prettyType = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

// Relative "2h ago"; full timestamp kept in the title attribute for precision.
function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

export function NotificationList({ initial }: { initial?: Notification[] } = {}) {
  const [items, setItems] = useState<Notification[]>(initial ?? [])
  const [loading, setLoading] = useState(!initial)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [showArchive, setShowArchive] = useState(false)

  useEffect(() => {
    if (initial) return
    let alive = true
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => { if (alive) { setItems(d.notifications ?? []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [initial])

  // Optimistic; the API is source of truth but we don't want a flash.
  async function setRead(id: string, read: boolean) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read } : n))
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, read }) }).catch(() => {})
  }
  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })))
    await fetch('/api/notifications', { method: 'PATCH' }).catch(() => {})
  }

  const active = useMemo(() => items.filter(n => !n.archived_at), [items])
  const archived = useMemo(() => items.filter(n => !!n.archived_at), [items])

  const types = useMemo(() => ['all', ...Array.from(new Set(active.map(n => n.type)))], [active])
  const unreadCount = active.filter(n => !n.read).length

  const filteredActive = useMemo(() => active.filter(n => {
    if (filter === 'unread' && n.read) return false
    if (filter === 'read' && !n.read) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !n.message.toLowerCase().includes(q)) return false
    }
    return true
  }), [active, filter, typeFilter, search])

  // Archived notifications grouped by ticket, newest ticket-activity first.
  const archiveGroups = useMemo(() => {
    const by = new Map<string, { key: string; jobRef: string | null; items: Notification[] }>()
    for (const n of archived) {
      const key = n.ticket_id ?? `misc:${n.id}`
      if (!by.has(key)) by.set(key, { key, jobRef: n.job_ref ?? null, items: [] })
      by.get(key)!.items.push(n)
    }
    return Array.from(by.values()).sort((a, b) => +new Date(b.items[0].created_at) - +new Date(a.items[0].created_at))
  }, [archived])

  function toggleGroup(key: string) {
    setOpenGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]">Notifications</h1>
            <p className="mt-0.5 text-xs text-[var(--text-faint)]" aria-live="polite">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 transition hover:bg-[var(--hover)] dark:text-blue-400">Mark all read</button>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notifications…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] py-2 pl-9 pr-9 text-sm text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]"><X size={14} /></button>}
      </div>

      <div className="flex gap-2">
        {(['all', 'unread', 'read'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm transition ${filter === f ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Mobile: one swipeable chip row instead of 3-4 wrapped rows; sm+ wraps. */}
      {types.length > 2 && (
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${typeFilter === t ? 'border-[var(--text-muted)] bg-[var(--text-muted)] text-[var(--surface)]' : 'border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text)]'}`}>
              {t === 'all' ? 'All types' : prettyType(t)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-brand-600" /></div>
      ) : filteredActive.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
          <BellOff className="mx-auto mb-2 text-[var(--text-faint)]" size={32} />
          <p className="text-sm text-[var(--text-faint)]">{active.length === 0 ? 'No new notifications.' : 'Nothing matches your filters.'}</p>
        </div>
      ) : (
        <ul className="space-y-2" role="list">
          {filteredActive.map(n => <Row key={n.id} n={n} onToggle={setRead} />)}
        </ul>
      )}

      {archiveGroups.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowArchive(v => !v)} className="flex w-full items-center gap-2 rounded-xl px-1 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]">
            <Archive size={15} /> Archived <span className="text-[var(--text-faint)]">({archiveGroups.length} completed {archiveGroups.length === 1 ? 'ticket' : 'tickets'})</span>
            <ChevronDown size={16} className={`ml-auto transition ${showArchive ? 'rotate-180' : ''}`} />
          </button>
          {showArchive && (
            <div className="mt-2 space-y-2">
              {archiveGroups.map(g => {
                const open = openGroups.has(g.key)
                return (
                  <div key={g.key} className="overflow-hidden rounded-xl border border-[var(--border)]">
                    <button onClick={() => toggleGroup(g.key)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-[var(--hover)]">
                      <span className="font-mono text-xs font-semibold text-[var(--text-muted)]">{g.jobRef ?? 'Ticket'}</span>
                      <span className="text-xs text-[var(--text-faint)]">· {g.items.length} update{g.items.length === 1 ? '' : 's'}</span>
                      <span className="ml-auto text-[11px] text-[var(--text-faint)]">{timeAgo(g.items[0].created_at)}</span>
                      <ChevronDown size={15} className={`text-[var(--text-faint)] transition ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <ul className="border-t border-[var(--border)]" role="list">{g.items.map(n => <Row key={n.id} n={n} onToggle={setRead} archived />)}</ul>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ n, onToggle, archived }: { n: Notification; onToggle: (id: string, read: boolean) => void; archived?: boolean }) {
  const unread = !n.read
  const inner = (
    <>
      <p className={`truncate text-sm text-[var(--text)] ${unread ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
      <p className={`mt-0.5 text-sm ${unread ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'}`}>{n.message}</p>
      <p className="mt-1 text-[11px] text-[var(--text-faint)]" title={formatDateTime(n.created_at)}>
        {timeAgo(n.created_at)}{n.job_ref ? <span className="font-mono"> · {n.job_ref}</span> : ''}
      </p>
    </>
  )
  return (
    <li className={`relative rounded-xl border ${archived ? 'border-transparent' : unread ? 'border-blue-500/40 bg-blue-500/[0.06]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      {/* Left accent bar makes unread unmistakable at a glance. */}
      {!archived && unread && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-blue-500" />}
      {n.link ? (
        <Link href={n.link} onClick={() => { if (unread) onToggle(n.id, true) }} className="block py-3 pl-4 pr-12">{inner}</Link>
      ) : (
        <div className="py-3 pl-4 pr-12">{inner}</div>
      )}
      {/* Read receipt: double blue tick = read, single grey tick = unread. Tap to toggle. */}
      <button
        type="button"
        onClick={() => onToggle(n.id, unread)}
        title={unread ? 'Mark as read' : 'Mark as unread'}
        aria-label={unread ? 'Mark as read' : 'Mark as unread'}
        className="absolute right-2 top-2.5 grid h-7 w-9 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
      >
        {unread ? <Check size={16} className="text-[var(--text-faint)]" /> : <CheckCheck size={18} className="text-blue-500" />}
      </button>
    </li>
  )
}
