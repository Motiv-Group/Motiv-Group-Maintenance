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

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 250)
    }

    let channel = supabase.channel(`realtime-refresh-${tablesKey}`)
    for (const table of tablesKey.split(',')) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh
      )
    }
    channel.subscribe()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [router, tablesKey])

  return null
}
