'use client'

import Link from 'next/link'
import { FolderKanban, FolderOpen, CheckCircle2, AlertTriangle, ArrowRight, CalendarDays } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '@/lib/projects/types'
import { PROJECT_STATUS_PILL } from '@/components/projects/statusStyles'
import { AnimatedBar } from '@/components/projects/AnimatedBar'
import { milestoneCounts, stageLabel, MILESTONE_LABELS } from '@/lib/projects/progress'
import type { ProjectSummary, StoreRow } from '@/lib/projects/data'

interface Featured {
  summary: ProjectSummary
  project: any
  stores: StoreRow[]
}

export function RegionalProjectsClient({ projects, featured }: { projects: ProjectSummary[]; featured: Featured | null }) {
  const totalProjects = projects.length
  const active = projects.filter((p) => p.status === 'active').length
  const completed = projects.filter((p) => p.status === 'complete').length
  const overdue = projects.filter((p) => p.overdue > 0).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <FolderKanban size={20} className="text-blue-500" /> Projects
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">Live rollout progress across all sites.</p>
      </div>

      {totalProjects === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban size={34} className="mx-auto text-[var(--text-faint)]" />
          <p className="mt-3 text-sm font-medium text-[var(--text)]">No projects to show yet</p>
          <p className="text-xs text-[var(--text-muted)]">Projects will appear here once they’re set up.</p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<FolderOpen size={16} />} label="Total Projects" hint="Across all time" value={totalProjects} tone="info" />
            <StatCard icon={<FolderKanban size={16} />} label="Active" hint="In progress" value={active} tone="info" />
            <StatCard icon={<CheckCircle2 size={16} />} label="Completed" hint="Delivered" value={completed} tone="good" />
            <StatCard icon={<AlertTriangle size={16} />} label="Overdue" hint="Requires attention" value={overdue} tone={overdue ? 'bad' : 'default'} />
          </div>

          {/* Featured project */}
          {featured && <FeaturedCard f={featured} />}

          {/* Milestone progress + timeline */}
          {featured && (
            <div className="grid gap-4 lg:grid-cols-2">
              <MilestoneCard f={featured} />
              <TimelineCard project={featured.project} />
            </div>
          )}

          {/* Recent / all projects */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[var(--text)]">Recent Projects</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {projects.map((p) => (
                <Link key={p.id} href={`/regional/projects/${p.id}`} className="flex items-center gap-3 py-2.5 group">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]"><FolderKanban size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{p.client_name ?? '—'}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${p.progress}%` }} /></div>
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)] w-8 text-right">{p.progress}%</span>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${PROJECT_STATUS_PILL[p.status]}`}>{PROJECT_STATUS_LABELS[p.status]}</span>
                  <ArrowRight size={15} className="text-[var(--text-faint)] group-hover:text-blue-500 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function FeaturedCard({ f }: { f: Featured }) {
  const { summary: s, project } = f
  const daysLeft = daysUntil(project.end_date)
  return (
    <Link href={`/regional/projects/${project.id}`} className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50">
      <Card className="overflow-hidden transition hover:ring-2 hover:ring-blue-500/60 hover:-translate-y-0.5">
      <div className="relative p-5 text-white overflow-hidden">
        {/* Background: the project's own cover if set, else the default project image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.coverUrl || '/projects/project-bed-linen.png'} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/75 via-black/55 to-black/70 transition group-hover:from-black/70 group-hover:via-black/45" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Two lines on phones; one truncated line from sm up. */}
              <h2 className="text-xl font-bold line-clamp-2 sm:line-clamp-1">{project.name}</h2>
              <p className="text-xs text-white/70">{project.client_name ?? ''}</p>
            </div>
            <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/90 ${PROJECT_STATUS_PILL[s.status].replace(/bg-[^ ]+/, '')}`}>{PROJECT_STATUS_LABELS[s.status]}</span>
          </div>

          <AnimatedBar pct={s.progress} label="Overall Project Completion" stage={stageLabel(s.progress)} />

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <HeroStat label="Total Stores" value={s.storeCount} />
            <HeroStat label="Completed" value={s.completed} tone="good" />
            <HeroStat label="In Progress" value={s.inProgress} tone="info" />
            <HeroStat label="Not Started" value={s.notStarted} />
            <HeroStat label="Overdue" value={s.overdue} tone={s.overdue ? 'bad' : 'default'} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-white/80">
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap"><CalendarDays size={13} /> {formatDate(project.start_date) || '—'} → {formatDate(project.end_date) || '—'}</span>
              {daysLeft != null && <span className="whitespace-nowrap text-white/60">· {daysLeft >= 0 ? `${daysLeft} days remaining` : `${-daysLeft} days overdue`}</span>}
            </span>
            <span className="flex items-center gap-1 font-semibold text-white group-hover:gap-1.5 transition-all">View Project <ArrowRight size={13} /></span>
          </div>
        </div>
      </div>
      </Card>
    </Link>
  )
}

function MilestoneCard({ f }: { f: Featured }) {
  const counts = milestoneCounts(f.stores)
  const total = f.summary.storeCount || 1
  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold text-[var(--text)] mb-3">Milestone Progress</h2>
      <div className="space-y-2.5">
        {(['on_site', 'before_photos', 'after_photos', 'signoff'] as const).map((m) => {
          const n = counts[m]
          return (
            <div key={m} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-[var(--text-muted)]">{MILESTONE_LABELS[m]}</span>
              <span className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${(n / total) * 100}%` }} /></span>
              <span className="w-14 text-right tabular-nums text-[var(--text)]">{n} / {f.summary.storeCount}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function TimelineCard({ project }: { project: any }) {
  const startT = project.start_date ? new Date(project.start_date).getTime() : NaN
  const endT = project.end_date ? new Date(project.end_date).getTime() : NaN
  const hasRange = !Number.isNaN(startT) && !Number.isNaN(endT) && endT > startT
  const frac = hasRange ? elapsedFraction(startT, endT) : 0
  const daysLeft = daysUntil(project.end_date)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Project Timeline</h2>
        <span className="text-[11px] text-[var(--text-faint)]">{formatDate(project.start_date) || '—'} – {formatDate(project.end_date) || '—'}</span>
      </div>
      {hasRange ? (
        <>
          <div className="flex justify-between text-[11px] text-[var(--text-muted)] mb-2">
            <span>{formatDate(project.start_date)}</span>
            <span className="text-blue-500 font-semibold">Today</span>
            <span>{formatDate(project.end_date)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-200 dark:bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: `${frac * 100}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" style={{ left: `${frac * 100}%` }} />
          </div>
          <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
            {daysLeft != null && (daysLeft >= 0 ? <><b className="text-[var(--text)]">{daysLeft}</b> days remaining</> : <span className="text-red-500 font-semibold">{-daysLeft} days overdue</span>)}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">No project dates set.</p>
      )}
    </Card>
  )
}

function StatCard({ icon, label, hint, value, tone = 'default' }: { icon: React.ReactNode; label: string; hint: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c = tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : tone === 'info' ? 'text-blue-500' : 'text-[var(--text-muted)]'
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-1.5 text-[11px] font-medium ${c}`}>{icon}<span className="text-[var(--text-muted)]">{label}</span></div>
      <div className="text-2xl font-bold text-[var(--text)] mt-1.5 leading-none">{value}</div>
      <div className="text-[10px] text-[var(--text-faint)] mt-1">{hint}</div>
    </Card>
  )
}

function HeroStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'bad' | 'info' }) {
  const c = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : tone === 'info' ? 'text-blue-200' : 'text-white'
  return (
    <div className="rounded-lg bg-white/10 p-2 text-center">
      <div className={`text-lg font-bold leading-none ${c}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-white/60 mt-1">{label}</div>
    </div>
  )
}

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

// Fraction of the project window elapsed (0–1). Module helper so the render body
// never calls Date.now() directly (react-hooks/purity).
function elapsedFraction(startT: number, endT: number): number {
  return Math.max(0, Math.min(1, (Date.now() - startT) / (endT - startT)))
}
