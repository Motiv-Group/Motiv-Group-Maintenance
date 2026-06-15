'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { FileText, FileType2, Calendar, Building2 } from 'lucide-react'

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
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Calendar size={14} /> Period</p>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                period === p.key ? 'bg-[#C6A35D] text-white border-[#C6A35D]'
                : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex gap-3 mt-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">From
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400">To
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </label>
          </div>
        )}
      </div>

      {/* Stores (regional only) */}
      {role === 'regional' && stores && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Building2 size={14} /> Stores ({selected.size}/{stores.length})</p>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-brand-600 hover:underline" onClick={() => setSelected(new Set(stores.map(s => s.id)))}>All</button>
              <button type="button" className="text-gray-500 hover:underline" onClick={() => setSelected(new Set())}>None</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
            {stores.map(s => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#C6A35D]" />
                <span className="text-gray-700 dark:text-gray-200">{s.label}</span>
              </label>
            ))}
            {stores.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No stores assigned to you.</p>}
          </div>
        </div>
      )}

      {/* Format */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Format</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFormat('docx')}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              format === 'docx' ? 'bg-[#C6A35D] text-white border-[#C6A35D]'
              : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-400'}`}>
            <FileText size={16} /> Word (.docx)
          </button>
          <button type="button" onClick={() => setFormat('pdf')}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              format === 'pdf' ? 'bg-[#C6A35D] text-white border-[#C6A35D]'
              : 'bg-slate-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-400'}`}>
            <FileType2 size={16} /> PDF
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          {format === 'docx'
            ? 'Word document with auto Table of Contents, Figures & Tables. Open in Word and allow it to update fields.'
            : 'Opens a print-ready page — use “Save as PDF / Print”.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button onClick={generate} loading={loading} className="w-full sm:w-auto">
        Generate Report
      </Button>
    </div>
  )
}
