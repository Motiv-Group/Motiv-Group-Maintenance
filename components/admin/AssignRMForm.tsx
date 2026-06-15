'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, CheckCircle, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

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
    <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-brand-600" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Regional Manager</p>
      </div>

      {currentRmId ? (
        <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2">
          <div>
            <p className="text-sm font-medium text-brand-800 dark:text-brand-300">{currentRmName ?? 'Assigned'}</p>
            <p className="text-xs text-brand-600 dark:text-brand-400">Currently assigned</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => assign(null)}
            loading={removing}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <X size={14} className="mr-1" /> Remove
          </Button>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No regional manager assigned.</p>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null) }}
            placeholder="Search regional manager by name..."
            className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {filtered.length > 0 && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {filtered.map(rm => (
              <button
                key={rm.id}
                type="button"
                onClick={() => { setSelected(rm); setSearch(rm.full_name ?? rm.company_name ?? '') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 text-gray-900 dark:text-white"
              >
                {rm.full_name ?? 'Unnamed'}{rm.company_name ? ` — ${rm.company_name}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => selected && assign(selected.id)}
          loading={loading}
          disabled={!selected}
          size="sm"
        >
          Assign RM
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle size={14} /> Saved!
          </span>
        )}
      </div>
    </div>
  )
}
