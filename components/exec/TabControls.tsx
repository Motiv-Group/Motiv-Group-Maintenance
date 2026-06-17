'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Calendar, Filter, Download, ChevronDown, Check } from 'lucide-react'

/** Page header used across the executive tabs: icon + title + subtitle on the
 *  left, a slot for date/filter/export/action controls on the right. */
export function TabHeader({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#C6A35D]/15 ring-1 ring-[#C6A35D]/30">{icon}</span>
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{title}</h1>
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        </div>
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

const chip = 'flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--surface)] ring-1 ring-[var(--border)] rounded-xl px-3 py-2'

export function DateChip({ date }: { date: string }) {
  return <span className={chip}><Calendar size={14} className="text-[var(--text-muted)]" />{date}</span>
}

export interface FilterOption { value: string; label: string }

/** Status (or any) filter dropdown. Controlled. */
export function FilterMenu({ value, onChange, options, label = 'Filters' }: { value: string; onChange: (v: string) => void; options: FilterOption[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const active = options.find(o => o.value === value)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`${chip} hover:ring-[#C6A35D]/40 transition`}>
        <Filter size={14} className="text-[var(--text-muted)]" />
        {active && active.value !== 'all' ? active.label : label}
        <ChevronDown size={13} className={`text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-xl z-20 p-1">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-[var(--hover)] flex items-center justify-between text-[var(--text-muted)] hover:text-white transition"
            >
              {o.label}
              {o.value === value && <Check size={13} className="text-[#C6A35D]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ExportButton({ onExport }: { onExport: () => void }) {
  return (
    <button onClick={onExport} className={`${chip} hover:ring-[#C6A35D]/40 transition`}>
      <Download size={14} className="text-[var(--text-muted)]" /> Export
    </button>
  )
}

/** Build + download a CSV from a header row and data rows. */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Common status filter options used by ranking tables. */
export const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'controlled', label: 'Controlled' },
  { value: 'attention', label: 'Attention' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'critical', label: 'Critical' },
]
