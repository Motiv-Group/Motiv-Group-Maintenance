'use client'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Overlay drawer for < xl screens. On xl+ use a persistent right column instead. */
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="xl:hidden">
      <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[380px] bg-[#0e1422] ring-1 ring-white/10 overflow-y-auto">
        <div className="p-5">{children}</div>
      </aside>
    </div>
  )
}

export function DrawerHeader({ title, onClose, children }: { title: ReactNode; onClose?: () => void; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">{title}</div>
      <div className="flex items-center gap-2">
        {children}
        {onClose && <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>}
      </div>
    </div>
  )
}

export function PrimaryButton({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'gold' }) {
  const cls = tone === 'gold'
    ? 'bg-[#C6A35D] text-[#0a0e17] hover:brightness-95'
    : 'bg-red-600 text-white hover:bg-red-500'
  return <button className={`w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition ${cls}`}>{children}</button>
}
