'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Copy, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'

const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

// Invite a supplier under a FIXED company. Reuses an existing supplier org
// (matched by email) or creates + invites a new one.
export function SupplierInviteModal({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const router = useRouter()
  const [supplierName, setSupplierName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ message: string; actionLink?: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite_supplier', companyId, supplierName, email, phone, address }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult({ message: data.message ?? 'Done.', actionLink: data.actionLink ?? null })
      setSupplierName(''); setEmail(''); setPhone(''); setAddress('')
      router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={onClose}>
      {close => (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Invite supplier</h2>
              <p className="text-xs text-[var(--text-muted)]">To <span className="font-medium text-[var(--text)]">{companyName}</span></p>
            </div>
          </div>

          <Field label="Supplier / company name"><input className={input} value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="BrightSpark Electrical" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email" required><input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ops@brightspark.co.za" required /></Field>
            <Field label="Phone"><input className={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 71 234 5678" /></Field>
          </div>
          <Field label="Address"><input className={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="12 Trade Rd, Cape Town" /></Field>
          <p className="text-[11px] text-[var(--text-faint)]">If this supplier is already on Motiv, they’re linked to {companyName} and notified. Otherwise they get a set-up email to onboard.</p>

          {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
          {result && (
            <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3 space-y-2">
              <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={14} /> {result.message}</p>
              {result.actionLink && (
                <button type="button" onClick={() => { navigator.clipboard?.writeText(result.actionLink!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"><Copy size={12} /> {copied ? 'Copied!' : 'Copy onboarding link'}</button>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">Done</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {busy ? 'Sending…' : 'Invite supplier'}
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
