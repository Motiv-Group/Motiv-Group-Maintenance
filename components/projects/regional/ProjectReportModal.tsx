'use client'

// Export options for the project report. Lets the RM pick format (Excel / PDF),
// scope (all vs completed stores), and optionally a master ZIP with a folder per
// store (store PDF + before/after/COC photos). POSTs to the report route and
// downloads whatever blob comes back.
import { useState } from 'react'
import { FileText, FileSpreadsheet, FolderArchive, Loader2, Download } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

function Check({ checked, onChange, icon, title, hint }: { checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition ${checked ? 'bg-blue-500/10 ring-blue-500/50' : 'ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">{icon} {title}</span>
        {hint && <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{hint}</span>}
      </span>
    </label>
  )
}

function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition') || ''
  const m = cd.match(/filename="?([^"]+)"?/i)
  return m ? m[1] : fallback
}

export function ProjectReportModal({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const [pdf, setPdf] = useState(true)
  const [excel, setExcel] = useState(false)
  const [scope, setScope] = useState<'all' | 'completed'>('all')
  const [zip, setZip] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const slug = (projectName || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'project'
  const canGenerate = pdf || excel

  async function generate(close: () => void) {
    if (!canGenerate) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf, excel, scope, zip }),
      })
      if (!res.ok) {
        const dj = await res.json().catch(() => ({}))
        throw new Error(dj.error ?? 'Could not generate the report.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filenameFromResponse(res, `${slug}-report`)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      close()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      {close => (
        <>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Generate report</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">Export a summary of the project&rsquo;s stores.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">Format</p>
            <Check checked={pdf} onChange={setPdf} icon={<FileText size={15} className="text-red-500" />} title="PDF" hint="On-brand summary with per-store cards." />
            <Check checked={excel} onChange={setExcel} icon={<FileSpreadsheet size={15} className="text-emerald-500" />} title="Excel (.xlsx)" hint="One row per store: status, progress, milestone dates." />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">Stores</p>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'completed'] as const).map(v => (
                <button key={v} type="button" onClick={() => setScope(v)} aria-pressed={scope === v}
                  className={`h-11 rounded-xl px-3 text-sm font-medium transition ${scope === v ? 'bg-blue-500/10 text-blue-600 ring-2 ring-blue-500 dark:text-blue-400' : 'text-[var(--text)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
                  {v === 'all' ? 'All stores' : 'Completed only'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">Photo bundle</p>
            <Check checked={zip} onChange={setZip} icon={<FolderArchive size={15} className="text-amber-500" />} title="Include per-store ZIP"
              hint="A folder per store, each with the store PDF + before / after / COC photos. Large projects may take a moment." />
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={busy}
              className="h-11 flex-1 rounded-xl px-3 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={() => generate(close)} disabled={busy || !canGenerate}
              className="inline-flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Download size={16} /> Generate</>}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
