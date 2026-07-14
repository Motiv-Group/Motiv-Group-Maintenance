'use client'

import Link from 'next/link'
import { FolderKanban, ArrowRight, CalendarDays } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/lib/projects/types'
import { PROJECT_STATUS_PILL } from '@/components/projects/statusStyles'
import { stageLabel } from '@/lib/projects/progress'
import type { ProjectSummary } from '@/lib/projects/data'

export function RegionalProjectsClient({ projects }: { projects: ProjectSummary[] }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <FolderKanban size={20} className="text-blue-500" /> Projects
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Live rollout progress across all sites.</p>
      </div>

      {projects.length === 0 && (
        <Card className="p-12 text-center">
          <FolderKanban size={34} className="mx-auto text-[var(--text-faint)]" />
          <p className="mt-3 text-sm font-medium text-[var(--text)]">No projects to show yet</p>
          <p className="text-xs text-[var(--text-muted)]">Projects will appear here once they’re set up.</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <Link key={p.id} href={`/regional/projects/${p.id}`} className="group">
            <Card className="overflow-hidden h-full transition group-hover:ring-blue-500/40 group-hover:-translate-y-0.5">
              {/* Cover */}
              <div className="relative h-28 bg-gradient-to-br from-blue-600 to-slate-800">
                {p.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white truncate">{p.name}</h2>
                    <p className="text-[11px] text-white/80 truncate">{p.client_name ?? ''}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 ${PROJECT_STATUS_PILL[p.status].replace(/bg-[^ ]+/, '')}`}>
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">{stageLabel(p.progress)}</span>
                    <span className="text-lg font-bold tabular-nums text-[var(--text)]">{p.progress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 text-center">
                  <MiniN label="Stores" value={p.storeCount} />
                  <MiniN label="Done" value={p.completed} tone="good" />
                  <MiniN label="Active" value={p.inProgress} tone="info" />
                  <MiniN label="Overdue" value={p.overdue} tone={p.overdue ? 'bad' : 'default'} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
                  <span className="flex items-center gap-1"><CalendarDays size={12} /> {formatDate(p.start_date) || '—'} → {formatDate(p.end_date) || '—'}</span>
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold group-hover:gap-1.5 transition-all">View <ArrowRight size={12} /></span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function MiniN({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'info' ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text)]'
  return (
    <div>
      <div className={`text-base font-bold leading-none ${c}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--text-faint)] mt-1">{label}</div>
    </div>
  )
}
