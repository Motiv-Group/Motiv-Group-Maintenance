'use client'

// Supplier ticket page — submit (or resubmit) a quote, or decline the invite,
// for the competitive-quoting model.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

export function SupplierQuoteCard({ ticketId, alreadyQuoted }: { ticketId: string; alreadyQuoted: boolean }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [vat, setVat] = useState('')
  const [desc, setDesc] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!n || n <= 0) { setErr('Enter a valid amount.'); return }
    setBusy(true); setErr('')
    try {
      await post(`/api/tickets/${ticketId}/submit-quote`, { amount: n, amount_incl_vat: vat ? Number(vat) : null, description: desc || null, file_url: fileUrl || null })
      router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  async function decline() {
    setBusy(true); setErr('')
    try { await post(`/api/tickets/${ticketId}/decline-invite`, { reason: reason || null }); router.refresh() }
    catch (e: any) { setErr(e.message); setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {alreadyQuoted && <p className="text-xs text-emerald-600 dark:text-emerald-400">Quote submitted — awaiting a decision. You can resubmit a revised quote below.</p>}
      <input className={input} type="number" inputMode="decimal" placeholder="Quote amount (R)" value={amount} onChange={e => setAmount(e.target.value)} required />
      <input className={input} type="number" inputMode="decimal" placeholder="Amount incl. VAT (optional)" value={vat} onChange={e => setVat(e.target.value)} />
      <textarea className={`${input} min-h-[70px]`} placeholder="Short description of the quote" value={desc} onChange={e => setDesc(e.target.value)} />
      <input className={input} type="url" placeholder="Attachment URL (optional)" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold disabled:opacity-50">{busy ? '…' : alreadyQuoted ? 'Resubmit quote' : 'Submit quote'}</button>
        {!declining
          ? <button type="button" onClick={() => setDeclining(true)} className="px-3 py-2 rounded-lg ring-1 ring-red-500/40 text-red-600 dark:text-red-400 text-sm font-semibold">Decline</button>
          : <button type="button" onClick={decline} disabled={busy} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Confirm decline</button>}
      </div>
      {declining && <input className={input} placeholder="Reason for declining (optional)" value={reason} onChange={e => setReason(e.target.value)} />}
    </form>
  )
}
