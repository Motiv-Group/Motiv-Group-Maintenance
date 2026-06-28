'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { normalisePhone } from '@/lib/csv'

/** RM-only: create a store + its store-manager login in one step.
 *  Posts the `create_store_manager` action to /api/provision. */
export function AddStoreManagerForm() {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  // Reformat the phone to +27 E.164 when the field loses focus.
  const formatPhone = () => { const n = normalisePhone(vals.phone); if (n) setVals(v => ({ ...v, phone: n })) }
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
        <Field label="Temporary password (min 8)">
          <div className="relative">
            <input className={`${input} pr-11`} type={showPw ? 'text' : 'password'} value={vals.password ?? ''} onChange={set('password')} placeholder="At least 8 characters" minLength={8} required />
            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} title={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Branch code"><input className={`${input} uppercase font-mono`} value={vals.branch_code ?? ''} onChange={e => setVals(v => ({ ...v, branch_code: e.target.value.toUpperCase() }))} placeholder="e.g. CPT001" required /></Field>
          <Field label="Store / branch name"><input className={input} value={vals.store_name ?? ''} onChange={set('store_name')} placeholder="e.g. Canal Walk" required /></Field>
        </div>
        <Field label="Manager phone"><input className={input} type="tel" value={vals.phone ?? ''} onChange={set('phone')} onBlur={formatPhone} placeholder="e.g. 0761936165" required /></Field>

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
