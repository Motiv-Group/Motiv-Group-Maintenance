'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, ChevronRight, AlertTriangle, LayoutGrid, List } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/lib/projects/types'
import { PROJECT_STATUS_PILL } from '@/components/projects/statusStyles'
import { ViewToggle } from '@/components/projects/ViewToggle'
import { ProjectFormModal } from './ProjectFormModal'
import type { ProjectSummary } from '@/lib/projects/data'

export function AdminProjectsClient({ projects, hasCompany, selectedCompanyId, selector }: { projects: ProjectSummary[]; hasCompany: boolean; selectedCompanyId?: string | null; selector?: React.ReactNode }) {
  const [creating, setCreating] = useState(false)
  // Phone-only tile/list switch (desktop keeps its 2-up tile grid).
  const [mobileView, setMobileView] = useState<'grid' | 'list'>('grid')

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

      {selector}

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

      {hasCompany && projects.length > 0 && (
        <>
          {/* Phone-only tile/list switch. */}
          <div className="flex justify-end sm:hidden">
            <ViewToggle
              value={mobileView}
              onChange={setMobileView}
              options={[{ value: 'grid', icon: LayoutGrid, label: 'Tile view' }, { value: 'list', icon: List, label: 'List view' }]}
            />
          </div>

          {/* Mobile: compact 2-up tiles or a stacked list. */}
          <div className="sm:hidden">
            {mobileView === 'grid' ? (
              <div className="grid grid-cols-2 gap-2">
                {projects.map((p) => (
                  <Link key={p.id} href={`/admin/projects/${p.id}`}>
                    {/* flex-col + grow name: status row + bar pin to the tile bottom so rows align. */}
                    <Card className="flex h-full flex-col gap-2 p-3">
                      <div className="min-w-0 grow">
                        {/* Primary name never ellipsizes on mobile — wrap to two lines instead. */}
                        <h2 className="line-clamp-2 break-words text-sm font-bold text-[var(--text)]">{p.name}</h2>
                        <p className="truncate text-[10px] text-[var(--text-muted)]">{p.client_name ?? '—'}</p>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`truncate text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PROJECT_STATUS_PILL[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text)]">{p.progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${p.progress}%` }} />
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">{p.storeCount} stores{p.overdue > 0 && <span className="text-red-600 dark:text-red-400"> · {p.overdue} overdue</span>}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="divide-y divide-[var(--border)]">
                {projects.map((p) => (
                  <Link key={p.id} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-medium text-[var(--text)]">{p.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{p.client_name ?? '—'} · {p.storeCount} stores{p.overdue > 0 ? ` · ${p.overdue} overdue` : ''}</p>
                    </div>
                    {/* Fixed-width % and pill columns so every row lines up. */}
                    <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{p.progress}%</span>
                    <span className={`inline-flex w-[88px] shrink-0 justify-center whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full ${PROJECT_STATUS_PILL[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                    <ChevronRight size={14} className="shrink-0 text-[var(--text-faint)]" />
                  </Link>
                ))}
              </Card>
            )}
          </div>

          {/* Desktop: the original 2-up tile grid, unchanged. */}
          <div className="hidden gap-3 sm:grid sm:grid-cols-2">
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
        </>
      )}

      {creating && <ProjectFormModal mode="create" companyId={selectedCompanyId ?? null} onClose={() => setCreating(false)} />}
    </div>
  )
}
