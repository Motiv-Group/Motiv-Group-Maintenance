'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef } from 'react'

interface SwipeNavProps {
  links: { href: string; label: string }[]
  children: React.ReactNode
}

export function SwipeNav({ links, children }: SwipeNavProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const startX   = useRef<number | null>(null)
  const startY   = useRef<number | null>(null)

  function currentIndex() {
    // Match exact or starts-with (for nested routes), prefer longest match
    let best = -1
    let bestLen = 0
    links.forEach((link, i) => {
      if (pathname === link.href || pathname.startsWith(link.href + '/')) {
        if (link.href.length > bestLen) {
          best = i
          bestLen = link.href.length
        }
      }
    })
    return best
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    // Prefetch adjacent routes immediately on touch so they're ready when swipe completes
    const idx = currentIndex()
    if (idx === -1) return
    if (links[idx + 1]) router.prefetch(links[idx + 1].href)
    if (links[idx - 1]) router.prefetch(links[idx - 1].href)
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return

    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current

    // Ignore if more vertical than horizontal (scrolling)
    if (Math.abs(dy) > Math.abs(dx)) return
    // Ignore short swipes
    if (Math.abs(dx) < 60) return

    const idx = currentIndex()
    if (idx === -1) return

    if (dx < 0) {
      // Swipe left → next tab
      const next = links[idx + 1]
      if (next) router.push(next.href)
    } else {
      // Swipe right → previous tab
      const prev = links[idx - 1]
      if (prev) router.push(prev.href)
    }

    startX.current = null
    startY.current = null
  }

  return (
    <div className="flex-1 flex flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  )
}
