'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Store, Plus, User, Mail, Phone, MapPin, Ticket, MoreVertical, Pencil, Power, RotateCcw, Trash2, X, ChevronDown, Archive, ArrowRight, Eye, EyeOff } from 'lucide-react'
import type { StoreCard } from '@/lib/health/data'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { isValidEmail, isValidPhone, normalisePhone } from '@/lib/csv'
import { Card, SectionCard, Pill, Donut, BreakdownList, STATUS_TEXT } from '@/components/exec/ui'
import { DrawerHeader } from '@/components/exec/Drawer'
import { Modal } from '@/components/ui/Modal'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'
const RAG_LABEL: Record<string, string> = { controlled: 'Controlled', attention: 'Attention', at_risk: 'At Risk', critical: 'Critical' }

export interface ArchivedStore { id: string; name: string; deactivatedAt: string | null }
type ActionTarget = { id: string; name: string; archived: boolean }

export function RegionalStores({ stores, archived = [], companyName = '' }: { stores: StoreCard[]; archived?: ArchivedStore[]; companyName?: string }) {
  const router = useRouter()
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const selected = stores.find(s => s.storeId === selId) ?? null
  const ranked = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)
  // Health-status filter deep-linked from the dashboard's distribution block.
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status')
  const shown = statusFilter ? ranked.filter(s => s.finalStatus === statusFilter) : ranked

  // Deep-link from the dashboard "Stores Requiring Attention" list — open the
  // store's side panel directly (?store=<id>).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('store')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link sync from the URL on mount; the empty-dep effect intentionally opens the panel once
    if (id && stores.some(s => s.storeId === id)) { setSelId(id); setOpen(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(action: string, storeId: string) {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, storeId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      setActionTarget(null)
      setNotice({ ok: true, text: d.message ?? 'Done.' })
      router.refresh()
    } catch (e: any) {
      setNotice({ ok: false, text: e.message })
    } finally { setBusy(false) }
  }
  const kebab = (t: ActionTarget) => (
    <button type="button" onClick={() => setActionTarget(t)} disabled={busy} aria-label={`Actions for ${t.name}`}
      className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition disabled:opacity-50">
      <MoreVertical size={16} />
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Store className="text-indigo-600 dark:text-indigo-400" size={22} /> Stores</h1>
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0">
          <Plus size={16} /> Add Store
        </button>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm ${notice.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-current/70 hover:text-current"><X size={15} /></button>
        </div>
      )}

      <SectionCard title="Store Ranking — highest attention first"
        action={statusFilter ? (
          <Link href="/regional/stores" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]">
            {RAG_LABEL[statusFilter] ?? statusFilter} <X size={13} />
          </Link>
        ) : undefined}>
          {/* Desktop / tablet — full table */}
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Health</th><th className="px-2">Status</th>
                <th className="px-2 text-center">Open</th><th className="px-2 text-center">Overdue</th><th className="px-2 text-center">Approvals</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th><th className="px-2 w-8"></th>
              </tr></thead>
              <tbody>
                {shown.map((s, i) => (
                  <tr key={s.storeId} onClick={() => { setSelId(s.storeId); setOpen(true) }} className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === s.storeId ? 'bg-[var(--hover)]' : ''}`}>
                    <td className="py-2.5 px-2 text-[var(--text-faint)]">{i + 1}</td><td className="px-2 text-[var(--text)]">{s.storeName}{s.branchCode && <span className="ml-1.5 font-mono text-[11px] text-[var(--text-faint)]">{s.branchCode}</span>}</td>
                    <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td><td className="px-2"><Pill status={s.finalStatus} /></td>
                    <td className="px-2 text-center text-[var(--text)]">{s.openTickets}</td><td className="px-2 text-center text-red-400">{s.overdueTickets}</td>
                    <td className="px-2 text-center text-[var(--text)]">{s.pendingDecisions}</td><td className="px-2 text-[var(--text)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
                    <td className="px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">{s.mainIssue}</td>
                    <td className="px-2 text-right" onClick={e => e.stopPropagation()}>
                      {kebab({ id: s.storeId, name: s.storeName, archived: false })}
                    </td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={10} className="py-6 text-center text-[var(--text-faint)]">{statusFilter ? `No ${RAG_LABEL[statusFilter] ?? statusFilter} stores.` : 'No stores in your region.'}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Phone — stacked cards, tap to open detail (no horizontal scroll) */}
          <ul className="md:hidden space-y-2">
            {shown.map((s, i) => (
              <li key={s.storeId} className="relative">
                <button onClick={() => { setSelId(s.storeId); setOpen(true) }} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 pr-10 hover:bg-[var(--hover)] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate"><span className="text-[var(--text-faint)]">#{i + 1}</span> {s.storeName}{s.branchCode && <span className="ml-1.5 font-mono text-[11px] text-[var(--text-faint)]">{s.branchCode}</span>}</p>
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
                  {kebab({ id: s.storeId, name: s.storeName, archived: false })}
                </div>
              </li>
            ))}
            {!shown.length && <li className="py-6 text-center text-[var(--text-faint)] text-sm">{statusFilter ? `No ${RAG_LABEL[statusFilter] ?? statusFilter} stores.` : 'No stores in your region.'}</li>}
          </ul>
      </SectionCard>

      {/* Archive — deactivated stores, collapsible */}
      {archived.length > 0 && (
        <Card className="p-3">
          <button onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen} className="w-full flex items-center gap-2 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            <Archive size={15} className="text-[var(--text-faint)]" />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Deactivated</span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{archived.length}</span>
          </button>
          {archiveOpen && (
            <ul className="space-y-2 mt-2">
              {archived.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{a.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Deactivated</span>
                      {a.deactivatedAt ? ` · ${formatDateTime(a.deactivatedAt)}` : ''}
                    </p>
                  </div>
                  {kebab({ id: a.id, name: a.name, archived: true })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {open && selected && <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">{close => <Detail s={selected} onClose={close} />}</Modal>}

      {actionTarget && (
        <StoreActionsModal
          target={actionTarget}
          busy={busy}
          onClose={() => setActionTarget(null)}
          onEdit={() => { const id = actionTarget.id; setActionTarget(null); setEditId(id) }}
          onDeactivate={() => act('deactivate_store', actionTarget.id)}
          onReactivate={() => act('reactivate_store', actionTarget.id)}
          onDelete={() => act('delete_store', actionTarget.id)}
        />
      )}

      {editId && <EditStoreModal storeId={editId} companyName={companyName} onClose={() => setEditId(null)} onSaved={msg => { setEditId(null); setNotice({ ok: true, text: msg }); router.refresh() }} />}

      {addOpen && <AddStoreModal companyName={companyName} onClose={() => setAddOpen(false)} onSaved={msg => { setAddOpen(false); setNotice({ ok: true, text: msg }); router.refresh() }} />}
    </div>
  )
}

/** Centred pop-up listing the actions for one store. Big store name + close X.
 *  Destructive actions confirm in-app (no native browser dialog). */
function StoreActionsModal({ target, busy, onClose, onEdit, onDeactivate, onReactivate, onDelete }: {
  target: ActionTarget; busy: boolean; onClose: () => void
  onEdit: () => void; onDeactivate: () => void; onReactivate: () => void; onDelete: () => void
}) {
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const item = 'flex items-center gap-2.5 w-full px-3.5 py-3 rounded-xl ring-1 ring-[var(--border)] text-sm font-medium text-left transition disabled:opacity-50'

  const confirmCopy = confirm === 'delete'
    ? { title: `Delete ${target.name}?`, body: 'This permanently removes the store from the database. This cannot be undone.', cta: 'Yes, delete', cls: 'bg-red-600 hover:bg-red-700', run: onDelete }
    : { title: `Deactivate ${target.name}?`, body: 'The store will be hidden from active lists and moved to the archive. You can reactivate it later.', cta: 'Yes, deactivate', cls: 'bg-amber-500 hover:bg-amber-600 text-[#0a0e17]', run: onDeactivate }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Manage store</p>
            <h3 className="text-xl font-bold text-[var(--text)] break-words">{target.name}</h3>
            {target.archived && <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Deactivated</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>

        {confirm ? (
          <div className="space-y-3">
            <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">{confirmCopy.title}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{confirmCopy.body}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={confirmCopy.run} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50 ${confirmCopy.cls}`}>{busy ? 'Working…' : confirmCopy.cta}</button>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" disabled={busy} onClick={onEdit} className={`${item} text-[var(--text)] hover:bg-[var(--hover)]`}><Pencil size={15} className="text-[var(--text-faint)]" /> Edit store</button>
            {target.archived
              ? <button type="button" disabled={busy} onClick={onReactivate} className={`${item} text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10`}><RotateCcw size={15} /> Reactivate store</button>
              : <button type="button" disabled={busy} onClick={() => setConfirm('deactivate')} className={`${item} text-amber-600 dark:text-amber-400 hover:bg-amber-500/10`}><Power size={15} /> Deactivate store</button>}
            <button type="button" disabled={busy} onClick={() => setConfirm('delete')} className={`${item} text-red-600 dark:text-red-400 hover:bg-red-500/10`}><Trash2 size={15} /> Delete store</button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Edit the full store + store-manager record — the same fields the SM sees
 *  greyed-out in their Settings (they can't self-edit these). Changing the email
 *  re-issues login credentials (username + new password) by email. Uses the shared
 *  Modal for consistency with the store-detail and actions pop-ups. */
function EditStoreModal({ storeId, companyName = '', onClose, onSaved }: { storeId: string; companyName?: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [hasSm, setHasSm] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  const setUpper = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value.toUpperCase() }))

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'store_detail', storeId }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Could not load store')
        if (!live) return
        setVals({
          store_name: d.store?.name ?? '',
          branch_code: d.store?.branchCode ?? '',
          sub_store: d.store?.subStore ?? '',
          address: d.store?.address ?? '',
          full_name: d.sm?.fullName ?? '',
          email: d.sm?.email ?? '',
          phone: d.sm?.phone ?? '',
          // Company applies to all the RM's stores — default to the RM's company.
          company_name: d.sm?.companyName || companyName || '',
        })
        setHasSm(!!d.sm)
      } catch (e: any) { if (live) setErr(e.message) } finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [storeId, companyName])

  // Validate, then show an in-app confirm step (no native browser dialog).
  function review(e: React.FormEvent) {
    e.preventDefault()
    if (!vals.store_name?.trim()) { setErr('Store name is required.'); return }
    if (!vals.branch_code?.trim()) { setErr('Branch code is required.'); return }
    if (hasSm) {
      if (vals.email?.trim() && !isValidEmail(vals.email)) { setErr('Please enter a valid email address.'); return }
      if (vals.phone?.trim() && !isValidPhone(vals.phone)) { setErr('Please enter a valid phone number.'); return }
    }
    setErr(''); setConfirming(true)
  }

  async function doSave() {
    setBusy(true); setErr('')
    try {
      const body = {
        action: 'update_store', storeId,
        store_name: vals.store_name, branch_code: vals.branch_code, sub_store: vals.sub_store, address: vals.address ?? '',
        ...(hasSm ? { full_name: vals.full_name, email: vals.email, phone: vals.phone, company_name: vals.company_name ?? '' } : {}),
      }
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      onSaved(d.message ?? 'Store updated.')
    } catch (e: any) { setErr(e.message); setBusy(false); setConfirming(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      {close => (
        <>
          <DrawerHeader onClose={close} title={<div className="flex items-center gap-2"><Pencil size={17} className="text-blue-600 dark:text-blue-400 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">Edit store</h3></div>} />
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--text-faint)]">Loading…</p>
          ) : (
            <form onSubmit={review} className="space-y-4">
              {/* Store details */}
              <FormSection title="Store details">
                <Field label="Company name"><input className={FIELD_INPUT} value={vals.company_name ?? ''} onChange={set('company_name')} placeholder="Acme Corporation" /></Field>
                <Field label="Store / branch name"><input className={FIELD_INPUT} value={vals.store_name ?? ''} onChange={set('store_name')} required /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Branch code"><input className={`${FIELD_INPUT} font-mono uppercase`} value={vals.branch_code ?? ''} onChange={setUpper('branch_code')} placeholder="e.g. CPT001" required /></Field>
                  <Field label="Branch / sub-store"><input className={FIELD_INPUT} value={vals.sub_store ?? ''} onChange={set('sub_store')} placeholder="e.g. Cape Town Branch" /></Field>
                </div>
                <Field label="Address"><input className={FIELD_INPUT} value={vals.address ?? ''} onChange={set('address')} placeholder="123 Main St, Cape Town" /></Field>
              </FormSection>

              {/* Store manager — the SM's greyed-out Settings fields */}
              {hasSm ? (
                <FormSection title="Store manager">
                  <Field label="Full name"><input className={FIELD_INPUT} value={vals.full_name ?? ''} onChange={set('full_name')} placeholder="e.g. Thabo Mokoena" /></Field>
                  <Field label="Phone"><input className={FIELD_INPUT} type="tel" value={vals.phone ?? ''} onChange={set('phone')} placeholder="e.g. 0761936165" /></Field>
                  <Field label="Login email"><input className={FIELD_INPUT} type="email" value={vals.email ?? ''} onChange={set('email')} placeholder="manager@store.co.za" /></Field>
                  <p className="text-[11px] text-[var(--text-faint)]">Changing the email re-issues login details (username + new password) to the new address.</p>
                </FormSection>
              ) : (
                <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-[11px] text-[var(--text-faint)]">No store manager linked yet — only the store details can be edited.</p>
              )}

              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</p>}

              {confirming ? (
                <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
                  <p className="text-sm text-[var(--text)]">Save these changes to <span className="font-semibold">{vals.store_name}</span>?</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={doSave} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">{busy ? 'Saving…' : 'Yes, save'}</button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">Save changes</button>
              )}
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

/** Add a store + its store-manager login in one pop-up. Posts `create_store_manager`
 *  (creates the store, the auth user, links them, emails the credentials). */
function AddStoreModal({ companyName = '', onClose, onSaved }: { companyName?: string; onClose: () => void; onSaved: (msg: string) => void }) {
  // Company applies to all the RM's stores — pre-fill with the RM's own company.
  const [vals, setVals] = useState<Record<string, string>>({ company_name: companyName })
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  const setUpper = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value.toUpperCase() }))
  const formatPhone = () => { const n = normalisePhone(vals.phone); if (n) setVals(v => ({ ...v, phone: n })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(vals.email)) { setErr('Please enter a valid email address.'); return }
    if (!isValidPhone(vals.phone)) { setErr('Please enter a valid phone number.'); return }
    if ((vals.password ?? '').length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_store_manager', ...vals }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed to create account')
      onSaved(d.message ?? 'Store manager account created.')
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      {close => (
        <>
          <DrawerHeader onClose={close} title={<div className="flex items-center gap-2"><Plus size={17} className="text-emerald-500 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">Add store</h3></div>} />
          <p className="-mt-2 text-sm text-[var(--text-muted)]">Create a store and its store-manager login. The login details are emailed to the manager.</p>
          <form onSubmit={submit} className="space-y-4">
            {/* Store details */}
            <FormSection title="Store details">
              <Field label="Company name"><input className={FIELD_INPUT} value={vals.company_name ?? ''} onChange={set('company_name')} placeholder="Acme Corporation" /></Field>
              <Field label="Store / branch name"><input className={FIELD_INPUT} value={vals.store_name ?? ''} onChange={set('store_name')} placeholder="e.g. Canal Walk" required /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Branch code"><input className={`${FIELD_INPUT} font-mono uppercase`} value={vals.branch_code ?? ''} onChange={setUpper('branch_code')} placeholder="e.g. CPT001" required /></Field>
                <Field label="Branch / sub-store"><input className={FIELD_INPUT} value={vals.sub_store ?? ''} onChange={set('sub_store')} placeholder="e.g. Cape Town Branch" /></Field>
              </div>
              <Field label="Address"><input className={FIELD_INPUT} value={vals.address ?? ''} onChange={set('address')} placeholder="123 Main St, Cape Town" /></Field>
            </FormSection>

            {/* Store manager */}
            <FormSection title="Store manager">
              <Field label="Full name"><input className={FIELD_INPUT} value={vals.full_name ?? ''} onChange={set('full_name')} placeholder="e.g. Thabo Mokoena" required /></Field>
              <Field label="Phone"><input className={FIELD_INPUT} type="tel" value={vals.phone ?? ''} onChange={set('phone')} onBlur={formatPhone} placeholder="e.g. 0761936165" required /></Field>
              <Field label="Login email"><input className={FIELD_INPUT} type="email" value={vals.email ?? ''} onChange={set('email')} placeholder="manager@store.co.za" required /></Field>
              <Field label="Temporary password (min 8)">
                <div className="relative">
                  <input className={`${FIELD_INPUT} pr-11`} type={showPw ? 'text' : 'password'} value={vals.password ?? ''} onChange={set('password')} placeholder="At least 8 characters" minLength={8} required />
                  <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </FormSection>

            {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              <Plus size={16} /> {busy ? 'Creating…' : 'Create store'}
            </button>
          </form>
        </>
      )}
    </Modal>
  )
}

const FIELD_INPUT = 'w-full rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/40'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl bg-[var(--surface-2)] p-3.5 ring-1 ring-[var(--border)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs text-[var(--text-muted)]">{label}</label>{children}</div>
}

/** One contact line: clickable (mail/tel/maps) when a value exists, else hidden. */
function ContactRow({ icon: Icon, label, value, href, external }: { icon: React.ElementType; label: string; value: string | null | undefined; href: string | null; external?: boolean }) {
  if (!value) return null
  const inner = (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-[var(--text-faint)] group-hover:text-blue-600 dark:group-hover:text-blue-400" />
      <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span><span className="block break-words text-sm font-medium text-[var(--text)] group-hover:text-blue-600 dark:group-hover:text-blue-400">{value}</span></span>
    </>
  )
  return href
    ? <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-[var(--hover)]">{inner}</a>
    : <div className="flex items-start gap-2.5 px-0 py-1.5">{inner}</div>
}

function Detail({ s, onClose }: { s: StoreCard; onClose?: () => void }) {
  const recommended = s.finalStatus === 'controlled' ? 'Store controlled — keep it up.' : `Resolve: ${s.mainIssue}.`
  // Prefer the store's street address; fall back to its region so a location always shows.
  const loc = s.location || (s.regionName && s.regionName !== '—' ? s.regionName : null)
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><Store size={18} className="text-blue-600 dark:text-blue-400 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">{s.storeName}</h3>{s.branchCode && <span className="font-mono text-xs text-[var(--text-faint)]">{s.branchCode}</span>}<Pill status={s.finalStatus} /></div>} />

      {/* Health hero — donut + score + top-line */}
      <div className="flex items-center gap-4 rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
        <Donut value={s.finalHealthScore} status={s.finalStatus} size={92} label="Health" />
        <div className="min-w-0">
          <div className={`text-2xl font-bold leading-none ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">Open {s.openTickets} · Overdue {s.overdueTickets} · Pending {s.pendingDecisions}</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">{s.regionName}</p>
        </div>
      </div>

      {/* Store manager — full contact, all clickable */}
      <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><User size={13} /> Store Manager</div>
        {s.sm?.name || s.sm?.email || s.sm?.phone || loc ? (
          <div className="space-y-0.5">
            {s.sm?.name && <p className="mb-1 text-base font-bold text-[var(--text)]">{s.sm.name}</p>}
            <ContactRow icon={Mail} label="Email" value={s.sm?.email} href={s.sm?.email ? `mailto:${s.sm.email}` : null} />
            <ContactRow icon={Phone} label="Phone" value={s.sm?.phone} href={s.sm?.phone ? `tel:${s.sm.phone}` : null} />
            <ContactRow icon={MapPin} label="Location" value={loc} href={loc ? `https://maps.google.com/?q=${encodeURIComponent(loc)}` : null} external />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">No store manager on record.</p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Open', value: String(s.openTickets) },
          { label: 'Overdue', value: String(s.overdueTickets) },
          { label: 'Approvals', value: String(s.pendingDecisions) },
          { label: 'Exposure', value: formatCurrency(s.costExposure) },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
            <div className="text-lg font-bold text-[var(--text)]">{c.value}</div>
            <div className="text-[11px] text-[var(--text-faint)]">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Health breakdown */}
      <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Health breakdown</div>
        <BreakdownList rows={[
          { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 }, { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
          { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 }, { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
          { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 }, { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
        ]} />
      </div>

      {/* Recommended action */}
      <div className="rounded-xl bg-blue-500/5 ring-1 ring-blue-500/20 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Recommended action</div>
        <p className="mt-1 text-sm text-[var(--text)]">{recommended}</p>
      </div>

      <Link href={`/regional/tickets?store=${encodeURIComponent(s.storeName)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500">
        <Ticket size={16} /> View store tickets <ArrowRight size={15} />
      </Link>
    </div>
  )
}
