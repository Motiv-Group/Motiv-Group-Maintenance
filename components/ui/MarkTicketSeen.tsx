'use client'

// Fire-and-forget beacon: on a real mount (an actual open, not a route prefetch),
// bump this user's "last seen" watermark for the ticket so its supplier updates stop
// counting as NEW on the next visit. Renders nothing.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function MarkTicketSeen({ ticketId, latestUpdateAt }: { ticketId: string; latestUpdateAt?: string | null }) {
  const router = useRouter()
  // Re-runs on mount AND when a newer update arrives live (RealtimeRefresh changes
  // latestUpdateAt), so an update seen mid-session is marked seen too — otherwise it
  // would still read as "new" when the RM re-enters.
  useEffect(() => {
    // refresh() after the watermark lands so server components rendered BEFORE it
    // (the layout's nav badge, the Today queue) drop their "new" markers live —
    // client-side navigation alone never re-renders the layout.
    fetch(`/api/tickets/${ticketId}/seen`, { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router identity is stable; refiring on it would re-post
  }, [ticketId, latestUpdateAt])
  return null
}
