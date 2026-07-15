'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Check, CheckCircle, Search, X } from 'lucide-react'
import { Card } from '@/components/exec/ui'

interface RM {
  id: string
  full_name: string | null
  company_name: string | null
}

interface Props {
  storeId: string
  currentRmId: string | null
  currentRmName: string | null
  regionalManagers: RM[]
}

export function AssignRMForm({ storeId, currentRmId, currentRmName, regionalManagers }: Props) {
  const router = useRouter()
  const [loading,  setLoading]  = useState(false)
  const [removing, setRemoving] = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<RM | null>(null)

  const filtered = search.trim().length > 0
    ? regionalManagers.filter(rm =>
        (rm.full_name    ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (rm.company_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : []

  async function assign(rmId: string | null) {
    rmId ? setLoading(true) : setRemoving(true)
    await fetch('/api/supplier/assign-rm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, regionalManagerId: rmId }),
    })
    setSaved(true)
    setLoading(false)
    setRemoving(false)
    setSearch('')
    setSelected(null)
    router.refresh()
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-[var(--text-faint)]" />
        <p className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wide">Regional Manager</p>
      </div>

      {currentRmId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text)] truncate">{currentRmName ?? 'Assigned'}</p>
            <p className="text-xs text-[var(--text-muted)]">Currently assigned</p>
          </div>
          <button
            type="button"
            onClick={() => assign(null)}
            disabled={removing}
            className="inline-flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 ring-red-500/40 text-red-600 dark:text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <X size={14} /> {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-faint)] italic">No regional manager assigned.</p>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null) }}
            placeholder="Search regional manager by name…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-blue-500/40"
          />
        </div>

        {filtered.length > 0 && (
          <div className="space-y-1">
            {filtered.map(rm => {
              const isSel = selected?.id === rm.id
              return (
                <button
                  key={rm.id}
                  type="button"
                  onClick={() => { setSelected(rm); setSearch(rm.full_name ?? rm.company_name ?? '') }}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm rounded-lg border transition ${
                    isSel
                      ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <span className="truncate">{rm.full_name ?? 'Unnamed'}{rm.company_name ? ` — ${rm.company_name}` : ''}</span>
                  {isSel && <Check size={16} className="shrink-0 text-emerald-500" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => selected && assign(selected.id)}
          disabled={!selected || loading}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {loading ? 'Assigning…' : 'Assign RM'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={14} /> Saved!
          </span>
        )}
      </div>
    </Card>
  )
}
