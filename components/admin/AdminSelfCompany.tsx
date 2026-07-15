'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, AlertTriangle } from 'lucide-react'

const input = 'rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50'

// Lets the system_admin link their own account to a company (needed for the Projects
// feature). Shows the current link + a picker / create-new. Hidden concern: without a
// company_id, /admin/projects can't scope anything.
export function AdminSelfCompany({
  currentCompanyId,
  currentCompanyName,
  companies,
}: {
  currentCompanyId: string | null
  currentCompanyName: string | null
  companies: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'existing' | 'new'>(companies.length ? 'existing' : 'new')
  const [companyId, setCompanyId] = useState(currentCompanyId ?? companies[0]?.id ?? '')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function save() {
    setBusy(true)
    setErr(null)
    setOk(false)
    const payload = mode === 'new' ? { newCompanyName: newName.trim() } : { companyId }
    const res = await fetch('/api/admin/self-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(data?.error ?? 'Failed')
      return
    }
    setOk(true)
    router.refresh()
  }

  const linked = !!currentCompanyId

  return (
    <div className={`rounded-2xl bg-[var(--surface)] ring-1 p-4 ${linked ? 'ring-[var(--border)]' : 'ring-amber-500/40'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={16} className="text-blue-500" />
        <h2 className="text-sm font-bold text-[var(--text)]">My company</h2>
        {linked ? (
          <span className="ml-auto text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={12} /> Linked to {currentCompanyName ?? 'a company'}</span>
        ) : (
          <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> Not linked</span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Your admin account must be linked to a company to manage Projects. {linked ? 'You can switch it below.' : 'Pick an existing company or create one.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {companies.length > 0 && (
          <div className="flex rounded-lg ring-1 ring-[var(--border)] overflow-hidden text-xs">
            <button onClick={() => setMode('existing')} className={`px-3 py-2.5 sm:py-1.5 ${mode === 'existing' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'}`}>Existing</button>
            <button onClick={() => setMode('new')} className={`px-3 py-2.5 sm:py-1.5 ${mode === 'new' ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)]'}`}>Create new</button>
          </div>
        )}

        {mode === 'existing' && companies.length > 0 ? (
          <select className={`${input} w-full sm:w-auto min-w-0`} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input className={`${input} w-full sm:w-auto min-w-0`} placeholder="New company name (e.g. Motiv)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        )}

        <button
          onClick={save}
          disabled={busy || (mode === 'new' ? !newName.trim() : !companyId)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : linked ? 'Update' : 'Link company'}
        </button>
      </div>

      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      {ok && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Saved. Projects is now enabled.</p>}
    </div>
  )
}
