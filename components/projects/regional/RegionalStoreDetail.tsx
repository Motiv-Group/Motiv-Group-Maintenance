'use client'

import Link from 'next/link'
import { Check, FileText, Download, MapPin } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { formatDate } from '@/lib/utils'
import { SegmentedProgressBar } from '@/components/projects/SegmentedProgressBar'
import { PhotoGallery } from './PhotoGallery'
import { STORE_STATUS_LABEL, STORE_STATUS_PILL, OVERDUE_PILL } from '@/components/projects/statusStyles'
import { milestoneSteps, stageLabel } from '@/lib/projects/progress'
import type { StoreRow, ProjectFileView } from '@/lib/projects/data'

export function RegionalStoreDetail({ projectId, store, project, files }: { projectId: string; store: StoreRow; project: any; files: ProjectFileView[] }) {
  const before = files.filter((f) => f.category === 'before_photo')
  const after = files.filter((f) => f.category === 'after_photo')
  const signoff = files.filter((f) => f.category === 'signoff_photo' || f.category === 'signoff_document')

  const steps = [
    { key: 'on_site', label: 'On Site', at: store.on_site_completed_at, note: store.on_site_note },
    { key: 'before_photos', label: 'Before Photos', at: store.before_photos_completed_at, note: null },
    { key: 'after_photos', label: 'After Photos', at: store.after_photos_completed_at, note: null },
    { key: 'signoff', label: 'Sign-off', at: store.signoff_completed_at, note: null },
  ]

  return (
    <div className="space-y-4">
      <Link href={`/regional/projects/${projectId}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← {project.name}</Link>

      {/* Summary */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-[var(--text)]">{store.store_name ?? store.branch_code}</h1>
            <p className="text-xs text-[var(--text-muted)]">{store.branch_code}{store.town && ` · ${store.town}`}{store.rfid_m2_required != null && ` · ${store.rfid_m2_required} m² RFID`}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{formatDate(store.start_date) || '—'} → {formatDate(store.end_date) || '—'} · Updated {formatDate(store.updated_at)}</p>
          </div>
          <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${store.overdue ? OVERDUE_PILL : STORE_STATUS_PILL[store.status]}`}>{store.overdue ? 'Overdue' : STORE_STATUS_LABEL[store.status]}</span>
        </div>
        <div>
          <div className="flex justify-between items-baseline mb-1.5"><span className="text-xs text-[var(--text-muted)]">{stageLabel(store.progress)}</span><span className="text-xl font-bold tabular-nums text-[var(--text)]">{store.progress}%</span></div>
          <SegmentedProgressBar steps={milestoneSteps(store)} />
        </div>
      </Card>

      {/* Milestone stepper */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-4">Milestones</h2>
        <ol className="relative space-y-4">
          {steps.map((s) => (
            <li key={s.key} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.at ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-[var(--text-faint)]'}`}>
                {s.at ? <Check size={13} strokeWidth={3} /> : ''}
              </span>
              <div className="flex-1 pb-1 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text)]">{s.label}</span>
                  <span className={`text-[11px] ${s.at ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-faint)]'}`}>{s.at ? `Completed ${formatDate(s.at)}` : 'Outstanding'}</span>
                </div>
                {s.note && <p className="mt-1 flex items-start gap-1 text-[11px] text-[var(--text-muted)]"><MapPin size={11} className="mt-0.5 shrink-0" />{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* Galleries */}
      <Card className="p-5 space-y-5">
        <PhotoGallery title="Before Photos" photos={before} />
        <PhotoGallery title="After Photos" photos={after} />
      </Card>

      {/* Sign-off */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Sign-off {signoff.length > 0 && <span className="text-[11px] font-normal text-[var(--text-faint)]">({signoff.length})</span>}</h2>
        {signoff.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No sign-off document uploaded yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {signoff.map((f) => (
              <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg ring-1 ring-[var(--border)] p-2.5 hover:bg-[var(--hover)]">
                {f.isImage && f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt="" className="h-12 w-12 rounded object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text-muted)]"><FileText size={20} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text)] truncate">{f.original_filename ?? (f.isImage ? 'Sign-off photo' : 'Sign-off document')}</p>
                  {f.signatory_name && <p className="text-[10px] text-[var(--text-muted)]">Signed by {f.signatory_name}{f.signed_date && ` · ${formatDate(f.signed_date)}`}</p>}
                  {f.caption && <p className="text-[10px] text-[var(--text-faint)] truncate">{f.caption}</p>}
                </div>
                <Download size={14} className="text-[var(--text-faint)] shrink-0" />
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
