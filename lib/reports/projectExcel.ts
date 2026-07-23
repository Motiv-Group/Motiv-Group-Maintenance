import 'server-only'
import * as XLSX from 'xlsx'
import { formatDate } from '@/lib/utils'
import type { ProjectRow, ProjectSummary, StoreRow } from '@/lib/projects/data'

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', on_site: 'On site', before_complete: 'Before done', after_complete: 'After done', complete: 'Complete',
}

// One worksheet: a short project header block, then one row per store with its
// status + milestone dates. Scope filtering (all vs completed) is the caller's job —
// pass the stores you want in the sheet.
export function buildProjectExcel(project: ProjectRow, summary: ProjectSummary, stores: StoreRow[], generatedAt: string): Buffer {
  const d = (v: string | null | undefined) => (v ? formatDate(v) : '')
  const header: (string | number)[][] = [
    ['Project', project.name],
    ['Client', project.client_name ?? ''],
    ['Status', STATUS_LABEL[summary.status] ?? summary.status],
    ['Progress', `${summary.progress}%`],
    ['Stores', stores.length],
    ['Completed', summary.completed],
    ['Generated', generatedAt],
    [],
  ]
  const cols = ['Branch code', 'Store', 'Town', 'Status', 'Progress %', 'Start date', 'End date', 'On site', 'Before', 'After', 'Sign-off']
  const rows: (string | number)[][] = stores.map(s => [
    s.branch_code, s.store_name ?? '', s.town ?? '',
    STATUS_LABEL[s.status] ?? s.status, s.progress,
    d(s.start_date), d(s.end_date),
    d(s.on_site_completed_at), d(s.before_photos_completed_at), d(s.after_photos_completed_at), d(s.signoff_completed_at),
  ])

  const ws = XLSX.utils.aoa_to_sheet([...header, cols, ...rows])
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  // Autofilter on the column-header row so every heading is filterable in Excel.
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: header.length, c: 0 }, e: { r: header.length + rows.length, c: cols.length - 1 } }) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Stores')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
