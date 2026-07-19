'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, FileSpreadsheet, Plus, Download, ChevronRight, Search, StickyNote, Trash2, AlertTriangle, LayoutGrid, List } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { ViewToggle } from '@/components/projects/ViewToggle'
import { AnimatedBar } from '@/components/projects/AnimatedBar'
import { STORE_STATUS_LABEL, STORE_STATUS_PILL, OVERDUE_PILL, PROJECT_STATUS_PILL } from '@/components/projects/statusStyles'
import { stageLabel } from '@/lib/projects/progress'
import { PROJECT_STATUS_LABELS } from '@/lib/projects/types'
import { ProjectFormModal } from './ProjectFormModal'
import { ImportWizard } from './ImportWizard'
import type { ProjectRow, ProjectSummary, StoreRow } from '@/lib/projects/data'
import type { Database } from '@/lib/database.types'

const input = 'rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50'

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'complete' | 'overdue'

/** The project_notes columns selected by loadProjectNotes. */
type ProjectNote = Pick<
  Database['public']['Tables']['project_notes']['Row'],
  'id' | 'project_store_id' | 'body' | 'created_at' | 'created_by'
>

export function AdminProjectDetail({
  project,
  summary,
  stores,
  notes,
}: {
  project: ProjectRow
  summary: ProjectSummary
  stores: StoreRow[]
  notes: ProjectNote[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<'branch' | 'name' | 'progress' | 'start' | 'end'>('branch')
  // Phone-only tile/list switch for the store list (desktop always shows the table).
  const [mobileView, setMobileView] = useState<'grid' | 'list'>('grid')

  const rfidTotal = useMemo(() => stores.reduce((s, r) => s + (r.rfid_m2_required ?? 0), 0), [stores])
  const daysLeft = daysUntil(project.end_date)

  const filtered = useMemo(() => {
    let rows = stores
    const term = q.trim().toLowerCase()
    if (term) rows = rows.filter((r) => [r.store_name, r.branch_code, r.town].some((v) => v?.toLowerCase().includes(term)))
    if (status === 'not_started') rows = rows.filter((r) => r.progress === 0)
    else if (status === 'in_progress') rows = rows.filter((r) => r.progress > 0 && r.progress < 100)
    else if (status === 'complete') rows = rows.filter((r) => r.progress >= 100)
    else if (status === 'overdue') rows = rows.filter((r) => r.overdue)
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sort === 'progress') return b.progress - a.progress
      if (sort === 'name') return (a.store_name ?? '').localeCompare(b.store_name ?? '')
      if (sort === 'start') return (a.start_date ?? '').localeCompare(b.start_date ?? '')
      if (sort === 'end') return (a.end_date ?? '').localeCompare(b.end_date ?? '')
      return a.branch_code.localeCompare(b.branch_code)
    })
    return sorted
  }, [stores, q, status, sort])

  function exportCsv() {
    const headers = ['Branch Code', 'Store Name', 'Town', 'RFID m2', 'Start', 'End', 'Completion %', 'Status', 'On Site', 'Before', 'After', 'Sign-off', 'Last Updated']
    const rows = stores.map((s) => [
      s.branch_code, s.store_name ?? '', s.town ?? '', s.rfid_m2_required ?? '', s.start_date ?? '', s.end_date ?? '',
      String(s.progress), s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status],
      s.on_site_completed_at ? 'Y' : 'N', s.before_photos_completed_at ? 'Y' : 'N', s.after_photos_completed_at ? 'Y' : 'N', s.signoff_completed_at ? 'Y' : 'N',
      s.updated_at,
    ])
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/[^\w]+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-5">
      <Link href="/admin/projects" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← All projects</Link>

      {/* Header */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[var(--text)] truncate">{project.name}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PROJECT_STATUS_PILL[summary.status]}`}>{PROJECT_STATUS_LABELS[summary.status]}</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{project.client_name ?? '—'} · {formatDate(project.start_date) || 'no start'} → {formatDate(project.end_date) || 'no end'}{daysLeft != null && ` · ${daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`}`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <ActionBtn icon={<Pencil size={14} />} label="Edit" onClick={() => setEditing(true)} />
            <ActionBtn icon={<FileSpreadsheet size={14} />} label="Import" onClick={() => setImporting(true)} primary />
            <ActionBtn icon={<Plus size={14} />} label="Add store" onClick={() => setAdding(true)} />
            <ActionBtn icon={<Download size={14} />} label="Export" onClick={exportCsv} />
            <ActionBtn icon={<Trash2 size={14} />} label="Delete" onClick={() => setDeleting(true)} danger />
          </div>
        </div>

        <AnimatedBar pct={summary.progress} stage={stageLabel(summary.progress)} />

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <MiniStat label="Stores" value={summary.storeCount} />
          <MiniStat label="Completed" value={summary.completed} tone="good" />
          <MiniStat label="In progress" value={summary.inProgress} tone="info" />
          <MiniStat label="Not started" value={summary.notStarted} />
          <MiniStat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'bad' : 'default'} />
          <MiniStat label="RFID m²" value={Math.round(rfidTotal)} />
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input className={`${input} w-full pl-8`} placeholder="Search store, branch, town…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
          <option value="overdue">Overdue</option>
        </select>
        <select className={input} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="branch">Sort: Branch</option>
          <option value="name">Sort: Name</option>
          <option value="progress">Sort: Completion</option>
          <option value="start">Sort: Start date</option>
          <option value="end">Sort: End date</option>
        </select>
        {/* Phones pick tile vs list; desktop always uses the table below. */}
        <ViewToggle
          className="sm:hidden"
          value={mobileView}
          onChange={setMobileView}
          options={[{ value: 'grid', icon: LayoutGrid, label: 'Tile view' }, { value: 'list', icon: List, label: 'List view' }]}
        />
      </div>

      {/* Store table */}
      <Card className="overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Completion</th>
                <th className="text-left px-3 py-2 font-semibold">Store</th>
                <th className="text-left px-3 py-2 font-semibold">Branch</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Town</th>
                <th className="text-right px-3 py-2 font-semibold hidden md:table-cell">RFID m²</th>
                <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Start</th>
                <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">End</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/admin/projects/${project.id}/stores/${s.id}`)}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] cursor-pointer"
                >
                  <td className="px-3 py-2 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${s.progress}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-8 text-right">{s.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--text)] max-w-[180px] truncate">{s.store_name ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{s.branch_code}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] hidden md:table-cell">{s.town ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] text-right hidden md:table-cell tabular-nums">{s.rfid_m2_required ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] hidden lg:table-cell">{formatDate(s.start_date) || '—'}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)] hidden lg:table-cell">{formatDate(s.end_date) || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>
                      {s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right"><ChevronRight size={15} className="text-[var(--text-faint)] inline" /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
                    {stores.length === 0 ? 'No stores yet — import a spreadsheet to get started.' : 'No stores match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: tile grid (2-up, compact) or stacked list, user-toggled. */}
        <div className="sm:hidden p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
              {stores.length === 0 ? 'No stores yet — import a spreadsheet to get started.' : 'No stores match your filters.'}
            </div>
          ) : mobileView === 'grid' ? (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/admin/projects/${project.id}/stores/${s.id}`)}
                  className="cursor-pointer space-y-2 rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text)]">{s.store_name ?? '—'}</div>
                    <div className="truncate text-[10px] text-[var(--text-muted)]">{s.branch_code}</div>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`truncate text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>
                      {s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">{s.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${s.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/admin/projects/${project.id}/stores/${s.id}`)}
                  className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text)] truncate">{s.store_name ?? '—'}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{s.branch_code}{s.town ? ` · ${s.town}` : ''}</div>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[s.status]}`}>
                      {s.overdue ? 'Overdue' : STORE_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${s.progress}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-8 text-right">{s.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Internal notes */}
      {notes.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2 mb-2"><StickyNote size={15} className="text-amber-500" /> Internal notes <span className="text-[10px] font-normal text-[var(--text-faint)]">(not visible to the client)</span></h2>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="text-xs text-[var(--text-muted)] border-b border-[var(--border)] last:border-0 pb-2">
                <p className="text-[var(--text)]">{n.body}</p>
                <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{formatDate(n.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {editing && (
        <ProjectFormModal
          mode="edit"
          project={{ id: project.id, name: project.name, client_name: project.client_name, description: project.description, start_date: project.start_date, end_date: project.end_date, status: summary.status }}
          onClose={() => setEditing(false)}
        />
      )}
      {importing && <ImportWizard projectId={project.id} onClose={() => setImporting(false)} />}
      {adding && <AddStoreModal projectId={project.id} onClose={() => setAdding(false)} />}
      {deleting && <DeleteProjectModal projectId={project.id} name={project.name} storeCount={summary.storeCount} onClose={() => setDeleting(false)} />}
    </div>
  )
}

function ActionBtn({ icon, label, onClick, primary, danger }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; danger?: boolean }) {
  const cls = danger
    ? 'ring-1 ring-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10'
    : primary
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]'
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold min-h-[40px] sm:min-h-0 ${cls}`}>
      {icon} {label}
    </button>
  )
}

function DeleteProjectModal({ projectId, name, storeCount, onClose }: { projectId: string; name: string; storeCount: number; onClose: () => void }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function del(close: () => void) {
    setBusy(true)
    setErr(null)
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(false)
      setErr(data?.error ?? 'Delete failed')
      return
    }
    close()
    router.push('/admin/projects')
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      {(close) => (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-red-600 dark:text-red-400 flex items-center gap-2"><AlertTriangle size={18} /> Delete project</h2>
          <p className="text-sm text-[var(--text-muted)]">
            This permanently deletes <b className="text-[var(--text)]">{name}</b>, its <b className="text-[var(--text)]">{storeCount}</b> store{storeCount === 1 ? '' : 's'}, and every uploaded photo and sign-off document. This can’t be undone.
          </p>
          <p className="text-xs text-[var(--text-muted)]">Type the project name to confirm:</p>
          <input
            className="w-full rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-red-500/50"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={name}
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={close} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)]">Cancel</button>
            <button
              onClick={() => del(close)}
              disabled={busy || confirm.trim() !== name.trim()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function MiniStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'info' ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text)]'
  return (
    <div className="rounded-lg ring-1 ring-[var(--border)] p-2.5">
      <div className={`text-xl font-bold leading-none ${c}`}>{value}</div>
      <div className="text-[10px] text-[var(--text-faint)] mt-1">{label}</div>
    </div>
  )
}

function AddStoreModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({ branch_code: '', store_name: '', town: '', rfid_m2_required: '', start_date: '', end_date: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(close: () => void) {
    if (!f.branch_code.trim()) return setErr('Branch code is required')
    setBusy(true)
    setErr(null)
    const res = await fetch(`/api/projects/${projectId}/stores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setErr(data?.error ?? 'Failed')
    close()
    router.refresh()
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      {(close) => (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-[var(--text)]">Add store</h2>
          <input className={`${input} w-full`} placeholder="Branch code *" value={f.branch_code} onChange={set('branch_code')} />
          <input className={`${input} w-full`} placeholder="Store name" value={f.store_name} onChange={set('store_name')} />
          <input className={`${input} w-full`} placeholder="Town" value={f.town} onChange={set('town')} />
          <input className={`${input} w-full`} placeholder="RFID m²" inputMode="decimal" value={f.rfid_m2_required} onChange={set('rfid_m2_required')} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className={`${input} w-full`} value={f.start_date} onChange={set('start_date')} />
            <input type="date" className={`${input} w-full`} value={f.end_date} onChange={set('end_date')} />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={close} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)]">Cancel</button>
            <button onClick={() => submit(close)} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Adding…' : 'Add store'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const end = new Date(date)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}
