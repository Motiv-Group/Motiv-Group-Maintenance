'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useFileDrop } from '@/components/ui/useFileDrop'
import type { ImportPreview } from '@/lib/projects/import'

interface Counts {
  total: number
  valid: number
  invalid: number
  toCreate: number
  toUpdate: number
  existingOnProject: number
}

export function ImportWizard({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [mode, setMode] = useState<'add_new' | 'update'>('add_new')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function runPreview(f: File) {
    setBusy(true)
    setErr(null)
    const form = new FormData()
    form.append('file', f)
    form.append('mode', 'preview')
    const res = await fetch(`/api/projects/${projectId}/import`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(data?.error ?? 'Could not read the file')
      return
    }
    setPreview(data.preview)
    setCounts(data.counts)
    setMode(data.counts.existingOnProject > 0 ? 'update' : 'add_new')
  }

  function addFiles(files: File[]) {
    const f = files[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    setCounts(null)
    runPreview(f)
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: addFiles,
    accept: '.xlsx,.xls,.csv',
    multiple: false,
    disabled: busy,
  })

  async function confirmImport(close: () => void) {
    if (!file) return
    setBusy(true)
    setErr(null)
    const form = new FormData()
    form.append('file', file)
    form.append('mode', mode)
    const res = await fetch(`/api/projects/${projectId}/import`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(data?.error ?? 'Import failed')
      return
    }
    setDone(`${data.created} created${data.updated ? `, ${data.updated} updated` : ''}${data.skipped ? `, ${data.skipped} skipped` : ''}.`)
    router.refresh()
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {(close) => (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-blue-500" /> Import stores from Excel
          </h2>

          {done ? (
            <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={18} /> {done}
            </div>
          ) : (
            <>
              <label
                {...dropProps}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-500 ring-2 ring-blue-500 bg-blue-500/5' : 'border-[var(--border)] hover:bg-[var(--hover)]'
                }`}
              >
                <UploadCloud size={26} className={isDragging ? 'text-blue-500' : 'text-[var(--text-faint)]'} />
                <span className="text-sm text-[var(--text)]">{isDragging ? 'Drop file here' : file ? file.name : 'Choose or drop an .xlsx or .csv file'}</span>
                <span className="text-[11px] text-[var(--text-faint)]">Columns: Branch Code · Store Name · Town · RFID m² · Start · End</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onPick} />
              </label>

              {busy && !counts && <p className="text-xs text-[var(--text-muted)]">Reading spreadsheet…</p>}

              {counts && preview && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="Rows" value={counts.total} />
                    <Stat label="Valid" value={counts.valid} tone="good" />
                    <Stat label="To create" value={counts.toCreate} tone="info" />
                    <Stat label="Invalid" value={counts.invalid} tone={counts.invalid ? 'bad' : 'default'} />
                  </div>

                  {preview.missingColumns.length > 0 && (
                    <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle size={14} /> Missing required column(s): {preview.missingColumns.join(', ')}
                    </div>
                  )}

                  {preview.invalid.length > 0 && (
                    <div className="rounded-lg ring-1 ring-[var(--border)] max-h-40 overflow-auto">
                      <table className="w-full text-[11px]">
                        <thead className="text-[var(--text-faint)]">
                          <tr>
                            <th className="text-left px-2 py-1">Row</th>
                            <th className="text-left px-2 py-1">Branch</th>
                            <th className="text-left px-2 py-1">Issues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.invalid.map((iss) => (
                            <tr key={iss.row} className="border-t border-[var(--border)]">
                              <td className="px-2 py-1 text-[var(--text-muted)]">{iss.row}</td>
                              <td className="px-2 py-1 text-[var(--text)]">{iss.data.branch_code || '—'}</td>
                              <td className="px-2 py-1 text-amber-600 dark:text-amber-400">{iss.errors.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {counts.existingOnProject > 0 && (
                    <div className="text-xs">
                      <p className="text-[var(--text-muted)] mb-1">
                        {counts.existingOnProject} store(s) already on this project. How should matching branch codes be handled?
                      </p>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-1.5 text-[var(--text)]">
                          <input type="radio" checked={mode === 'add_new'} onChange={() => setMode('add_new')} /> Add new only
                        </label>
                        <label className="flex items-center gap-1.5 text-[var(--text)]">
                          <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} /> Update existing + add new
                        </label>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--text-faint)]">Updating never deletes photos, sign-off files or completed milestones.</p>
                    </div>
                  )}
                </div>
              )}
              {err && <p className="text-xs text-red-500">{err}</p>}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)]">
              {done ? 'Close' : 'Cancel'}
            </button>
            {!done && (
              <button
                onClick={() => confirmImport(close)}
                disabled={busy || !counts || counts.valid === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Confirm import${counts ? ` (${mode === 'update' ? counts.toCreate + counts.toUpdate : counts.toCreate})` : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'info'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-[var(--text)]'
  return (
    <div className="rounded-lg ring-1 ring-[var(--border)] p-2">
      <div className={`text-lg font-bold leading-none ${c}`}>{value}</div>
      <div className="text-[10px] text-[var(--text-faint)] mt-0.5">{label}</div>
    </div>
  )
}
