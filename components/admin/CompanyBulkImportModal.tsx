'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'

type Role = 'executive' | 'regional_manager' | 'store_manager'

// Columns WITHOUT company_name — the company is fixed (injected below).
const ROLES: { value: Role; label: string; cols: string }[] = [
  { value: 'executive', label: 'Executives', cols: 'full_name, email, phone, address' },
  { value: 'regional_manager', label: 'Regional Managers', cols: 'region_name, region_code, full_name, email, phone, address' },
  { value: 'store_manager', label: 'Store Managers', cols: 'region_name, region_code, store_name, branch_name, branch_code, full_name, email, phone, address' },
]

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))
  return lines.slice(1).map(line => {
    const cols = line.split(sep)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim().replace(/^["']|["']$/g, '') })
    return row
  }).filter(r => r.email)
}

export function CompanyBulkImportModal({ companyName, onClose }: { companyName: string; onClose: () => void }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>('store_manager')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [results, setResults] = useState<{ label: string; ok: boolean; error?: string }[] | null>(null)

  async function importRows() {
    setErr(''); setResults(null)
    const parsed = parseCsv(text)
    if (!parsed.length) { setErr('No rows with an email found — check the header row and columns.'); return }
    // Force the company on every row so the shared bulk action resolves this company.
    const rows = parsed.map(r => ({ ...r, company_name: companyName }))
    setBusy(true)
    try {
      const res = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk', role, rows }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResults(data.results ?? []); router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const cols = ROLES.find(r => r.value === role)!.cols
  const okCount = results?.filter(r => r.ok).length ?? 0
  const failCount = results?.filter(r => !r.ok).length ?? 0

  return (
    <Modal onClose={onClose}>
      {close => (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Bulk import accounts</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Into <span className="font-medium text-[var(--text)]">{companyName}</span> — CSV, one role at a time.</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => (
              <button key={r.value} type="button" onClick={() => { setRole(r.value); setResults(null); setErr('') }}
                className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition ${role === r.value ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                {r.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">First row = headers. Columns: <span className="font-mono text-[var(--text)]">{cols}</span>. Region matched by name (created if new). Each new account gets an email activation link.</p>

          <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
            placeholder={`region_name,region_code,store_name,branch_name,branch_code,full_name,email,phone,address\nGauteng,GP,Acme Sandton,Sandton City,SND01,Jane Smith,jane@acme.com,0712345678,123 Main St`}
            className="w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-xs font-mono placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60" />

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl ring-1 ring-[var(--border)] text-sm text-[var(--text)] cursor-pointer hover:bg-[var(--hover)] transition shrink-0">
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
            </label>
            <button onClick={importRows} disabled={busy || !text.trim()} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50">
              {busy ? 'Importing…' : 'Import & invite'}
            </button>
          </div>

          {err && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{err}</p>}
          {results && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--text)]">{okCount} created{failCount ? `, ${failCount} failed` : ''}.</p>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.ok ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> : <XCircle size={13} className="text-red-500 shrink-0" />}
                    <span className="text-[var(--text)] truncate">{r.label}</span>
                    {!r.ok && <span className="text-red-500 truncate">— {r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" onClick={close} className="w-full py-2.5 rounded-xl ring-1 ring-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition">Done</button>
        </div>
      )}
    </Modal>
  )
}
