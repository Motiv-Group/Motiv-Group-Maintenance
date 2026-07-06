'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  tables?: string[]
}

// Subscribes to Supabase Realtime on the given tables and calls router.refresh()
// whenever any INSERT / UPDATE / DELETE happens. Add to any layout.
// Uses a single multiplexed channel and debounces refreshes so a burst of
// changes (e.g. a ticket insert + its notifications) triggers one re-render.
export function RealtimeRefresh({ tables = ['tickets', 'quotes', 'notifications'] }: Props) {
  const router = useRouter()
  const tablesKey = tables.join(',')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 250)
    }

    const subscribe = () => {
      let ch = supabase.channel(`realtime-refresh-${tablesKey}`)
      for (const table of tablesKey.split(',')) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
      }
      ch.subscribe()
      channel = ch
    }

    // Authenticate the Realtime connection with the user's JWT BEFORE subscribing.
    // Without this, Realtime connects as `anon`, so RLS on the subscribed tables
    // hides every row from the socket and NO change events are delivered (the app
    // then only appears to update on a manual refresh). Re-set the token on refresh.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
      subscribe()
    })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      if (timer.current) clearTimeout(timer.current)
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [router, tablesKey])

  return null
}
