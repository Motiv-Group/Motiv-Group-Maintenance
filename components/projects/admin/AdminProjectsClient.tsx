'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, ChevronRight, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/lib/projects/types'
import { PROJECT_STATUS_PILL } from '@/components/projects/statusStyles'
import { ProjectFormModal } from './ProjectFormModal'
import type { ProjectSummary } from '@/lib/projects/data'

export function AdminProjectsClient({ projects, hasCompany }: { projects: ProjectSummary[]; hasCompany: boolean }) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
            <FolderKanban size={20} className="text-blue-500" /> Projects
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Manage rollout projects — import stores, upload evidence, track completion.</p>
        </div>
        {hasCompany && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} /> Create project
          </button>
        )}
      </div>

      {!hasCompany && (
        <Card className="p-4 flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Your admin account isn’t linked to a company, so projects can’t be scoped yet. Link a company to the account to enable this feature.
        </Card>
      )}

      {hasCompany && projects.length === 0 && (
        <Card className="p-10 text-center">
          <FolderKanban size={32} className="mx-auto text-[var(--text-faint)]" />
          <p className="mt-3 text-sm font-medium text-[var(--text)]">No projects yet</p>
          <p className="text-xs text-[var(--text-muted)]">Create a project, then import its stores from a spreadsheet.</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <Link key={p.id} href={`/admin/projects/${p.id}`}>
            <Card className="p-4 h-full transition hover:ring-blue-500/40 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[var(--text)] truncate">{p.name}</h2>
                  <p className="text-xs text-[var(--text-muted)] truncate">{p.client_name ?? '—'}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${PROJECT_STATUS_PILL[p.status]}`}>
                  {PROJECT_STATUS_LABELS[p.status]}
                </span>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-[var(--text-muted)] mb-1">
                  <span>{p.storeCount} stores</span>
                  <span className="font-semibold text-[var(--text)]">{p.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${p.progress}%` }} />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="text-emerald-600 dark:text-emerald-400">{p.completed} done</span>
                <span className="text-blue-600 dark:text-blue-400">{p.inProgress} active</span>
                <span>{p.notStarted} not started</span>
                {p.overdue > 0 && <span className="text-red-600 dark:text-red-400">{p.overdue} overdue</span>}
                <ChevronRight size={14} className="ml-auto text-[var(--text-faint)]" />
              </div>
              <p className="mt-2 text-[10px] text-[var(--text-faint)]">Updated {formatDate(p.updated_at)}</p>
            </Card>
          </Link>
        ))}
      </div>

      {creating && <ProjectFormModal mode="create" onClose={() => setCreating(false)} />}
    </div>
  )
}
