'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Store, Plus, User, Mail, Phone, Ticket, MoreVertical, Pencil, Power, Trash2, X } from 'lucide-react'
import type { StoreCard } from '@/lib/health/data'
import { formatCurrency } from '@/lib/utils'
import { isValidEmail, isValidPhone } from '@/lib/csv'
import { SectionCard, Pill, Donut, BreakdownList, STATUS_TEXT } from '@/components/exec/ui'
import { Drawer, DrawerHeader } from '@/components/exec/Drawer'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

export function RegionalStores({ stores }: { stores: StoreCard[] }) {
  const router = useRouter()
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const selected = stores.find(s => s.storeId === selId) ?? null
  const editStore = stores.find(s => s.storeId === editId) ?? null
  const ranked = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)

  async function act(action: string, storeId: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, storeId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      setNotice({ ok: true, text: d.message ?? 'Done.' })
      router.refresh()
    } catch (e: any) {
      setNotice({ ok: false, text: e.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Store className="text-indigo-600 dark:text-indigo-400" size={22} /> Stores</h1>
        <Link href="/regional/stores/add" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0">
          <Plus size={16} /> Add Stores
        </Link>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm ${notice.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-current/70 hover:text-current"><X size={15} /></button>
        </div>
      )}

      <SectionCard title="Store Ranking — highest attention first">
          {/* Desktop / tablet — full table */}
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Health</th><th className="px-2">Status</th>
                <th className="px-2 text-center">Open</th><th className="px-2 text-center">Overdue</th><th className="px-2 text-center">Approvals</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th><th className="px-2 w-8"></th>
              </tr></thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr key={s.storeId} onClick={() => { setSelId(s.storeId); setOpen(true) }} className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === s.storeId ? 'bg-[var(--hover)]' : ''}`}>
                    <td className="py-2.5 px-2 text-[var(--text-faint)]">{i + 1}</td><td className="px-2 text-[var(--text)]">{s.storeName}</td>
                    <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td><td className="px-2"><Pill status={s.finalStatus} /></td>
                    <td className="px-2 text-center text-[var(--text)]">{s.openTickets}</td><td className="px-2 text-center text-red-400">{s.overdueTickets}</td>
                    <td className="px-2 text-center text-[var(--text)]">{s.pendingDecisions}</td><td className="px-2 text-[var(--text)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
                    <td className="px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">{s.mainIssue}</td>
                    <td className="px-2 text-right" onClick={e => e.stopPropagation()}>
                      <StoreActionsMenu busy={busy} onEdit={() => setEditId(s.storeId)} onDeactivate={() => act('deactivate_store', s.storeId, `Deactivate ${s.storeName}? It will be hidden from active lists.`)} onDelete={() => act('delete_store', s.storeId, `Permanently delete ${s.storeName}? This cannot be undone.`)} />
                    </td>
                  </tr>
                ))}
                {!stores.length && <tr><td colSpan={10} className="py-6 text-center text-[var(--text-faint)]">No stores in your region.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Phone — stacked cards, tap to open detail (no horizontal scroll) */}
          <ul className="md:hidden space-y-2">
            {ranked.map((s, i) => (
              <li key={s.storeId} className="relative">
                <button onClick={() => { setSelId(s.storeId); setOpen(true) }} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 pr-10 hover:bg-[var(--hover)] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate"><span className="text-[var(--text-faint)]">#{i + 1}</span> {s.storeName}</p>
                      <p className="text-[11px] text-[var(--text-faint)] truncate mt-0.5">{s.mainIssue}</p>
                    </div>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span>
                      <Pill status={s.finalStatus} />
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>Open: <span className="text-[var(--text)]">{s.openTickets}</span></span>
                    <span>Overdue: <span className="text-red-500">{s.overdueTickets}</span></span>
                    <span>Approvals: <span className="text-[var(--text)]">{s.pendingDecisions}</span></span>
                    <span>Exposure: <span className="text-[var(--text)]">{fmtK(s.costExposure)}</span></span>
                  </div>
                </button>
                <div className="absolute top-2 right-2">
                  <StoreActionsMenu busy={busy} onEdit={() => setEditId(s.storeId)} onDeactivate={() => act('deactivate_store', s.storeId, `Deactivate ${s.storeName}? It will be hidden from active lists.`)} onDelete={() => act('delete_store', s.storeId, `Permanently delete ${s.storeName}? This cannot be undone.`)} />
                </div>
              </li>
            ))}
            {!stores.length && <li className="py-6 text-center text-[var(--text-faint)] text-sm">No stores in your region.</li>}
          </ul>
      </SectionCard>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <Detail s={selected} onClose={() => setOpen(false)} />}</Drawer>
      {editStore && <EditStoreModal store={editStore} onClose={() => setEditId(null)} onSaved={msg => { setEditId(null); setNotice({ ok: true, text: msg }); router.refresh() }} />}
    </div>
  )
}

/** Kebab (⋮) menu: Edit / Deactivate / Delete a store. Closes on outside click. */
function StoreActionsMenu({ busy, onEdit, onDeactivate, onDelete }: { busy: boolean; onEdit: () => void; onDeactivate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const item = 'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--hover)] transition disabled:opacity-50'
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} disabled={busy} aria-label="Store actions"
        className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition disabled:opacity-50">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute z-30 right-0 mt-1 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden py-1">
          <button type="button" className={`${item} text-[var(--text)]`} disabled={busy} onClick={() => { setOpen(false); onEdit() }}><Pencil size={14} className="text-[var(--text-faint)]" /> Edit</button>
          <button type="button" className={`${item} text-[var(--text)]`} disabled={busy} onClick={() => { setOpen(false); onDeactivate() }}><Power size={14} className="text-[var(--text-faint)]" /> Deactivate</button>
          <button type="button" className={`${item} text-red-600 dark:text-red-400`} disabled={busy} onClick={() => { setOpen(false); onDelete() }}><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </div>
  )
}

/** Edit store name + store-manager contact. Changing the email re-issues login
 *  credentials (username + new password) by email. */
function EditStoreModal({ store, onClose, onSaved }: { store: StoreCard; onClose: () => void; onSaved: (msg: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [hasSm, setHasSm] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'store_detail', storeId: store.storeId }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Could not load store')
        if (!live) return
        setName(d.store?.name ?? '')
        setEmail(d.sm?.email ?? '')
        setPhone(d.sm?.phone ?? '')
        setHasSm(!!d.sm)
      } catch (e: any) { if (live) setErr(e.message) } finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [store.storeId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Store name is required.'); return }
    if (hasSm) {
      if (email.trim() && !isValidEmail(email)) { setErr('Please enter a valid email address.'); return }
      if (phone.trim() && !isValidPhone(phone)) { setErr('Please enter a valid phone number.'); return }
    }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_store', storeId: store.storeId, store_name: name, ...(hasSm ? { email, phone } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      onSaved(d.message ?? 'Store updated.')
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-[var(--text)]">Edit store</h3>
          <button onClick={onClose} className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-faint)] py-6 text-center">Loading…</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Store / branch name</label>
              <input className={input} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            {hasSm ? (
              <>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Manager email</label>
                  <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@store.co.za" />
                  <p className="text-[11px] text-[var(--text-faint)] mt-1">Changing the email re-issues login details (username + new password) to the new address.</p>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Manager phone</label>
                  <input className={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0761936165" />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-[var(--text-faint)]">No store manager linked yet — only the store name can be edited.</p>
            )}
            {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
            <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
          </form>
        )}
      </div>
    </div>
  )
}

function Detail({ s, onClose }: { s: StoreCard; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-[var(--text)]">{s.storeName}</h3><Pill status={s.finalStatus} /></div>} />
      <div><div className={`text-3xl font-bold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div><p className="text-xs text-[var(--text-muted)] mt-1">Open {s.openTickets} · Overdue {s.overdueTickets} · Pending approvals {s.pendingDecisions}</p></div>

      {/* Store manager contact */}
      <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface-2)] p-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Store Manager</div>
        {s.sm ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-[var(--text)]"><User size={14} className="text-[var(--text-faint)] shrink-0" />{s.sm.name ?? 'Unnamed'}</div>
            {s.sm.email && <a href={`mailto:${s.sm.email}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-[#C6A35D]"><Mail size={14} className="text-[var(--text-faint)] shrink-0" /><span className="truncate">{s.sm.email}</span></a>}
            {s.sm.phone && <a href={`tel:${s.sm.phone}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-[#C6A35D]"><Phone size={14} className="text-[var(--text-faint)] shrink-0" />{s.sm.phone}</a>}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">No store manager on record.</p>
        )}
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Open', value: String(s.openTickets) },
          { label: 'Overdue', value: String(s.overdueTickets) },
          { label: 'Pending approvals', value: String(s.pendingDecisions) },
          { label: 'Cost exposure', value: formatCurrency(s.costExposure) },
        ].map(c => (
          <div key={c.label} className="rounded-lg ring-1 ring-[var(--border)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{c.label}</div>
            <div className="text-sm font-semibold text-[var(--text)] mt-0.5">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Donut value={s.finalHealthScore} status={s.finalStatus} size={104} />
        <div className="flex-1"><BreakdownList rows={[
          { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 }, { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
          { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 }, { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
          { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 }, { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
        ]} /></div>
      </div>
      <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Recommended Action</div><p className="text-xs text-[var(--text)]">{s.finalStatus === 'controlled' ? 'Store controlled — maintain.' : `Resolve: ${s.mainIssue}.`}</p></div>
      <Link href={`/regional/tickets?store=${encodeURIComponent(s.storeName)}`} className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-[#C6A35D] hover:bg-[#b8954f] text-[#0a0e17] text-sm font-semibold transition">
        <Ticket size={15} /> View Store Tickets
      </Link>
    </div>
  )
}
