'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Store, Copy, CheckCircle2, Crown } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface CompanyOpt { id: string; name: string }
export interface RegionOpt { id: string; name: string; companyId: string; code: string }

type SubRole = 'regional_manager' | 'store_manager'
const NEW = '__new__'

// Company-first: pick (or create) a company once, then add people under it.
//  · "+ New company / estate…"  → create the company + its Executive owner
//  · an existing company        → add a Regional Manager or Store Manager under it
// The company is chosen a single time up top and never repeated per role.
export function AddAccountForm({ companies, regions }: { companies: CompanyOpt[]; regions: RegionOpt[] }) {
  const router = useRouter()
  const [companySel, setCompanySel] = useState('')      // '' | company id | NEW
  const [subRole, setSubRole] = useState<SubRole>('regional_manager')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ message: string; actionLink?: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  // Shared contact
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  // New company (Executive owner)
  const [companyName, setCompanyName] = useState('')
  // RM / SM
  const [regionId, setRegionId] = useState('')          // '' | region id | NEW
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionCode, setNewRegionCode] = useState('')
  // SM store
  const [storeName, setStoreName] = useState('')
  const [subStore, setSubStore] = useState('')
  const [branchCode, setBranchCode] = useState('')

  const isNew = companySel === NEW
  const isExisting = companySel !== '' && companySel !== NEW
  const companyRegions = useMemo(() => regions.filter(r => r.companyId === companySel), [regions, companySel])

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  function resetSubFields() {
    setRegionId(''); setNewRegionName(''); setNewRegionCode('')
    setStoreName(''); setSubStore(''); setBranchCode(''); setCompanyName('')
  }
  function pickCompany(v: string) {
    setCompanySel(v); setErr(''); setResult(null); setSubRole('regional_manager'); resetSubFields()
  }
  function pickSubRole(v: SubRole) {
    setSubRole(v); setErr(''); setResult(null)
    setRegionId(''); setNewRegionName(''); setNewRegionCode(''); setStoreName(''); setSubStore(''); setBranchCode('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setResult(null)
    const payload: Record<string, unknown> = { full_name: fullName, email, phone, address }
    if (isNew) { payload.action = 'create_executive'; payload.companyName = companyName }
    else if (subRole === 'regional_manager') {
      payload.action = 'invite_rm'; payload.companyId = companySel
      if (regionId === NEW) { payload.newRegionName = newRegionName; payload.newRegionCode = newRegionCode }
      else payload.regionId = regionId
    } else {
      payload.action = 'invite_sm'; payload.companyId = companySel; payload.regionId = regionId
      payload.storeName = storeName; payload.subStore = subStore; payload.branchCode = branchCode
    }
    try {
      const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult({ message: data.message ?? 'Account created.', actionLink: data.actionLink ?? null })
      // Keep the chosen company so several people can be added under it in a row.
      setFullName(''); setEmail(''); setPhone(''); setAddress(''); resetSubFields()
      router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const submitLabel = isNew ? 'Executive' : subRole === 'regional_manager' ? 'Regional Manager' : 'Store Manager'

  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-bold text-[var(--text)]">Add an account</h2>

      {/* Step 1 — Company drives everything below. */}
      <Field label="Company" required>
        <select className={input} value={companySel} onChange={e => pickCompany(e.target.value)} required>
          <option value="">Select a company…</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value={NEW}>＋ New company / estate…</option>
        </select>
      </Field>

      {companySel === '' && (
        <p className="text-xs text-[var(--text-faint)]">Pick a company to add a Regional Manager or Store Manager under it — or choose “＋ New company / estate…” to create a company and its Executive owner.</p>
      )}

      {(isNew || isExisting) && (
        <form onSubmit={submit} className="space-y-3">
          {isNew ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
              <Crown size={14} className="shrink-0 text-[#C6A35D]" /> New company — you’re creating its <span className="font-semibold text-[var(--text)]">Executive</span> (owner).
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {([['regional_manager', 'Regional Manager', Building2], ['store_manager', 'Store Manager', Store]] as const).map(([val, label, Icon]) => (
                <button key={val} type="button" onClick={() => pickSubRole(val)}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 text-xs font-semibold transition ${subRole === val ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                  <Icon size={15} className={subRole === val ? 'text-emerald-500' : ''} /> {label}
                </button>
              ))}
            </div>
          )}

          {isNew && (
            <Field label="Company / Estate name" required><input className={input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Group" required /></Field>
          )}

          {isExisting && subRole === 'regional_manager' && (
            <Field label="Region" required>
              <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)} required>
                <option value="">Select a region…</option>
                {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                <option value={NEW}>＋ New region…</option>
              </select>
            </Field>
          )}
          {isExisting && subRole === 'regional_manager' && regionId === NEW && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="New region name" required><input className={input} value={newRegionName} onChange={e => setNewRegionName(e.target.value)} placeholder="Gauteng" required /></Field>
              <Field label="Region code" required><input className={input} value={newRegionCode} onChange={e => setNewRegionCode(e.target.value.toUpperCase())} placeholder="GP" required /></Field>
            </div>
          )}

          {isExisting && subRole === 'store_manager' && (
            <Field label="Region" required>
              <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)} required>
                <option value="">Select a region…</option>
                {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
              </select>
            </Field>
          )}
          {isExisting && subRole === 'store_manager' && !companyRegions.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400">This company has no regions yet — add a Regional Manager (with a new region) first.</p>
          )}
          {isExisting && subRole === 'store_manager' && (
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

          <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
            {busy ? 'Creating…' : `Create ${submitLabel} & send invite`}
          </button>
        </form>
      )}
    </Card>
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
