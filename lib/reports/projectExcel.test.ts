import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildProjectExcel } from './projectExcel'
import type { ProjectRow, ProjectSummary, StoreRow } from '@/lib/projects/data'

// The builder only reads a handful of fields; cast lightweight fixtures rather than
// constructing every DB column.
const project = { id: 'p1', name: 'Test Rollout', client_name: 'Acme Retail' } as unknown as ProjectRow
const summary = { status: 'on_site', progress: 62, completed: 1 } as unknown as ProjectSummary

const store = (over: Partial<StoreRow>): StoreRow => ({
  id: 'x', project_id: 'p1', branch_code: 'X', store_name: null, town: null, status: 'on_site',
  progress: 0, overdue: false, start_date: null, end_date: null,
  on_site_completed_at: null, before_photos_completed_at: null, after_photos_completed_at: null,
  signoff_completed_at: null, ...over,
} as unknown as StoreRow)

// Intentionally out of date order in the input — CPT starts after JHB.
const stores: StoreRow[] = [
  store({ id: 'cpt', branch_code: 'CPT-002', store_name: 'Claremont', status: 'on_site', progress: 24, start_date: '2026-06-15', end_date: '2026-07-20' }),
  store({ id: 'jhb', branch_code: 'JHB-001', store_name: 'Sandton', status: 'complete', progress: 100, start_date: '2026-06-01', end_date: '2026-06-15', on_site_completed_at: '2026-06-02T08:00:00Z', signoff_completed_at: '2026-06-15T14:00:00Z' }),
]

describe('buildProjectExcel', () => {
  it('produces a valid, styled xlsx with real date cells sorted by start date', async () => {
    const buf = await buildProjectExcel(project, summary, stores, '22 Jul 2026', '#0e1016')
    expect(Buffer.isBuffer(buf)).toBe(true)
    // xlsx is a zip → 'PK' magic bytes.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(buf.length).toBeGreaterThan(2000)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Stores')
    expect(ws).toBeTruthy()
    expect(ws!.getCell(1, 1).value).toBe('Test Rollout') // banner

    // Locate branch-code rows and prove JHB (earlier start) sorts before CPT.
    let jhbRow = -1, cptRow = -1, sawDateCell = false
    ws!.eachRow((row, idx) => {
      const first = row.getCell(1).value
      if (first === 'JHB-001') jhbRow = idx
      if (first === 'CPT-002') cptRow = idx
      row.eachCell(cell => { if (cell.value instanceof Date) sawDateCell = true })
    })
    expect(jhbRow).toBeGreaterThan(0)
    expect(cptRow).toBeGreaterThan(0)
    expect(jhbRow).toBeLessThan(cptRow) // date-order sort
    expect(sawDateCell).toBe(true)      // dates are real date cells, not strings

    // Frozen header + autofilter are present.
    expect(ws!.views?.[0]?.state).toBe('frozen')
    expect(ws!.autoFilter).toBeTruthy()
  })

  it('handles an empty store list without throwing', async () => {
    const buf = await buildProjectExcel(project, { ...summary, completed: 0 } as ProjectSummary, [], '22 Jul 2026')
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})
