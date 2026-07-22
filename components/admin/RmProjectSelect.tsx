'use client'

// Per-RM project-access picker shown on each Regional Manager row in the Accounts
// card. An RM sees only the projects assigned here (project_regional_users) — none,
// one, or many. A trigger shows the current count; tapping it opens a bottom-sheet
// checklist that persists via /api/admin/hierarchy (action set_rm_projects).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderKanban, Loader2, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

export type RmProjectOpt = { id: string; name: string }

export function RmProjectSelect({ companyId, rmUserId, projects, initial }: {
  companyId: string
  rmUserId: string
  projects: RmProjectOpt[]
  initial: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<string[]>(initial) // last persisted selection
  const count = saved.length

  const label =
    count === 0 ? 'No projects'
    : count === projects.length ? 'All projects'
    : `${count} of ${projects.length} projects`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-[var(--border)] bg-[var(--surface)] px-2.5 h-8 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--hover)] transition"
      >
        <FolderKanban size={13} className="text-[var(--text-faint)]" />
        <span className={count === 0 ? 'text-amber-600 dark:text-amber-400' : ''}>{label}</span>
      </button>
      {open && (
        <ProjectPickerModal
          companyId={companyId}
          rmUserId={rmUserId}
          projects={projects}
          initial={saved}
          onClose={() => setOpen(false)}
          onSaved={next => { setSaved(next); router.refresh() }}
        />
      )}
    </>
  )
}

function ProjectPickerModal({ companyId, rmUserId, projects, initial, onClose, onSaved }: {
  companyId: string
  rmUserId: string
  projects: RmProjectOpt[]
  initial: string[]
  onClose: () => void
  onSaved: (next: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const allOn = projects.length > 0 && sel.length === projects.length

  async function save(close: () => void) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/hierarchy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_rm_projects', companyId, userId: rmUserId, projectIds: sel }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      onSaved(sel); close()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  return (
    <Modal onClose={onClose}>
      {close => (
        <>
          <div>
            <h3 className="text-lg font-bold text-[var(--text)]">Project access</h3>
            <p className="text-sm text-[var(--text-muted)]">Choose which projects this regional manager can see. They see only what&rsquo;s ticked — leave all off for none.</p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-faint)]">{sel.length} of {projects.length} selected</span>
            <button type="button" onClick={() => setSel(allOn ? [] : projects.map(p => p.id))}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <ul className="space-y-1.5">
            {projects.map(p => {
              const on = sel.includes(p.id)
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition ${on ? 'bg-blue-500/10 ring-blue-500/40 text-[var(--text)]' : 'ring-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 ${on ? 'bg-blue-600 ring-blue-600 text-white' : 'ring-[var(--border)]'}`}>
                      {on && <Check size={13} />}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {err && <p className="text-sm text-red-500">{err}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={busy}
              className="flex-1 h-11 rounded-xl ring-1 ring-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--hover)] transition disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={() => save(close)} disabled={busy}
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />} Save
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
