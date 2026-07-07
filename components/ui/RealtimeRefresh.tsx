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
    let cancelled = false

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 250)
    }

    const subscribe = () => {
      if (cancelled) return
      let ch = supabase.channel(`realtime-refresh-${tablesKey}`)
      for (const table of tablesKey.split(',')) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
      }
      // TEMP diagnostic (remove before merge): reports the channel join result —
      // SUBSCRIBED (ok) / CHANNEL_ERROR / TIMED_OUT / CLOSED — to pin the WS failure.
      ch.subscribe((status, err) => console.warn('[MOTIV-RT]', status, err?.message ?? ''))
      channel = ch
    }

    // Authenticate the Realtime connection with the user's JWT BEFORE subscribing.
    // Without this, Realtime connects as `anon`, so RLS on the subscribed tables
    // hides every row from the socket and NO change events are delivered (the app
    // then only appears to update on a manual refresh).
    //
    // supabase-js 2.110's realtime `setAuth` is ASYNC (returns a Promise) — it was
    // synchronous pre-2.110. It MUST be awaited before subscribe(), otherwise the
    // socket connects before the token is applied and loops on failed reconnects.
    // The `cancelled` guard stops a late-resolving auth flow from subscribing after
    // the effect has already been torn down (fast navigation / StrictMode remount).
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      subscribe()
    })()

    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [router, tablesKey])

  return null
}
