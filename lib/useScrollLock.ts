'use client'

import { useEffect } from 'react'

// Mobile-safe page scroll lock for pop-ups. Plain `body { overflow: hidden }`
// does NOT stop touch-scroll of the document on iOS Safari (and is flaky in some
// Android WebViews), so we use the position:fixed technique: pin <body> and keep
// the visual scroll position via a negative top offset, restoring it on release.
// Ref-counted at module scope so stacked pop-ups (a menu inside a modal, a
// confirm over a form) don't fight over the saved state.

let lockCount = 0
let savedScrollY = 0
let saved: {
  bodyOverflow: string; bodyPosition: string; bodyTop: string
  bodyWidth: string; docOverflow: string; overscroll: string
} | null = null

function apply() {
  const doc = document.documentElement
  const body = document.body
  savedScrollY = window.scrollY
  saved = {
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
    docOverflow: doc.style.overflow,
    overscroll: body.style.overscrollBehavior,
  }
  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  doc.style.overflow = 'hidden'
  body.style.overscrollBehavior = 'none'
}

function release() {
  if (!saved) return
  const doc = document.documentElement
  const body = document.body
  body.style.overflow = saved.bodyOverflow
  body.style.position = saved.bodyPosition
  body.style.top = saved.bodyTop
  body.style.width = saved.bodyWidth
  doc.style.overflow = saved.docOverflow
  body.style.overscrollBehavior = saved.overscroll
  saved = null
  window.scrollTo(0, savedScrollY)
}

/**
 * Lock page scroll while `active` (default true). Use in every pop-up/overlay so
 * the background never scrolls behind it. Safe to nest — the lock is released
 * only when the last active holder unmounts.
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    lockCount++
    if (lockCount === 1) apply()
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) release()
    }
  }, [active])
}
