'use client'

// Shared right-hand slide-over panel. Matches the RM Suppliers pane look (384px,
// /50 backdrop, surface-2, p-5) and slides in/out smoothly like the Stores-tab
// Drawer. The render-prop hands children a `close` that animates out before the
// parent unmounts (the parent's onClose fires after the transition).
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function SlideOver({ onClose, children }: { onClose: () => void; children: (close: () => void) => ReactNode }) {
  const [shown, setShown] = useState(false)
  const closing = useRef(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function close() {
    if (closing.current) return
    closing.current = true
    setShown(false)
    setTimeout(onClose, 250)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
        aria-hidden
      />
      <aside
        className={`absolute right-0 top-0 bottom-0 w-full max-w-sm bg-[var(--surface-2)] ring-1 ring-[var(--border)] overflow-y-auto p-5 space-y-4 transition-transform duration-300 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        {children(close)}
      </aside>
    </div>
  )
}
