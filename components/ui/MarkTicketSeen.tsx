'use client'

// Fire-and-forget beacon: on a real mount (an actual open, not a route prefetch),
// bump this user's "last seen" watermark for the ticket so its supplier updates stop
// counting as NEW on the next visit. Renders nothing.
import { useEffect } from 'react'

export function MarkTicketSeen({ ticketId, latestUpdateAt }: { ticketId: string; latestUpdateAt?: string | null }) {
  // Re-runs on mount AND when a newer update arrives live (RealtimeRefresh changes
  // latestUpdateAt), so an update seen mid-session is marked seen too — otherwise it
  // would still read as "new" when the RM re-enters.
  useEffect(() => {
    fetch(`/api/tickets/${ticketId}/seen`, { method: 'POST' }).catch(() => {})
  }, [ticketId, latestUpdateAt])
  return null
}
