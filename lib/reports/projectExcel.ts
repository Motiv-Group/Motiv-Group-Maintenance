import 'server-only'
import ExcelJS from 'exceljs'
import type { ProjectRow, ProjectSummary, StoreRow } from '@/lib/projects/data'

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', on_site: 'On site', before_complete: 'Before done', after_complete: 'After done', complete: 'Complete',
}

const SA_TZ = 'Africa/Johannesburg' // dates display in SA time, matching formatDate()
const DATE_FMT = 'dd mmm yyyy'

// Palette (ARGB). Mirrors the PDF report's neutrals so both exports read as one brand.
const WHITE = 'FFFFFFFF'
const MUTED = 'FF5B616E'
const LINE = 'FFE5E7EB'
const ZEBRA = 'FFF5F6F8'
const BRAND_FALLBACK = 'FF0E1016'

const thinSide = { style: 'thin' as const, color: { argb: LINE } }
const border = { top: thinSide, left: thinSide, bottom: thinSide, right: thinSide }

function hexToArgb(hex?: string): string {
  if (!hex) return BRAND_FALLBACK
  const h = hex.replace('#', '').trim()
  if (h.length === 6) return ('FF' + h).toUpperCase()
  if (h.length === 8) return h.toUpperCase()
  return BRAND_FALLBACK
}

// A real, Excel-sortable date cell. exceljs serialises a JS Date via the host's
// LOCAL getters, so a naive `new Date(iso)` can display the wrong calendar day on a
// server in another timezone. We resolve the instant to its South-African calendar
// day (what formatDate shows) and anchor it at UTC-noon — far enough from either
// midnight that no host timezone shifts the day. Returns undefined for a blank cell.
function saDateCell(v: string | null | undefined): Date | undefined {
  if (!v) return undefined
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(v))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const y = get('year'), m = get('month'), d = get('day')
  if (!y || !m || !d) return undefined
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

const COLS: { label: string; width: number; align: 'left' | 'center' }[] = [
  { label: 'Branch code', width: 16, align: 'left' },
  { label: 'Store', width: 26, align: 'left' },
  { label: 'Town', width: 18, align: 'left' },
  { label: 'Status', width: 14, align: 'left' },
  { label: 'Progress %', width: 11, align: 'center' },
  { label: 'Start date', width: 13, align: 'center' },
  { label: 'End date', width: 13, align: 'center' },
  { label: 'On site', width: 13, align: 'center' },
  { label: 'Before', width: 13, align: 'center' },
  { label: 'After', width: 13, align: 'center' },
  { label: 'Sign-off', width: 13, align: 'center' },
]
const DATE_COL_FROM = 5 // 0-based: cols 5..10 are dates

// One styled worksheet: a brand banner + project meta block, then one row per store
// with status, progress and milestone dates. Date columns are real date cells so
// Excel sorts/filters them chronologically; rows are pre-sorted by start date.
// Scope filtering (all vs completed) is the caller's job — pass the stores you want.
export async function buildProjectExcel(
  project: ProjectRow,
  summary: ProjectSummary,
  stores: StoreRow[],
  generatedAt: string,
  brandHex?: string,
): Promise<Buffer> {
  const brandArgb = hexToArgb(brandHex)
  const NCOLS = COLS.length

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Motiv'
  const ws = wb.addWorksheet('Stores')
  ws.columns = COLS.map(c => ({ width: c.width }))

  // ── Banner ──
  ws.mergeCells(1, 1, 1, NCOLS)
  const title = ws.getCell(1, 1)
  title.value = project.name
  title.font = { bold: true, size: 16, color: { argb: WHITE } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30

  ws.mergeCells(2, 1, 2, NCOLS)
  const sub = ws.getCell(2, 1)
  sub.value = [project.client_name, 'Project report'].filter(Boolean).join('  ·  ')
  sub.font = { size: 10, color: { argb: MUTED } }
  sub.alignment = { horizontal: 'left', indent: 1 }

  // ── Meta block ──
  const meta: [string, string | number][] = [
    ['Client', project.client_name ?? '—'],
    ['Status', STATUS_LABEL[summary.status] ?? summary.status],
    ['Progress', `${summary.progress}%`],
    ['Stores', stores.length],
    ['Completed', summary.completed],
    ['Generated', generatedAt],
  ]
  let r = 4
  for (const [label, value] of meta) {
    const lc = ws.getCell(r, 1)
    lc.value = label
    lc.font = { bold: true, color: { argb: MUTED } }
    ws.getCell(r, 2).value = value
    r++
  }

  // ── Table header ──
  const headerRowIdx = r + 1 // one blank row between meta and the table
  const hdr = ws.getRow(headerRowIdx)
  COLS.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb } }
    cell.alignment = { vertical: 'middle', horizontal: c.align }
    cell.border = border
  })
  hdr.height = 20

  // ── Data rows: sorted by start date (asc, nulls last), then branch code ──
  const sorted = [...stores].sort((a, b) => {
    const av = a.start_date ? Date.parse(a.start_date) : Number.POSITIVE_INFINITY
    const bv = b.start_date ? Date.parse(b.start_date) : Number.POSITIVE_INFINITY
    if (av !== bv) return av - bv
    return (a.branch_code || '').localeCompare(b.branch_code || '')
  })

  sorted.forEach((s, i) => {
    const row = ws.getRow(headerRowIdx + 1 + i)
    const zebra = i % 2 === 1
    const values: (string | number | Date | undefined)[] = [
      s.branch_code,
      s.store_name ?? '',
      s.town ?? '',
      STATUS_LABEL[s.status] ?? s.status,
      s.progress,
      saDateCell(s.start_date),
      saDateCell(s.end_date),
      saDateCell(s.on_site_completed_at),
      saDateCell(s.before_photos_completed_at),
      saDateCell(s.after_photos_completed_at),
      saDateCell(s.signoff_completed_at),
    ]
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1)
      cell.value = v === undefined ? null : v
      cell.border = border
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      cell.alignment = { horizontal: COLS[ci].align, vertical: 'middle' }
      if (ci === 4) cell.numFmt = '0"%"'
      if (ci >= DATE_COL_FROM) cell.numFmt = DATE_FMT
    })
  })

  // Autofilter across the header + data so every column filters/sorts (dates in true
  // date order because the cells are real dates). Frozen header keeps titles on screen.
  const lastRow = Math.max(headerRowIdx, headerRowIdx + sorted.length)
  ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: lastRow, column: NCOLS } }
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}
