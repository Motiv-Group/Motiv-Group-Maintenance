'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { BellOff, Search, X } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { MarkAllReadButton } from '@/components/ui/MarkAllReadButton'
import type { Notification } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  new_ticket:       'New Ticket',
  new_quote:        'New Quote',
  quote_accepted:   'Quote Accepted',
  quote_declined:   'Quote Declined',
  sign_off_request: 'Sign-off Request',
  sign_off_approved:'Sign-off Approved',
  sign_off_rejected:'Sign-off Rejected',
}

type Filter = 'all' | 'unread' | 'read'

export default function RegionalNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [filter,        setFilter]        = useState<Filter>('all')
  const [typeFilter,    setTypeFilter]    = useState<string>('all')

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => { setNotifications(d.notifications ?? []); setLoading(false) })
  }, [])

  const types = useMemo(() => {
    const seen = new Set(notifications.map(n => n.type))
    return ['all', ...Array.from(seen)]
  }, [notifications])

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filter === 'unread' && n.read)  return false
      if (filter === 'read'   && !n.read) return false
      if (typeFilter !== 'all' && n.type !== typeFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!n.title.toLowerCase().includes(q) && !n.message.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [notifications, filter, typeFilter, search])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          {unreadCount > 0 && <p className="text-xs text-gray-400 mt-0.5">{unreadCount} unread</p>}
        </div>
        <MarkAllReadButton />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search notifications…"
          className="w-full pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-slate-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Read/Unread filter */}
      <div className="flex gap-2">
        {(['all', 'unread', 'read'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${filter === f
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Type filter */}
      {types.length > 2 && (
        <div className="flex gap-2 flex-wrap">
          {types.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${typeFilter === t
                ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
                : 'bg-slate-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
              {t === 'all' ? 'All types' : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center">
          <BellOff className="mx-auto text-gray-300 mb-2" size={32} />
          <p className="text-sm text-gray-400">
            {notifications.length === 0 ? 'No notifications yet.' : 'No notifications match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div key={n.id} className={`border rounded-xl px-4 py-3 ${!n.read
              ? 'border-brand-200 bg-brand-50/30 dark:border-brand-700 dark:bg-brand-900/10'
              : 'bg-slate-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
              {n.link ? (
                <Link href={n.link} className="block">
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{n.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatDateTime(n.created_at)}</p>
                </Link>
              ) : (
                <>
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{n.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatDateTime(n.created_at)}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
