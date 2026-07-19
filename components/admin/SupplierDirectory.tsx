'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Clock, Plus, Sparkles } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { CompanyAvatar } from './CompanyAvatar'
import { MotivSupplierInviteModal } from './MotivSupplierInviteModal'
import { errMsg } from '@/components/ui/errMsg'

export type DirectorySupplier = {
  id: string
  name: string
  contact: string | null
  email: string | null
  phone: string | null
  trades: string[]
  verified: boolean
  pendingReview: boolean
  isMotiv: boolean
  companies: { id: string; name: string }[]
}
type CompanyOpt = { id: string; name: string }
type Filter = 'all' | 'motiv' | 'company'

const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

export function SupplierDirectory({ suppliers, companies }: { suppliers: DirectorySupplier[]; companies: CompanyOpt[] }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [motivOpen, setMotivOpen] = useState(false)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return suppliers.filter(s => {
      if (filter === 'motiv' && !s.isMotiv) return false
      if (filter === 'company' && s.isMotiv) return false
      if (!needle) return true
      return s.name.toLowerCase().includes(needle)
        || (s.email ?? '').toLowerCase().includes(needle)
        || s.trades.some(t => t.toLowerCase().includes(needle))
        || s.companies.some(c => c.name.toLowerCase().includes(needle))
    })
  }, [suppliers, q, filter])

  const chip = (v: Filter, label: string) =>
    <button key={v} type="button" onClick={() => setFilter(v)}
      className={`h-9 px-3 rounded-xl text-xs font-semibold transition ${filter === v ? 'bg-blue-600 text-white' : 'ring-1 ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}>{label}</button>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} sm:max-w-xs`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, trade, company…" />
        <div className="flex items-center gap-1.5">
          {chip('all', 'All')}{chip('motiv', 'Motiv')}{chip('company', 'Company')}
        </div>
        <button type="button" onClick={() => setMotivOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition">
          <Sparkles size={15} /> Invite Motiv supplier
        </button>
      </div>
      <div className="text-xs text-[var(--text-faint)]">{rows.length} supplier{rows.length === 1 ? '' : 's'}</div>

      {rows.map(s => <SupplierRow key={s.id} s={s} companies={companies} />)}
      {!rows.length && (
        <Card className="p-8 text-center"><p className="text-sm text-[var(--text-muted)]">No suppliers match.</p></Card>
      )}

      {motivOpen && <MotivSupplierInviteModal onClose={() => setMotivOpen(false)} />}
    </div>
  )
}

function SupplierRow({ s, companies }: { s: DirectorySupplier; companies: CompanyOpt[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const served = new Set(s.companies.map(c => c.id))
  const addable = companies.filter(c => !served.has(c.id))

  async function addToCompany(companyId: string) {
    if (!companyId) return
    setBusy(true); setErr(''); setMsg(null)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite_supplier', companyId, supplierName: s.name, email: s.email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setMsg(data.message ?? 'Linked.'); setAdding(false); router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <CompanyAvatar name={s.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[var(--text)] truncate">{s.name}</p>
            {s.isMotiv && <span className="rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[10px] font-medium">Motiv</span>}
            {s.verified ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><ShieldCheck size={12} /> Verified</span>
              : s.pendingReview ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"><Clock size={12} /> Pending review</span>
              : null}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate">{[s.contact, s.email, s.phone].filter(Boolean).join(' · ') || '—'}</p>
          {s.trades.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.trades.map(t => <span key={t} className="rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[11px] font-medium">{t}</span>)}
            </div>
          )}
          <div className="mt-1.5 text-xs text-[var(--text-faint)]">
            {s.companies.length ? <>Serves: {s.companies.map(c => c.name).join(', ')}</> : 'Not linked to any company'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {adding ? (
          <>
            <select className={`${input} sm:max-w-xs`} defaultValue="" disabled={busy} onChange={e => addToCompany(e.target.value)}>
              <option value="">{addable.length ? 'Choose a company…' : 'Already in every company'}</option>
              {addable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => { setAdding(true); setMsg(null); setErr('') }} disabled={!s.email}
            className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition disabled:opacity-40" title={s.email ? '' : 'No email on file'}>
            <Plus size={13} /> Add to company
          </button>
        )}
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </Card>
  )
}
