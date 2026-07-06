'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Building2, Store, Copy, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

export interface CompanyOpt { id: string; name: string }
export interface RegionOpt { id: string; name: string; companyId: string; code: string }

type Role = 'executive' | 'regional_manager' | 'store_manager'

const ROLE_TABS: { value: Role; label: string; icon: typeof Crown; desc: string }[] = [
  { value: 'executive', label: 'Executive', icon: Crown, desc: 'Owns a company / estate' },
  { value: 'regional_manager', label: 'Regional Manager', icon: Building2, desc: 'Manages a region' },
  { value: 'store_manager', label: 'Store Manager', icon: Store, desc: 'Runs a store' },
]

export function AddAccountForm({ companies, regions }: { companies: CompanyOpt[]; regions: RegionOpt[] }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>('executive')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ message: string; actionLink?: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  // Shared contact
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  // Executive
  const [companyName, setCompanyName] = useState('')
  // RM / SM
  const [companyId, setCompanyId] = useState('')
  const [regionId, setRegionId] = useState('')          // '' | region id | '__new__'
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionCode, setNewRegionCode] = useState('')
  // SM store
  const [storeName, setStoreName] = useState('')
  const [subStore, setSubStore] = useState('')
  const [branchCode, setBranchCode] = useState('')

  const companyRegions = useMemo(() => regions.filter(r => r.companyId === companyId), [regions, companyId])

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-[#C6A35D]/40'

  function reset() {
    setFullName(''); setEmail(''); setPhone(''); setAddress(''); setCompanyName('')
    setCompanyId(''); setRegionId(''); setNewRegionName(''); setNewRegionCode('')
    setStoreName(''); setSubStore(''); setBranchCode('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setResult(null)
    const payload: Record<string, unknown> = { full_name: fullName, email, phone, address }
    if (role === 'executive') { payload.action = 'create_executive'; payload.companyName = companyName }
    else if (role === 'regional_manager') {
      payload.action = 'invite_rm'; payload.companyId = companyId
      if (regionId === '__new__') { payload.newRegionName = newRegionName; payload.newRegionCode = newRegionCode }
      else payload.regionId = regionId
    } else {
      payload.action = 'invite_sm'; payload.companyId = companyId; payload.regionId = regionId
      payload.storeName = storeName; payload.subStore = subStore; payload.branchCode = branchCode
    }
    try {
      const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult({ message: data.message ?? 'Account created.', actionLink: data.actionLink ?? null })
      reset(); router.refresh()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-sm font-bold text-[var(--text)]">Add an account</h2>

      <div className="grid grid-cols-3 gap-2">
        {ROLE_TABS.map(t => (
          <button key={t.value} type="button" onClick={() => { setRole(t.value); setErr(''); setResult(null) }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition ${role === t.value ? 'border-[#C6A35D] bg-[#C6A35D]/10' : 'border-[var(--border)] hover:border-[#C6A35D]/50'}`}>
            <t.icon size={18} className="text-[#C6A35D]" />
            <span className={`text-xs font-semibold ${role === t.value ? 'text-[#C6A35D]' : 'text-[var(--text)]'}`}>{t.label}</span>
            <span className="text-[10px] text-[var(--text-faint)]">{t.desc}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {role === 'executive' && (
          <Field label="Company / Estate name" required><input className={input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Group" required /></Field>
        )}

        {(role === 'regional_manager' || role === 'store_manager') && (
          <Field label="Company" required>
            <select className={input} value={companyId} onChange={e => { setCompanyId(e.target.value); setRegionId('') }} required>
              <option value="">Select a company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        {role === 'regional_manager' && companyId && (
          <Field label="Region" required>
            <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)} required>
              <option value="">Select a region…</option>
              {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
              <option value="__new__">+ New region…</option>
            </select>
          </Field>
        )}
        {role === 'regional_manager' && regionId === '__new__' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="New region name" required><input className={input} value={newRegionName} onChange={e => setNewRegionName(e.target.value)} placeholder="Gauteng" required /></Field>
            <Field label="Region code" required><input className={input} value={newRegionCode} onChange={e => setNewRegionCode(e.target.value.toUpperCase())} placeholder="GP" required /></Field>
          </div>
        )}

        {role === 'store_manager' && companyId && (
          <Field label="Region" required>
            <select className={input} value={regionId} onChange={e => setRegionId(e.target.value)} required>
              <option value="">Select a region…</option>
              {companyRegions.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
            </select>
          </Field>
        )}
        {role === 'store_manager' && (
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
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C6A35D] hover:underline"><Copy size={12} /> {copied ? 'Copied!' : 'Copy activation link'}</button>
            )}
          </div>
        )}

        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-[#C6A35D] hover:brightness-95 text-[#0a0e17] text-sm font-semibold transition disabled:opacity-50">
          {busy ? 'Creating…' : `Create ${ROLE_TABS.find(t => t.value === role)?.label} & send invite`}
        </button>
      </form>
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
