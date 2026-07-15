import { describe, it, expect } from 'vitest'
import { parseImportRows, parseImportMatrix, detectHeaderRow, parseDate, parseRfid, mapHeaders, type RawRow } from './import'

describe('mapHeaders — alias matching, order/count independent', () => {
  it('maps the spec headers', () => {
    const m = mapHeaders(['Branch Code', 'Store Name', 'Town', 'RFID m² Required', 'Start Date', 'End Date'])
    expect(m).toEqual({
      branch_code: 'Branch Code',
      store_name: 'Store Name',
      town: 'Town',
      rfid_m2_required: 'RFID m² Required',
      start_date: 'Start Date',
      end_date: 'End Date',
    })
  })
  it('accepts aliases (Centre→store, Finish date→end, m2 spelling)', () => {
    const m = mapHeaders(['branch', 'Centre', 'RFID m2 Required', 'Finish date'])
    expect(m.store_name).toBe('Centre')
    expect(m.rfid_m2_required).toBe('RFID m2 Required')
    expect(m.end_date).toBe('Finish date')
    expect(m.branch_code).toBe('branch')
  })
})

describe('parseDate — common formats + Excel serials', () => {
  it('ISO', () => expect(parseDate('2026-07-14')).toEqual({ iso: '2026-07-14', ok: true }))
  it('dd/mm/yyyy (SA day-first)', () => expect(parseDate('14/07/2026')).toEqual({ iso: '2026-07-14', ok: true }))
  it('d Mon yyyy', () => expect(parseDate('14 Jul 2026')).toEqual({ iso: '2026-07-14', ok: true }))
  it('JS Date', () => expect(parseDate(new Date(Date.UTC(2026, 6, 14))).iso).toBe('2026-07-14'))
  it('Excel serial 46217 → 2026-07-14', () => expect(parseDate(46217)).toEqual({ iso: '2026-07-14', ok: true }))
  it('empty is ok/null, garbage is not ok', () => {
    expect(parseDate('')).toEqual({ iso: null, ok: true })
    expect(parseDate(null)).toEqual({ iso: null, ok: true })
    expect(parseDate('not a date')).toEqual({ iso: null, ok: false })
    expect(parseDate('32/13/2026')).toEqual({ iso: null, ok: false })
  })
})

describe('parseRfid', () => {
  it('numbers + numeric strings', () => {
    expect(parseRfid(12.5)).toEqual({ value: 12.5, ok: true })
    expect(parseRfid('12.5')).toEqual({ value: 12.5, ok: true })
    expect(parseRfid('12 m²')).toEqual({ value: 12, ok: true })
  })
  it('empty ok/null; non-numeric not ok', () => {
    expect(parseRfid('')).toEqual({ value: null, ok: true })
    expect(parseRfid('abc')).toEqual({ value: null, ok: false })
  })
})

describe('parseImportRows — validation + derived count', () => {
  const row = (o: Partial<Record<string, unknown>>): RawRow => ({
    'Branch Code': '', 'Store Name': '', Town: '', 'RFID m² Required': '', 'Start Date': '', 'End Date': '', ...o,
  })

  it('derives store count from valid rows (not hardcoded)', () => {
    const rows = [
      row({ 'Branch Code': 'B001', 'Store Name': 'Alpha', 'RFID m² Required': 10, 'Start Date': '2026-01-01', 'End Date': '2026-01-10' }),
      row({ 'Branch Code': 'B002', 'Store Name': 'Beta', 'RFID m² Required': 20, 'Start Date': '2026-02-01', 'End Date': '2026-02-10' }),
    ]
    const p = parseImportRows(rows)
    expect(p.valid).toHaveLength(2)
    expect(p.invalid).toHaveLength(0)
    expect(p.totalRows).toBe(2)
    expect(p.valid[0]).toMatchObject({ branch_code: 'B001', store_name: 'Alpha', rfid_m2_required: 10, start_date: '2026-01-01', end_date: '2026-01-10' })
  })

  it('flags missing branch code as invalid, but still imports it as a warning row', () => {
    const p = parseImportRows([row({ 'Store Name': 'NoCode' })])
    expect(p.valid).toHaveLength(0)
    expect(p.invalid[0].errors).toContain('Missing branch code')
  })

  it('flags duplicate branch codes within the sheet (2nd occurrence)', () => {
    const rows = [
      row({ 'Branch Code': 'B001', 'Store Name': 'A' }),
      row({ 'Branch Code': 'b001', 'Store Name': 'B' }), // case-insensitive dup
    ]
    const p = parseImportRows(rows)
    expect(p.valid).toHaveLength(1)
    expect(p.invalid).toHaveLength(1)
    expect(p.invalid[0].errors.some((e) => e.startsWith('Duplicate branch code'))).toBe(true)
  })

  it('flags end-before-start', () => {
    const p = parseImportRows([row({ 'Branch Code': 'B1', 'Store Name': 'X', 'Start Date': '2026-05-01', 'End Date': '2026-04-01' })])
    expect(p.invalid[0].errors).toContain('End date is before start date')
  })

  it('skips fully-empty rows (blank lines above/below data)', () => {
    const rows = [row({}), row({ 'Branch Code': 'B1', 'Store Name': 'X' }), row({})]
    const p = parseImportRows(rows)
    expect(p.totalRows).toBe(1)
    expect(p.valid).toHaveLength(1)
  })

  it('reports missing required columns when the header is absent', () => {
    const p = parseImportRows([{ Foo: 'bar', 'Store Name': 'X' }])
    expect(p.missingColumns).toContain('branch_code')
  })
})

describe('parseImportMatrix — header auto-detect + extra columns', () => {
  it('skips title/blank rows above the header row and ignores extra columns', () => {
    const matrix: unknown[][] = [
      ['TFG Volpes RFID Shielding Rollout'], // title row
      [], // blank
      ['Team', 'Page Name', 'Branch Code', 'Brand', 'Centre', 'Town', 'RFID m² Required', 'Start date', 'Finish date', 'Day count'],
      ['Team A', 'GP01', 'B001', 'Volpes', 'Alpha Store', 'Johannesburg', 12, '2026-01-01', '2026-01-10', 9],
      ['Team A', 'GP01', 'B002', 'Volpes', 'Beta Store', 'Cape Town', 20, '2026-02-01', '2026-02-10', 9],
    ]
    const p = parseImportMatrix(matrix)
    expect(p.missingColumns).toHaveLength(0)
    expect(p.valid).toHaveLength(2)
    // Centre → store name; extra columns (Team/Brand/Day count) ignored.
    expect(p.valid[0]).toMatchObject({ branch_code: 'B001', store_name: 'Alpha Store', town: 'Johannesburg', rfid_m2_required: 12, start_date: '2026-01-01', end_date: '2026-01-10' })
  })

  it('detectHeaderRow finds the header row index past the preamble', () => {
    const matrix: unknown[][] = [
      ['Some title', ''],
      ['generated 2026', ''],
      ['Branch Code', 'Store Name', 'Town'],
      ['B1', 'X', 'JHB'],
    ]
    expect(detectHeaderRow(matrix)).toBe(2)
  })

  it('handles header on the very first row too', () => {
    const matrix: unknown[][] = [
      ['Branch Code', 'Store Name'],
      ['B1', 'X'],
    ]
    const p = parseImportMatrix(matrix)
    expect(p.valid).toHaveLength(1)
  })
})
