'use client'

import Link from 'next/link'
import { Bell, Settings, LogOut, FileBarChart } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type NavRole = 'client' | 'supplier' | 'regional'

const BASE: Record<NavRole, string> = {
  supplier: '/supplier',
  regional: '/regional',
  client:   '/client',
}

export function Navbar({ role }: { role: NavRole }) {
  const [unread, setUnread] = useState(0)

  async function handleLogout() {
    const supabase = createClient()
    try { await supabase.auth.signOut() } catch {}
    // Hard navigation — bypasses any pending App Router transition (e.g. a
    // realtime-triggered refresh after a write) that could otherwise swallow a
    // client-side router.push and make logout appear unresponsive.
    window.location.assign('/auth/login')
  }

  useEffect(() => {
    const supabase = createClient()

    // HEAD count query — no rows transferred, much cheaper than fetching
    // the notification list just to count unread ones.
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
      if (!error) setUnread(count ?? 0)
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => clearInterval(interval)
  }, [])

  const base = BASE[role]

  // Always dark navy — same in light and dark mode
  const iconBtn =
    'p-2 rounded-lg transition-colors ' +
    'text-gray-300 hover:text-white hover:bg-white/10'

  return (
    <nav className="bg-brand-600 border-b border-brand-700 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href={base} className="shrink-0">
          <MotivLogo height={40} />
        </Link>

        <div className="flex items-center gap-0.5 shrink-0">
          {role !== 'client' && (
            <Link href={`${base}/reports`} className={iconBtn} title="Reports">
              <FileBarChart size={19} />
            </Link>
          )}
          <Link href={`${base}/notifications`} className={`relative ${iconBtn}`}>
            <Bell size={20} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          <Link href="/settings" className={iconBtn} title="Settings">
            <Settings size={18} />
          </Link>

          <button onClick={handleLogout} className={iconBtn} title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  )
}
