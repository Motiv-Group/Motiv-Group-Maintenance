'use client'

// "Generate report" on the RM project page — POSTs to the report route, receives the
// PDF, and triggers a download with a spinner while it renders (a few seconds).
import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'

export function ProjectReportButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function generate() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Could not generate the report.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(projectName || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'project'}-report.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><FileText size={15} /> Generate report</>}
      </button>
      {err && <span className="text-right text-xs text-red-500">{err}</span>}
    </div>
  )
}
