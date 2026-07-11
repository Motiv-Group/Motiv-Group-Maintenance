'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, FileType2, Calendar, Building2, Check } from 'lucide-react'

interface StoreOpt { id: string; label: string }

const PERIODS = [
  { key: 'week',   label: 'This Week'  },
  { key: 'month',  label: 'This Month' },
  { key: 'custom', label: 'Date Range' },
] as const

export function ReportBuilder({ role, stores }: { role: 'supplier' | 'regional'; stores?: StoreOpt[] }) {
  const router = useRouter()
  const [period,   setPeriod]   = useState<'week' | 'month' | 'custom'>('month')
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [format,   setFormat]   = useState<'docx' | 'pdf'>('docx')
  const [selected, setSelected] = useState<Set<string>>(new Set((stores ?? []).map(s => s.id)))
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const base = role === 'supplier' ? '/supplier' : '/regional'

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function generate() {
    setError('')
    if (period === 'custom' && (!from || !to)) { setError('Pick both a From and To date.'); return }
    if (role === 'regional' && selected.size === 0) { setError('Select at least one store.'); return }
    setLoading(true)

    if (format === 'pdf') {
      const p = new URLSearchParams({ period })
      if (period === 'custom') { p.set('from', from); p.set('to', to) }
      if (role === 'regional') p.set('stores', Array.from(selected).join(','))
      router.push(`${base}/reports/view?${p.toString()}`)
      return
    }

    try {
      const res = await fetch(`/api/reports/${role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          from: period === 'custom' ? from : undefined,
          to:   period === 'custom' ? to   : undefined,
          storeIds: role === 'regional' ? Array.from(selected) : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to generate report')
        setLoading(false)
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `${role}-report-${new Date().toISOString().slice(0, 10)}.docx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Period */}
      <div>
        <p className="text-sm font-medium text-[var(--text-muted)] mb-2 flex items-center gap-1.5"><Calendar size={14} /> Period</p>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => {
            const active = period === p.key
            return (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  active ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                {p.label}
                {active && <Check size={16} className="text-emerald-500" />}
              </button>
            )
          })}
        </div>
        {period === 'custom' && (
          <div className="flex gap-3 mt-3">
            <label className="text-xs text-[var(--text-muted)]">From
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="mt-1 block w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </label>
            <label className="text-xs text-[var(--text-muted)]">To
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="mt-1 block w-full px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </label>
          </div>
        )}
      </div>

      {/* Stores (regional only) */}
      {role === 'regional' && stores && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[var(--text-muted)] flex items-center gap-1.5"><Building2 size={14} /> Stores ({selected.size}/{stores.length})</p>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setSelected(new Set(stores.map(s => s.id)))}>All</button>
              <button type="button" className="text-[var(--text-muted)] hover:underline" onClick={() => setSelected(new Set())}>None</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
            {stores.map(s => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--hover)]">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-emerald-600" />
                <span className="text-[var(--text)]">{s.label}</span>
              </label>
            ))}
            {stores.length === 0 && <p className="px-3 py-3 text-sm text-[var(--text-faint)]">No stores assigned to you.</p>}
          </div>
        </div>
      )}

      {/* Format */}
      <div>
        <p className="text-sm font-medium text-[var(--text-muted)] mb-2">Format</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFormat('docx')} aria-pressed={format === 'docx'}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
              format === 'docx' ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
            <FileText size={16} /> Word (.docx)
            {format === 'docx' && <Check size={16} className="text-emerald-500" />}
          </button>
          <button type="button" onClick={() => setFormat('pdf')} aria-pressed={format === 'pdf'}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
              format === 'pdf' ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
            <FileType2 size={16} /> PDF
            {format === 'pdf' && <Check size={16} className="text-emerald-500" />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--text-faint)]">
          {format === 'docx'
            ? 'Word document with auto Table of Contents, Figures & Tables. Open in Word and allow it to update fields.'
            : 'Opens a print-ready page — use “Save as PDF / Print”.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="button" onClick={generate} disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60 w-full sm:w-auto">
        {loading ? 'Generating…' : 'Generate Report'}
      </button>
    </div>
  )
}
