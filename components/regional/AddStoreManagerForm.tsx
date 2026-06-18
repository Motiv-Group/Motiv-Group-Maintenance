'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, CheckCircle } from 'lucide-react'
import { Card } from '@/components/exec/ui'

/** RM-only: create a store + its store-manager login in one step.
 *  Posts the `create_store_manager` action to /api/provision. */
export function AddStoreManagerForm() {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/50'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_store_manager', ...vals }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed to create account')
      setMsg({ ok: true, text: d.message ?? 'Store manager account created.' })
      setVals({})
      router.refresh()
    } catch (e: any) {
      setMsg({ ok: false, text: e.message })
    } finally { setBusy(false) }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Manager full name"><input className={input} value={vals.full_name ?? ''} onChange={set('full_name')} placeholder="e.g. Thabo Mokoena" required /></Field>
        <Field label="Manager email"><input className={input} type="email" value={vals.email ?? ''} onChange={set('email')} placeholder="manager@store.co.za" required /></Field>
        <Field label="Temporary password (min 8)"><input className={input} type="password" value={vals.password ?? ''} onChange={set('password')} placeholder="At least 8 characters" minLength={8} required /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Branch code"><input className={`${input} uppercase font-mono`} value={vals.branch_code ?? ''} onChange={e => setVals(v => ({ ...v, branch_code: e.target.value.toUpperCase() }))} placeholder="e.g. CPT001" required /></Field>
          <Field label="Store / branch name"><input className={input} value={vals.store_name ?? ''} onChange={set('store_name')} placeholder="e.g. Canal Walk" required /></Field>
        </div>
        <Field label="Manager phone (optional)"><input className={input} value={vals.phone ?? ''} onChange={set('phone')} placeholder="+27 ..." /></Field>

        <button disabled={busy} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition disabled:opacity-60">
          <UserPlus size={16} /> {busy ? 'Creating…' : 'Create store manager account'}
        </button>

        {msg && (
          <p className={`text-sm flex items-center gap-1.5 ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {msg.ok && <CheckCircle size={15} />}{msg.text}
          </p>
        )}
      </form>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-[var(--text-muted)] mb-1">{label}</label>{children}</div>
}
