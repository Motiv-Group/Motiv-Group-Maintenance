'use client'

// Submit COC & POC — full-page form (styled like the Send Quote form). COC
// document + completion (after) photos required; before photos + invoice
// optional. Uploads evidence then submits the ticket for sign-off.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

async function uploadTo(bucket: string, ticketId: string, file: File): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user?.id}/${ticketId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
async function addEvidence(ticketId: string, kind: string, url: string) {
  const res = await fetch('/api/supplier/ticket-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, action: 'add_evidence', kind, url }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
}

export function SubmitCompletionForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [coc, setCoc] = useState<File | null>(null)
  const [after, setAfter] = useState<File[]>([])
  const [before, setBefore] = useState<File[]>([])
  const [invoice, setInvoice] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit() {
    if (!coc) { setErr('Attach the Certificate of Completion (COC).'); return }
    if (!after.length) { setErr('Add at least one completion (after) photo.'); return }
    setBusy(true); setErr('')
    try {
      await addEvidence(ticketId, 'coc', await uploadTo('completion-docs', ticketId, coc))
      for (const f of after) await addEvidence(ticketId, 'after_photo', await uploadTo('ticket-photos', ticketId, f))
      for (const f of before) await addEvidence(ticketId, 'before_photo', await uploadTo('ticket-photos', ticketId, f))
      if (invoice) await addEvidence(ticketId, 'invoice', await uploadTo('completion-docs', ticketId, invoice))
      const res = await fetch(`/api/tickets/${ticketId}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit_completion', notes: notes || null }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Submit failed')
      router.push(`/supplier/tickets/${ticketId}`); router.refresh()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const fileRow = (label: string, hint: string, onPick: (files: File[]) => void, multiple: boolean, picked: number) => (
    <div>
      <label className="block text-sm font-medium text-[var(--text)] mb-1">{label}{hint && <span className="text-[var(--text-faint)] font-normal"> {hint}</span>}</label>
      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-[var(--border)] text-sm text-[var(--text-muted)] cursor-pointer hover:border-[#C6A35D]/50 transition">
        <UploadCloud size={16} /> {picked ? `${picked} file${picked > 1 ? 's' : ''} selected` : `Choose file${multiple ? 's' : ''}`}
        <input type="file" multiple={multiple} accept="image/*,application/pdf" className="hidden" onChange={e => onPick(Array.from(e.target.files ?? []))} />
      </label>
    </div>
  )

  return (
    <div className="rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-5 space-y-4">
      <div className="px-3 py-2 bg-amber-500/10 ring-1 ring-amber-500/30 rounded-lg">
        <p className="text-xs text-amber-700 dark:text-amber-300">⚠ Make sure the COC and completion photos are clear and correct before submitting — the manager reviews these to sign off the job.</p>
      </div>

      {fileRow('Certificate of Completion (COC) *', '(PDF or image)', f => setCoc(f[0] ?? null), false, coc ? 1 : 0)}
      {fileRow('Completion photos (POC) *', '(after — at least one)', setAfter, true, after.length)}
      {fileRow('Before photos', '(optional)', setBefore, true, before.length)}
      {fileRow('Invoice', '(optional)', f => setInvoice(f[0] ?? null), false, invoice ? 1 : 0)}

      <div>
        <label className="block text-sm font-medium text-[var(--text)] mb-1">Notes</label>
        <textarea className={`${input} min-h-[80px]`} placeholder="Anything the manager should know…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Submit COC & POC'}</button>
        <button onClick={() => router.push(`/supplier/tickets/${ticketId}`)} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">Cancel</button>
      </div>
    </div>
  )
}
