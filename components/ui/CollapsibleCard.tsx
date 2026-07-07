'use client'

// Whole-card-clickable collapsible used where a server component needs a header
// bar that toggles its body and remembers the choice across navigation (wiped on
// next sign-in, like every other list). Server-rendered children are passed in.
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { readCollapse, writeCollapse } from '@/lib/collapse-state'

export function CollapsibleCard({ persistKey, header, children, defaultOpen = false }: { persistKey: string; header: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init from localStorage (readCollapse); cannot run during SSR render, applies remembered open-state after mount
  useEffect(() => { const v = readCollapse(persistKey); if (v !== null) setOpen(v) }, [persistKey])
  const toggle = () => setOpen(o => { const v = !o; writeCollapse(persistKey, v); return v })

  return (
    <Card className="p-0 overflow-hidden cursor-pointer hover:ring-[#C6A35D]/30 transition" onClick={toggle} role="button" tabIndex={0} aria-expanded={open} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        {header}
        <ChevronDown size={16} className={`shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <div className="px-5 pb-5" onClick={e => e.stopPropagation()}>{children}</div>}
    </Card>
  )
}
