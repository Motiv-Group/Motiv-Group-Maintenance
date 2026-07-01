'use client'

// An attachment link that records (fire-and-forget) the first time this user opens
// this specific item, so the audit trail can show "viewed Photo 2 / COC / …". The
// link still opens normally in a new tab.
export function ViewTrackedLink({ ticketId, itemType, itemLabel, href, className, children }: {
  ticketId: string; itemType: 'photo' | 'quote' | 'coc' | 'invoice'; itemLabel: string
  href: string; className?: string; children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        fetch(`/api/tickets/${ticketId}/view`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemType, itemLabel }),
        }).catch(() => {})
      }}
    >
      {children}
    </a>
  )
}
