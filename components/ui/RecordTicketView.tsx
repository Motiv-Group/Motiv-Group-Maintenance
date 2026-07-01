'use client'

// Fire-and-forget: records (once per mount) that the current user opened this
// ticket's listed items, so the audit trail can show "X viewed the quote/photos/COC".
// Renders nothing. Repeat views are de-duped server-side.
import { useEffect, useRef } from 'react'

export function RecordTicketView({ ticketId, items }: { ticketId: string; items: string[] }) {
  const done = useRef(false)
  const key = items.join(',')
  useEffect(() => {
    if (done.current || !key) return
    done.current = true
    fetch(`/api/tickets/${ticketId}/view`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: key.split(',') }),
    }).catch(() => {})
  }, [ticketId, key])
  return null
}
