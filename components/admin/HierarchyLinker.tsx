'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Building2, Store, MapPin, Loader2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

type Opt = { id: string; label: string }
export type LinkerExec = { id: string; name: string }
export type LinkerRM = { id: string; name: string; email: string; regionIds: string[]; execIds: string[] }
export type LinkerSM = { id: string; name: string; email: string; storeIds: string[] }

// Chip multi-select that persists on every toggle. `action` + `key` (the payload
// field for the id list) drive the POST to /api/admin/hierarchy.
function LinkChips({ companyId, userId, action, listKey, options, initial, empty }: {
  companyId: string
  userId: string
  action: string
  listKey: 'regionIds' | 'storeIds' | 'execUserIds'
  options: Opt[]
  initial: string[]
  empty: string
}) {
  const router = useRouter()
  const [sel, setSel] = useState<string[]>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function toggle(id: string) {
    const next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    const prev = sel
    setSel(next); setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/hierarchy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, companyId, userId, [listKey]: next }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      router.refresh()
    } catch (e) { setSel(prev); setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  if (!options.length) return <p className="text-xs text-[var(--text-faint)]">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = sel.includes(o.id)
        return (
          <button key={o.id} type="button" onClick={() => toggle(o.id)} disabled={busy} aria-pressed={on}
            className={`h-8 px-2.5 rounded-lg text-xs font-medium transition disabled:opacity-60 ${on ? 'bg-blue-600 text-white' : 'ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}>
            {o.label}
          </button>
        )
      })}
      {busy && <span className="inline-flex items-center text-[var(--text-faint)]"><Loader2 size={14} className="animate-spin" /></span>}
      {err && <span className="w-full text-xs text-red-500">{err}</span>}
    </div>
  )
}

export function HierarchyLinker({ companyId, executives, regions, stores, rms, sms }: {
  companyId: string
  executives: LinkerExec[]
  regions: Opt[]
  stores: Opt[]
  rms: LinkerRM[]
  sms: LinkerSM[]
}) {
  const execOpts: Opt[] = executives.map(e => ({ id: e.id, label: e.name }))
  return (
    <div className="space-y-5">
      {/* Executives */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-2"><Crown size={15} className="text-[var(--text-muted)]" /> Executives ({executives.length})</h2>
        {executives.length ? (
          <div className="flex flex-wrap gap-1.5">
            {executives.map(e => <span key={e.id} className="rounded-lg bg-[var(--surface-2)] ring-1 ring-[var(--border)] px-2.5 py-1 text-xs text-[var(--text)]">{e.name}</span>)}
          </div>
        ) : <p className="text-xs text-[var(--text-faint)]">No executives yet — invite one from Accounts.</p>}
      </Card>

      {/* Regional managers */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-3"><Building2 size={15} className="text-[var(--text-muted)]" /> Regional Managers ({rms.length})</h2>
        {rms.length ? (
          <div className="space-y-4">
            {rms.map(rm => (
              <div key={rm.id} className="rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
                <p className="text-sm font-semibold text-[var(--text)]">{rm.name || '—'}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{rm.email}</p>
                <div className="mt-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]"><MapPin size={11} /> Regions</p>
                  <LinkChips companyId={companyId} userId={rm.id} action="set_rm_regions" listKey="regionIds" options={regions} initial={rm.regionIds} empty="No regions in this company yet." />
                </div>
                <div className="mt-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]"><Crown size={11} /> Reports to</p>
                  <LinkChips companyId={companyId} userId={rm.id} action="set_rm_execs" listKey="execUserIds" options={execOpts} initial={rm.execIds} empty="No executives to assign." />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-[var(--text-faint)]">No regional managers yet — invite one from Accounts.</p>}
      </Card>

      {/* Store managers */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-3"><Store size={15} className="text-[var(--text-muted)]" /> Store Managers ({sms.length})</h2>
        {sms.length ? (
          <div className="space-y-4">
            {sms.map(sm => (
              <div key={sm.id} className="rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
                <p className="text-sm font-semibold text-[var(--text)]">{sm.name || '—'}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{sm.email}</p>
                <div className="mt-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]"><Store size={11} /> Stores</p>
                  <LinkChips companyId={companyId} userId={sm.id} action="set_sm_stores" listKey="storeIds" options={stores} initial={sm.storeIds} empty="No stores in this company yet." />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-[var(--text-faint)]">No store managers yet — invite one from Accounts.</p>}
      </Card>
    </div>
  )
}
