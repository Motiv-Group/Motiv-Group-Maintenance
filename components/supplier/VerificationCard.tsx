'use client'

import { useEffect, useState } from 'react'
import { uploadOne } from '@/lib/upload'
import { Card } from '@/components/exec/ui'
import { ShieldCheck, Upload, CheckCircle2, FileText } from 'lucide-react'

// Pending self-signup suppliers see this on the dashboard: an "under review"
// explainer + the verification-document checklist. Uploads go straight to the
// PRIVATE supplier-docs bucket; a small POST records the reference for the
// admin review queue.
const DOC_TYPES = [
  { kind: 'cipc', label: 'Company registration (CIPC)' },
  { kind: 'vat_cert', label: 'VAT certificate (if registered)' },
  { kind: 'insurance', label: 'Public liability insurance' },
  { kind: 'qualification', label: 'Trade qualification / licence' },
] as const

interface Doc { id: string; kind: string; url: string; uploadedAt: string }

export function VerificationCard() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [verified, setVerified] = useState(false)
  const [busyKind, setBusyKind] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/supplier/verification-docs').then(r => r.json()).then(d => { setDocs(d.docs ?? []); setVerified(!!d.verified) }).catch(() => {})
  }, [])

  async function upload(kind: string, file: File) {
    setBusyKind(kind); setError('')
    try {
      const url = await uploadOne(file, 'supplier-docs')
      const res = await fetch('/api/supplier/verification-docs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, url }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save the document')
      const d = await fetch('/api/supplier/verification-docs').then(r => r.json())
      setDocs(d.docs ?? []); setVerified(!!d.verified)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed — try again.')
    } finally {
      setBusyKind(null)
    }
  }

  const has = (kind: string) => docs.some(d => d.kind === kind)

  return (
    <Card className={`p-5 space-y-4 ring-1 ${verified ? 'ring-emerald-500/30' : 'ring-amber-500/30'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${verified ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-500'}`}><ShieldCheck size={18} /></span>
        <div>
          <h2 className="font-semibold text-[var(--text)]">{verified ? 'Your account is verified' : 'Your account is under review'}</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {verified
              ? <>You&apos;re all set and can be assigned work. Keep these documents current — replace any that expire.</>
              : <>Motiv verifies every supplier before work is assigned. Upload the documents below to speed up your approval — you&apos;ll be notified the moment you&apos;re live. You can keep using the app while you wait.</>}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {DOC_TYPES.map(d => (
          <li key={d.kind} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm text-[var(--text)] min-w-0">
              {has(d.kind)
                ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                : <FileText size={16} className="shrink-0 text-[var(--text-faint)]" />}
              <span className="truncate">{d.label}</span>
            </span>
            <label className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition ${
              has(d.kind)
                ? 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            } ${busyKind === d.kind ? 'opacity-60 pointer-events-none' : ''}`}>
              <Upload size={13} /> {busyKind === d.kind ? 'Uploading…' : has(d.kind) ? 'Replace' : 'Upload'}
              <input type="file" accept="application/pdf,image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(d.kind, f); e.target.value = '' }} />
            </label>
          </li>
        ))}
      </ul>

      {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}
      <p className="text-[11px] text-[var(--text-faint)]">PDF or photo, up to 15 MB. Documents are stored privately and only visible to the Motiv review team.</p>
    </Card>
  )
}
