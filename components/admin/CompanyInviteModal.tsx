'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Building2, Store, Copy, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'
import type { RegionOpt, ProjectOpt } from './AddAccountForm'

type SubRole = 'executive' | 'regional_manager' | 'store_manager'
const NEW = '__new__'
const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

// Invite an Executive / RM / SM under a FIXED company (opened from that company's
// card). Same server actions as the global form, company pre-selected.
export function CompanyInviteModal({ companyId, companyName, regions, projects, onClose }: {
  companyId: string
  companyName: string
  regions: RegionOpt[]
  projects: ProjectOpt[]
  onClose: () => void
}) {
  const router = useRouter()
  const [subRole, setSubRole] = useState<SubRole>('regional_manager')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ message: string; actionLink?: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [regionId, setRegionId] = useState('')
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionCode, setNewRegionCode] = useState('')
  const [projectOn, setProjectOn] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [storeName, setStoreName] = useState('')
  const [subStore, setSubStore] = useState('')
  const [branchCode, setBranchCode] = useState('')

  const companyRegions = useMemo(() => regions.filter(r => r.companyId === companyId), [regions, companyId])
  const companyProjects = useMemo(() => projects.filter(p => p.companyId === companyId), [projects, companyId])

  function resetSub() {
    setRegionId(''); setNewRegionName(''); setNewRegionCode('')
    setStoreName(''); setSubStore(''); setBranchCode(''); setProjectOn(false); setProjectId('')
  }
  function pickSubRole(v: SubRole) { setSubRole(v); setErr(''); setResult(null); resetSub() }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setResult(null)
    const payload: Record<string, unknown> = { full_name: fullName, email, phone, address, companyId }
    if (subRole === 'executive') payload.action = 'invite_executive'
    else if (subRole === 'regional_manager') {
      payload.action = 'invite_rm'
      if (regionId === NEW) { payload.newRegionName = newRegionName; payload.newRegionCode = newRegionCode }
      else payload.regionId = regionId
      if (projectOn && projectId) payload.projectId = projectId
    } else {
      payload.action = 'invite_sm'; payload.regionId = regionId
      payload.storeName = storeName; payload.subStore = subStore; payload.branchCode = branchCode
    }
    try {
      const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult({ message: data.message ?? 'Done.', actionLink: data.actionLink ?? null })
      setFullName(''); setEmail(''); setPhone(''); setAddress(''); resetSub()
      router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const submitLabel = subRole === 'executive' ? 'Create Executive & send invite'
    : subRole === 'regional_manager' ? 'Create Regional Manager & send invite'
    : 'Create Store Manager & send invite'

  return (
    <Modal onClose={onClose}>
      {close => (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Invite account</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Under <span className="font-medium text-[var(--text)]">{companyName}</span></p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([['executive', 'Executive', Crown], ['regional_manager', 'Regional Manager', Building2], ['store_manager', 'Store Manager', Store]] as const).map(([val, label, Icon]) => (
              <button key={val} type="button" onClick={() => pickSubRole(val)}
                className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border-2 text-center text-xs font-semibold transition ${subRole === val ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                <Icon size={16} className={subRole === val ? 'text-emerald-500' : 'text-[var(--text-muted)]'} /> {label}
              </button>
            ))}
          </div>

          {subRole === 'executive' && (
            <p className="text-xs text-[var(--text-faint)]">Optional — a company can run without an Executive. The Executive owns this company/estate.</p>
          )}

          {subRole === 'regional_manager' && (
            <Field label={projectOn ? 'Region (optional)' : 'Region'} required={!projectOn}>
              <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)} required={!projectOn}>
                <option value="">{projectOn ? 'Leave unassigned — project view only' : 'Select a region…'}</option>
                {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                <option value={NEW}>＋ New region…</option>
              </select>
            </Field>
          )}
          {subRole === 'regional_manager' && regionId === NEW && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="New region name" required><input className={input} value={newRegionName} onChange={e => setNewRegionName(e.target.value)} placeholder="Gauteng" required /></Field>
              <Field label="Region code" required><input className={input} value={newRegionCode} onChange={e => setNewRegionCode(e.target.value.toUpperCase())} placeholder="GP" required /></Field>
            </div>
          )}
          {subRole === 'regional_manager' && companyProjects.length > 0 && (
            <div className="rounded-xl ring-1 ring-[var(--border)] p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                <input type="checkbox" checked={projectOn} onChange={e => { setProjectOn(e.target.checked); if (!e.target.checked) setProjectId('') }} className="accent-emerald-600" />
                Invite this manager to a specific project
              </label>
              {projectOn && (
                <select className={input} value={projectId} onChange={e => setProjectId(e.target.value)} required>
                  <option value="">Select a project…</option>
                  {companyProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          )}

          {subRole === 'store_manager' && (
            <Field label="Region (optional)">
              <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)}>
                <option value="">Leave unassigned — link to a region later in Hierarchy</option>
                {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
              </select>
            </Field>
          )}
          {subRole === 'store_manager' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Store name" required><input className={input} value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Acme Sandton" required /></Field>
              <Field label="Branch name"><input className={input} value={subStore} onChange={e => setSubStore(e.target.value)} placeholder="Sandton City" /></Field>
              <Field label="Branch code" required><input className={input} value={branchCode} onChange={e => setBranchCode(e.target.value.toUpperCase())} placeholder="SND01" required /></Field>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-3 space-y-3">
            <Field label="Full name" required><input className={input} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Email" required><input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" required /></Field>
              <Field label="Phone"><input className={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 71 234 5678" /></Field>
            </div>
            <Field label="Address"><input className={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Cape Town" /></Field>
          </div>

          {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
          {result && (
            <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3 space-y-2">
              <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={14} /> {result.message}</p>
              {result.actionLink && (
                <button type="button" onClick={() => { navigator.clipboard?.writeText(result.actionLink!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"><Copy size={12} /> {copied ? 'Copied!' : 'Copy activation link'}</button>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">Done</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {busy ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  )
}
