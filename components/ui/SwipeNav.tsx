'use client'

interface SwipeNavProps {
  // Kept for a stable call-site API in ExecChrome even though swipe-nav is off.
  links: { href: string; label: string }[]
  children: React.ReactNode
}

// Swipe-to-change-tab is intentionally disabled: horizontal swipes no longer move
// between a section's tabs on mobile (it competed with in-page horizontal scroll
// and felt accidental). This is now a thin layout wrapper so ExecChrome's markup
// and flex sizing stay exactly as before.
export function SwipeNav({ children }: SwipeNavProps) {
  return <div className="flex-1 flex flex-col">{children}</div>
}
