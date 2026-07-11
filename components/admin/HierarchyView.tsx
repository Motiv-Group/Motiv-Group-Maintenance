'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Crown, MapPin, Store, User } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface RegionRef { id: string; name: string; code: string }
export interface CompanyNode {
  id: string; name: string
  execs: { id: string; name: string; email: string }[]
  regions: {
    id: string; name: string; code: string
    rms: { id: string; name: string; email: string }[]
    stores: { id: string; name: string; subStore: string | null; branchCode: string | null; sm: { name: string; email: string } | null }[]
  }[]
}

async function act(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return res.ok ? null : (data.error ?? 'Failed')
}

function ReLinkSelect({ value, regions, onPick, label }: { value: string; regions: RegionRef[]; onPick: (regionId: string) => Promise<void>; label: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <select disabled={busy} value={value} title={label}
      onChange={async e => { const v = e.target.value; if (!v || v === value) return; setBusy(true); await onPick(v); setBusy(false) }}
      className="text-[11px] rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50">
      {regions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
    </select>
  )
}

export function HierarchyView({ companies, regionsByCompany }: { companies: CompanyNode[]; regionsByCompany: Record<string, RegionRef[]> }) {
  const router = useRouter()
  const [err, setErr] = useState('')
  const move = async (body: Record<string, unknown>) => { const e = await act(body); if (e) setErr(e); else { setErr(''); router.refresh() } }

  if (!companies.length) return <Card className="p-6"><p className="text-sm text-[var(--text-faint)] text-center">No companies yet — create an Executive to start the tree.</p></Card>

  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
      {companies.map(c => {
        const regs = regionsByCompany[c.id] ?? []
        return (
          <Card key={c.id} className="overflow-hidden">
            <details open>
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)]">
                <Building2 size={16} className="text-[var(--text-faint)]" />
                <span className="text-sm font-bold text-[var(--text)]">{c.name}</span>
                <span className="text-[11px] text-[var(--text-faint)]">· {c.regions.length} region{c.regions.length === 1 ? '' : 's'}</span>
                {c.execs.length > 0 && <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><Crown size={12} className="text-[var(--text-faint)]" />{c.execs.map(e => e.name).join(', ')}</span>}
              </summary>
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
                {c.execs.length === 0 && <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-3">No executive yet.</p>}
                {c.regions.length === 0 && <p className="text-[11px] text-[var(--text-faint)] pt-3">No regions yet.</p>}
                {c.regions.map(r => (
                  <div key={r.id} className="rounded-xl ring-1 ring-[var(--border)] p-3 mt-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin size={14} className="text-[var(--text-faint)]" />
                      <span className="text-sm font-semibold text-[var(--text)]">{r.name}</span>
                      <span className="text-[10px] font-mono text-[var(--text-faint)] bg-[var(--surface)] rounded px-1.5 py-0.5">{r.code}</span>
                      <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                        <User size={12} className="text-[var(--text-faint)]" />
                        {r.rms.length ? r.rms.map(rm => (
                          <span key={rm.id} className="inline-flex items-center gap-1">{rm.name}
                            <ReLinkSelect value={r.id} regions={regs} label="Reassign this RM to a region" onPick={rid => move({ action: 'relink_rm', userId: rm.id, regionId: rid })} />
                          </span>
                        )) : <span className="text-amber-600 dark:text-amber-400">No RM</span>}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {r.stores.length ? r.stores.map(s => (
                        <div key={s.id} className="flex items-center gap-2 flex-wrap text-[11px] pl-5">
                          <Store size={12} className="text-[var(--text-faint)]" />
                          <span className="text-[var(--text)]">{s.name}{s.subStore ? ` · ${s.subStore}` : ''}</span>
                          {s.branchCode && <span className="font-mono text-[var(--text-faint)]">{s.branchCode}</span>}
                          <span className="text-[var(--text-muted)]">— {s.sm ? s.sm.name : <span className="text-amber-600 dark:text-amber-400">no SM</span>}</span>
                          <span className="ml-auto flex items-center gap-1 text-[var(--text-faint)]">Move
                            <ReLinkSelect value={r.id} regions={regs} label="Move this store to another region" onPick={rid => move({ action: 'move_store', storeId: s.id, regionId: rid })} />
                          </span>
                        </div>
                      )) : <p className="text-[11px] text-[var(--text-faint)] pl-5">No stores.</p>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        )
      })}
    </div>
  )
}
