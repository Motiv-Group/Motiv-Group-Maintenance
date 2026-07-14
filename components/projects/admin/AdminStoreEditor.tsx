'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { ChevronLeft, ChevronRight, MapPin, Check, X, UploadCloud, Trash2, FileText, RotateCcw, Pencil } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { uploadOne } from '@/lib/upload'
import { SegmentedProgressBar } from '@/components/projects/SegmentedProgressBar'
import { milestoneSteps } from '@/lib/projects/progress'
import type { StoreRow, ProjectFileView } from '@/lib/projects/data'
import type { FileCategory, MilestoneKey } from '@/lib/projects/types'

const input = 'w-full rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50'

export function AdminStoreEditor({
  projectId,
  store,
  project,
  files,
  prevId,
  nextId,
  position,
  total,
}: {
  projectId: string
  store: StoreRow
  project: any
  files: ProjectFileView[]
  prevId: string | null
  nextId: string | null
  position: number
  total: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const before = files.filter((f) => f.category === 'before_photo')
  const after = files.filter((f) => f.category === 'after_photo')
  const signoff = files.filter((f) => f.category === 'signoff_photo' || f.category === 'signoff_document')

  async function upload(category: FileCategory, list: File[]) {
    if (!list.length) return
    setBusy(category)
    setErr(null)
    const items: any[] = []
    for (const f of list) {
      try {
        const url = await uploadOne(f, 'project-files')
        items.push({ url, original_filename: f.name, mime_type: f.type, file_size: f.size })
      } catch {
        setErr(`Upload failed: ${f.name}`)
      }
    }
    if (items.length) {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_store_id: store.id, category, items }),
      })
      if (!res.ok) setErr((await res.json().catch(() => ({})))?.error ?? 'Save failed')
    }
    setBusy(null)
    router.refresh()
  }

  async function removeFile(fileId: string) {
    setBusy(fileId)
    await fetch(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })
    setBusy(null)
    router.refresh()
  }

  async function toggleMilestone(milestone: MilestoneKey, complete: boolean) {
    setBusy(milestone)
    setErr(null)
    const res = await fetch(`/api/projects/${projectId}/stores/${store.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'milestone', milestone, complete }),
    })
    if (!res.ok) setErr((await res.json().catch(() => ({})))?.error ?? 'Update failed')
    setBusy(null)
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-4">
      {/* Nav */}
      <div className="flex items-center justify-between gap-2">
        <Link href={`/admin/projects/${projectId}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← {project.name}</Link>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-faint)] tabular-nums">{position} / {total}</span>
          <NavBtn href={prevId ? `/admin/projects/${projectId}/stores/${prevId}` : null} icon={<ChevronLeft size={16} />} />
          <NavBtn href={nextId ? `/admin/projects/${projectId}/stores/${nextId}` : null} icon={<ChevronRight size={16} />} />
        </div>
      </div>

      {/* Store header */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">{store.store_name ?? store.branch_code}</h1>
            <p className="text-xs text-[var(--text-muted)]">{store.branch_code} · {store.town ?? '—'}{store.rfid_m2_required != null && ` · ${store.rfid_m2_required} m² RFID`}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{formatDate(store.start_date) || 'no start'} → {formatDate(store.end_date) || 'no end'}{store.overdue && <span className="text-red-500 font-semibold"> · Overdue</span>}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]"><Pencil size={13} /> Edit</button>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1.5"><span className="text-[var(--text-muted)]">Store completion</span><span className="font-bold text-[var(--text)]">{store.progress}%</span></div>
          <SegmentedProgressBar steps={milestoneSteps(store)} />
        </div>
      </Card>

      {err && <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 p-2.5 text-xs text-red-600 dark:text-red-400">{err}</div>}

      {/* On Site */}
      <MilestoneCard n={1} title="On Site" done={!!store.on_site_completed_at} date={store.on_site_completed_at}>
        {store.on_site_completed_at ? (
          <button onClick={() => toggleMilestone('on_site', false)} disabled={busy === 'on_site'} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-red-500">
            <RotateCcw size={13} /> Reverse
          </button>
        ) : (
          <button onClick={() => toggleMilestone('on_site', true)} disabled={busy === 'on_site'} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            <MapPin size={14} /> Mark as On Site
          </button>
        )}
      </MilestoneCard>

      {/* Before Photos */}
      <PhotoMilestone
        n={2}
        title="Before Photos"
        category="before_photo"
        milestone="before_photos"
        done={!!store.before_photos_completed_at}
        date={store.before_photos_completed_at}
        files={before}
        busy={busy}
        onUpload={upload}
        onRemove={removeFile}
        onToggle={toggleMilestone}
      />

      {/* After Photos */}
      <PhotoMilestone
        n={3}
        title="After Photos"
        category="after_photo"
        milestone="after_photos"
        done={!!store.after_photos_completed_at}
        date={store.after_photos_completed_at}
        files={after}
        busy={busy}
        onUpload={upload}
        onRemove={removeFile}
        onToggle={toggleMilestone}
      />

      {/* Sign-off */}
      <PhotoMilestone
        n={4}
        title="Sign-off"
        category="signoff_photo"
        milestone="signoff"
        done={!!store.signoff_completed_at}
        date={store.signoff_completed_at}
        files={signoff}
        busy={busy}
        onUpload={upload}
        onRemove={removeFile}
        onToggle={toggleMilestone}
        allowPdf
      />

      {nextId && (
        <div className="flex justify-end">
          <Link href={`/admin/projects/${projectId}/stores/${nextId}`} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Save & next store <ChevronRight size={16} />
          </Link>
        </div>
      )}

      {editing && <EditStoreModal projectId={projectId} store={store} onClose={() => setEditing(false)} />}
    </div>
  )
}

function NavBtn({ href, icon }: { href: string | null; icon: React.ReactNode }) {
  if (!href) return <span className="rounded-lg p-1.5 text-[var(--text-faint)] opacity-40">{icon}</span>
  return <Link href={href} className="rounded-lg p-1.5 ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]">{icon}</Link>
}

function MilestoneCard({ n, title, done, date, children }: { n: number; title: string; done: boolean; date: string | null; children: React.ReactNode }) {
  return (
    <Card className={`p-4 ${done ? 'ring-emerald-500/30' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-[var(--text-muted)]'}`}>
            {done ? <Check size={15} strokeWidth={3} /> : n}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">{title} <span className="text-[11px] font-normal text-[var(--text-faint)]">· 25%</span></h3>
            {done && date && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Completed {formatDate(date)}</p>}
          </div>
        </div>
        {children}
      </div>
    </Card>
  )
}

function PhotoMilestone({
  n, title, category, milestone, done, date, files, busy, onUpload, onRemove, onToggle, allowPdf,
}: {
  n: number
  title: string
  category: FileCategory
  milestone: MilestoneKey
  done: boolean
  date: string | null
  files: ProjectFileView[]
  busy: string | null
  onUpload: (c: FileCategory, files: File[]) => void
  onRemove: (id: string) => void
  onToggle: (m: MilestoneKey, complete: boolean) => void
  allowPdf?: boolean
}) {
  const accept: Record<string, string[]> = allowPdf ? { 'image/*': [], 'application/pdf': [] } : { 'image/*': [] }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ accept, onDrop: (f) => onUpload(category, f) })

  return (
    <Card className={`p-4 space-y-3 ${done ? 'ring-emerald-500/30' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-[var(--text-muted)]'}`}>
            {done ? <Check size={15} strokeWidth={3} /> : n}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">{title} <span className="text-[11px] font-normal text-[var(--text-faint)]">· 25%</span></h3>
            {done && date && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Completed {formatDate(date)}</p>}
          </div>
        </div>
        {done ? (
          <button onClick={() => onToggle(milestone, false)} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-red-500"><RotateCcw size={13} /> Unmark</button>
        ) : (
          <button
            onClick={() => onToggle(milestone, true)}
            disabled={files.length === 0 || busy === milestone}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            title={files.length === 0 ? 'Upload at least one file first' : ''}
          >
            Mark complete
          </button>
        )}
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {files.map((f) => (
            <FileThumb key={f.id} file={f} onRemove={() => onRemove(f.id)} removing={busy === f.id} />
          ))}
        </div>
      )}

      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-4 cursor-pointer transition ${isDragActive ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--border)] hover:bg-[var(--hover)]'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud size={20} className="text-[var(--text-faint)]" />
        <span className="text-xs text-[var(--text-muted)]">{busy === category ? 'Uploading…' : `Drop or click to upload ${title.toLowerCase()}${allowPdf ? ' (images or PDF)' : ''}`}</span>
      </div>
    </Card>
  )
}

function FileThumb({ file, onRemove, removing }: { file: ProjectFileView; onRemove: () => void; removing: boolean }) {
  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden ring-1 ring-[var(--border)] bg-[var(--surface-2)]">
      {file.isImage && file.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.original_filename ?? ''} className="h-full w-full object-cover" /></a>
      ) : (
        <a href={file.url ?? '#'} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
          <FileText size={22} />
          <span className="px-1 text-[9px] text-center truncate w-full">{file.original_filename ?? 'Document'}</span>
        </a>
      )}
      <button
        onClick={onRemove}
        disabled={removing}
        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
      >
        {removing ? <span className="block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> : <Trash2 size={12} />}
      </button>
    </div>
  )
}

function EditStoreModal({ projectId, store, onClose }: { projectId: string; store: StoreRow; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({
    store_name: store.store_name ?? '',
    town: store.town ?? '',
    rfid_m2_required: store.rfid_m2_required?.toString() ?? '',
    start_date: store.start_date ?? '',
    end_date: store.end_date ?? '',
    on_site_note: store.on_site_note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(close: () => void) {
    setBusy(true)
    await fetch(`/api/projects/${projectId}/stores/${store.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', ...f }),
    })
    setBusy(false)
    close()
    router.refresh()
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      {(close) => (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-[var(--text)]">Edit store details</h2>
          <input className={input} placeholder="Store name" value={f.store_name} onChange={set('store_name')} />
          <input className={input} placeholder="Town" value={f.town} onChange={set('town')} />
          <input className={input} placeholder="RFID m²" inputMode="decimal" value={f.rfid_m2_required} onChange={set('rfid_m2_required')} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={input} value={f.start_date} onChange={set('start_date')} />
            <input type="date" className={input} value={f.end_date} onChange={set('end_date')} />
          </div>
          <textarea className={input} rows={2} placeholder="On-site note (visible to client)" value={f.on_site_note} onChange={set('on_site_note')} />
          <div className="flex justify-end gap-2">
            <button onClick={close} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)]">Cancel</button>
            <button onClick={() => submit(close)} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
