'use client'

// Local titled bottom-sheet modal shared by the rm-actions files. The shared
// components/ui/Modal has a different API (render-prop children, no title bar),
// so this titled variant lives here as the single copy for this domain.
import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useScrollLock } from '@/lib/useScrollLock'

export function Modal({ title, onClose, children, maxWidth = 'max-w-md' }: { title: ReactNode; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  useScrollLock() // lock the background so it can't scroll behind the pop-up
  return (
    // Bottom-sheet on phones (mirrors components/ui/Modal), centered from sm up.
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`bg-[var(--surface-2)] ring-1 ring-[var(--border)] rounded-t-2xl p-4 sm:rounded-2xl sm:p-5 ${maxWidth} w-full space-y-3 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-base font-bold text-[var(--text)]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 -m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
