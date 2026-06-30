'use client'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Click-to-open slide-over panel, on every screen size. Always mounted so it
 *  can animate in/out; content is hidden off-canvas when closed. */
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-[var(--surface-2)] ring-1 ring-[var(--border)] overflow-y-auto transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5">{children}</div>
      </aside>
    </>
  )
}

export function DrawerHeader({ title, onClose, children }: { title: ReactNode; onClose?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">{title}</div>
      <div className="flex items-center gap-2">
        {children}
        {onClose && <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)]"><X size={18} /></button>}
      </div>
    </div>
  )
}

export function PrimaryButton({ children, tone = 'danger', onClick }: { children: ReactNode; tone?: 'danger' | 'gold'; onClick?: () => void }) {
  const cls = tone === 'gold'
    ? 'bg-[#C6A35D] text-[#0a0e17] hover:brightness-95'
    : 'bg-red-600 text-white hover:bg-red-500'
  return <button onClick={onClick} className={`w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition ${cls}`}>{children}</button>
}
