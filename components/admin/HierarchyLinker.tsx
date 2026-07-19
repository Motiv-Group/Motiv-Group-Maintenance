'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Building2, Store, MapPin, Loader2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

type Opt = { id: string; label: string }
export type LinkerExec = { id: string; name: string }
export type LinkerRM = { id: string; name: string; email: string; regionIds: string[]; execIds: string[] }
export type LinkerSM = { id: string; name: string; email: string; storeIds: string[] }
export type LinkerStoreRow = { id: string; label: string; regionId: string | null }

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

// One store row in the Stores card: current region + a move-to-region picker
// (POSTs the existing move_store action, which also re-homes the store's tickets).
function StoreRegionRow({ store, regions }: { store: LinkerStoreRow; regions: Opt[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function move(regionId: string) {
    if (!regionId || regionId === store.regionId) return
    const target = regions.find(r => r.id === regionId)
    if (!window.confirm(`Move ${store.label} to ${target?.label ?? 'that region'}? Its tickets move to that region's manager too.`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move_store', storeId: store.id, regionId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
      <p className="min-w-0 flex-1 basis-full line-clamp-2 break-words text-sm font-semibold text-[var(--text)] sm:basis-auto sm:line-clamp-1">{store.label}</p>
      {/* Natural-width select (a flex-shrunk native select clips its label). */}
      <select
        value={store.regionId ?? ''}
        onChange={e => move(e.target.value)}
        disabled={busy}
        aria-label={`Region for ${store.label}`}
        className="w-full shrink-0 rounded-lg bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] disabled:opacity-60 sm:w-auto sm:py-2"
      >
        {!store.regionId && <option value="">No region yet…</option>}
        {regions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {busy && <Loader2 size={14} className="animate-spin text-[var(--text-faint)]" />}
      {err && <p className="w-full text-xs text-red-500">{err}</p>}
    </div>
  )
}

export function HierarchyLinker({ companyId, executives, regions, stores, storeRows, rms, sms }: {
  companyId: string
  executives: LinkerExec[]
  regions: Opt[]
  stores: Opt[]
  storeRows: LinkerStoreRow[]
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

      {/* Stores → regions. A store's region decides which RM oversees it (and its SM):
          SM → store → region → RM. This is where that middle link is set/changed. */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-1"><MapPin size={15} className="text-[var(--text-muted)]" /> Stores ({storeRows.length})</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">A store&rsquo;s region decides which Regional Manager oversees it and its Store Manager. Moving a store re-homes its tickets to the new region&rsquo;s manager.</p>
        {storeRows.length ? (
          <div className="space-y-2.5">
            {storeRows.map(s => <StoreRegionRow key={s.id} store={s} regions={regions} />)}
          </div>
        ) : <p className="text-xs text-[var(--text-faint)]">No stores yet — they&rsquo;re created when you invite a Store Manager.</p>}
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
