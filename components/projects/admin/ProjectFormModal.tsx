'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/projects/types'

const input = 'w-full rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50'
const label = 'block text-xs font-semibold text-[var(--text-muted)] mb-1'

export interface ProjectFormValues {
  id?: string
  name: string
  client_name: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
}

export function ProjectFormModal({
  mode,
  project,
  onClose,
  companyId,
}: {
  mode: 'create' | 'edit'
  project?: ProjectFormValues
  onClose: () => void
  companyId?: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client_name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [start, setStart] = useState(project?.start_date ?? '')
  const [end, setEnd] = useState(project?.end_date ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(close: () => void) {
    if (!name.trim()) {
      setErr('Project name is required')
      return
    }
    setBusy(true)
    setErr(null)
    const payload: Record<string, unknown> = {
      name: name.trim(),
      client_name: client.trim() || null,
      description: description.trim() || null,
      start_date: start || null,
      end_date: end || null,
      status,
    }
    if (mode === 'create' && note.trim()) payload.internal_note = note.trim()
    if (mode === 'create' && companyId) payload.companyId = companyId
    const url = mode === 'create' ? '/api/projects' : `/api/projects/${project!.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(data?.error ?? 'Something went wrong')
      return
    }
    close()
    if (mode === 'create' && data?.id) router.push(`/admin/projects/${data.id}`)
    else router.refresh()
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      {(close) => (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[var(--text)]">{mode === 'create' ? 'Create project' : 'Edit project'}</h2>
          <div>
            <label className={label}>Project name *</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="TFG Volpes RFID Shielding Rollout" />
          </div>
          <div>
            <label className={label}>Client / company</label>
            <input className={input} value={client} onChange={(e) => setClient(e.target.value)} placeholder="TFG" />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Start date</label>
              <input type="date" className={input} value={start ?? ''} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className={label}>End date</label>
              <input type="date" className={input} value={end ?? ''} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>Status</label>
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.filter((s) => s !== 'archived').map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          {mode === 'create' && (
            <div>
              <label className={label}>Internal note (admin only)</label>
              <textarea className={input} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not visible to the client." />
            </div>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)]">
              Cancel
            </button>
            <button
              onClick={() => submit(close)}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : mode === 'create' ? 'Create project' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
