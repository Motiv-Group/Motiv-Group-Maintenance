'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe2, Calendar, Filter, ChevronDown } from 'lucide-react'

interface Props {
  dateLabel: string
  regions: { id: string; name: string }[]
}

/** Executive estate header: title, today's date, and a region Filters menu
 *  that navigates to a region's detail page. */
export function EstateHeader({ dateLabel, regions }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#C6A35D]/15 ring-1 ring-[#C6A35D]/30">
          <Globe2 size={18} className="text-[#C6A35D]" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-[var(--text)] leading-tight">Executive Estate Dashboard</h1>
          <p className="text-xs text-[var(--text-muted)]">National maintenance position, exposure and executive attention items.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-3 py-2">
          <Calendar size={14} className="text-[var(--text-muted)]" />
          {dateLabel}
        </span>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-3 py-2 hover:ring-[#C6A35D]/40 transition"
          >
            <Filter size={14} className="text-[var(--text-muted)]" />
            Filters
            <ChevronDown size={13} className={`text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute right-0 mt-1 w-56 max-h-72 overflow-auto rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-xl z-20 p-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">Jump to region</div>
              {regions.length === 0 && <div className="px-3 py-2 text-xs text-[var(--text-faint)]">No regions yet</div>}
              {regions.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setOpen(false); router.push(`/executive/regions?region=${r.id}`) }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--text-muted)] rounded-lg hover:bg-[var(--hover)] hover:text-[var(--text)] transition"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
