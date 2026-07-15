// Excel/CSV import parsing + validation for project stores (spec §3, §12).
// Pure and testable: the API turns an uploaded .xlsx into row objects via SheetJS
// (XLSX.utils.sheet_to_json) and hands them here. Column count/order is not assumed —
// headers are matched by alias. The store count is DERIVED from the valid rows, never
// hardcoded.

/** One raw spreadsheet row keyed by its original header text. */
export type RawRow = Record<string, unknown>

export interface ParsedStore {
  branch_code: string
  store_name: string | null
  town: string | null
  rfid_m2_required: number | null
  start_date: string | null // ISO yyyy-mm-dd
  end_date: string | null // ISO yyyy-mm-dd
  _row: number // 1-based sheet row (for error messages)
}

export interface RowIssue {
  row: number
  errors: string[]
  data: Partial<ParsedStore>
}

export interface ImportPreview {
  valid: ParsedStore[]
  invalid: RowIssue[]
  totalRows: number // non-empty data rows seen
  missingColumns: string[] // required headers not found in the sheet at all
}

/** Expected field → accepted header aliases (compared case/space/punctuation-insensitively). */
const HEADER_ALIASES: Record<keyof Omit<ParsedStore, '_row'>, string[]> = {
  branch_code: ['branch code', 'branchcode', 'branch', 'store code', 'code'],
  store_name: ['store name', 'storename', 'centre', 'center', 'store', 'name', 'page name store'],
  town: ['town', 'city', 'suburb'],
  rfid_m2_required: ['rfid m2 required', 'rfid m² required', 'rfid m2', 'rfid', 'rfid required', 'rfid sqm', 'm2 required'],
  start_date: ['start date', 'startdate', 'start'],
  end_date: ['end date', 'enddate', 'finish date', 'finishdate', 'finish', 'end'],
}

const REQUIRED_FIELDS: (keyof Omit<ParsedStore, '_row'>)[] = ['branch_code']

function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Map the sheet's headers to our field keys. Returns field → original-header. */
export function mapHeaders(headers: string[]): Partial<Record<keyof Omit<ParsedStore, '_row'>, string>> {
  const normToOriginal = new Map<string, string>()
  for (const h of headers) normToOriginal.set(normaliseHeader(h), h)
  const map: Partial<Record<keyof Omit<ParsedStore, '_row'>, string>> = {}
  for (const field of Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const hit = normToOriginal.get(normaliseHeader(alias))
      if (hit) {
        map[field] = hit
        break
      }
    }
  }
  return map
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Parse a cell into an ISO date (yyyy-mm-dd), or null if empty/unparseable.
 * Handles JS Date (SheetJS cellDates), Excel serial numbers, and common string
 * formats (yyyy-mm-dd, dd/mm/yyyy, d Mon yyyy). Returns { iso, ok } so callers can
 * distinguish "empty" (ok, null) from "present but invalid" (!ok).
 */
export function parseDate(value: unknown): { iso: string | null; ok: boolean } {
  if (value === null || value === undefined || value === '') return { iso: null, ok: true }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, ok: false }
    return { iso: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`, ok: true }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date: days since 1899-12-30 (accounts for the 1900 leap bug).
    const ms = Math.round((value - 25569) * 86400 * 1000) // 25569 = days from 1899-12-30 to 1970-01-01
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return { iso: null, ok: false }
    return { iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, ok: true }
  }

  const s = String(value).trim()
  if (!s) return { iso: null, ok: true }

  // yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return isoFrom(+m[1], +m[2], +m[3])

  // dd/mm/yyyy or dd-mm-yyyy (SA default: day first)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return isoFrom(+m[3], +m[2], +m[1])

  // d Mon yyyy  /  d Month yyyy
  m = s.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mon) return isoFrom(+m[3], mon, +m[1])
  }

  return { iso: null, ok: false }
}

function isoFrom(y: number, mo: number, d: number): { iso: string | null; ok: boolean } {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return { iso: null, ok: false }
  return { iso: `${y}-${pad(mo)}-${pad(d)}`, ok: true }
}

/** Parse an RFID value into a number, or null. { value, ok } distinguishes empty vs invalid. */
export function parseRfid(value: unknown): { value: number | null; ok: boolean } {
  if (value === null || value === undefined || value === '') return { value: null, ok: true }
  if (typeof value === 'number') return Number.isFinite(value) ? { value, ok: true } : { value: null, ok: false }
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  if (!cleaned) return { value: null, ok: false }
  const n = Number(cleaned)
  return Number.isFinite(n) ? { value: n, ok: true } : { value: null, ok: false }
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/**
 * Validate raw spreadsheet rows into a preview. Duplicate branch codes WITHIN the sheet
 * are flagged invalid on their 2nd+ occurrence (can't create two stores with one key).
 * Duplicates against EXISTING project stores are handled server-side (needs the DB).
 */
/**
 * Find the header row in a sheet matrix (array-of-arrays). Real-world spreadsheets
 * often have a title/logo/blank row or two ABOVE the column headers — so we scan the
 * first rows and pick the one that resolves our columns (preferring the first that
 * finds the required branch-code column). Returns 0 if nothing matches.
 */
export function detectHeaderRow(matrix: unknown[][]): number {
  let best = -1
  let bestScore = 0
  const scan = Math.min(matrix.length, 30)
  for (let i = 0; i < scan; i++) {
    const cells = (matrix[i] ?? []).map((c) => (c == null ? '' : String(c).trim())).filter(Boolean)
    if (!cells.length) continue
    const map = mapHeaders(cells)
    const score = Object.keys(map).length
    if (map.branch_code && score >= 2) return i // the real header row
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best >= 0 ? best : 0
}

/** Turn a sheet matrix into header-keyed row objects, skipping everything above the
 *  detected header row and dropping unnamed (extra/blank-header) columns. */
export function matrixToRows(matrix: unknown[][]): RawRow[] {
  if (!matrix.length) return []
  const h = detectHeaderRow(matrix)
  const headers = (matrix[h] ?? []).map((c) => (c == null ? '' : String(c).trim()))
  const out: RawRow[] = []
  for (let i = h + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    const obj: RawRow = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]
      if (!key) continue // unnamed column → skip
      obj[key] = row[j] ?? ''
    }
    out.push(obj)
  }
  return out
}

/** Detect the header row in a raw sheet matrix, then validate (spec §3/§12). Use this
 *  from the API (SheetJS sheet_to_json {header:1}); it tolerates extra columns and
 *  title rows above the headers. */
export function parseImportMatrix(matrix: unknown[][]): ImportPreview {
  return parseImportRows(matrixToRows(matrix))
}

export function parseImportRows(rows: RawRow[]): ImportPreview {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const map = mapHeaders(headers)
  const missingColumns = REQUIRED_FIELDS.filter((f) => !map[f]).map((f) => f)

  const valid: ParsedStore[] = []
  const invalid: RowIssue[] = []
  const seenBranch = new Map<string, number>() // upper(branch) -> first row
  let totalRows = 0

  rows.forEach((raw, i) => {
    const rowNum = i + 2 // +1 for header, +1 for 1-based

    const get = (f: keyof typeof HEADER_ALIASES) => (map[f] ? raw[map[f] as string] : undefined)

    const branch = str(get('branch_code'))
    const storeName = str(get('store_name'))
    const town = str(get('town'))
    // Skip fully-empty rows (blank lines above/below the data).
    const anyValue = [branch, storeName, town, str(get('rfid_m2_required')), str(get('start_date')), str(get('end_date'))].some(Boolean)
    if (!anyValue) return
    totalRows++

    const errors: string[] = []
    const rfid = parseRfid(get('rfid_m2_required'))
    const start = parseDate(get('start_date'))
    const end = parseDate(get('end_date'))

    if (!branch) errors.push('Missing branch code')
    if (!storeName) errors.push('Missing store name')
    if (!rfid.ok) errors.push('Invalid RFID m² value')
    if (!start.ok) errors.push('Invalid start date')
    if (!end.ok) errors.push('Invalid end date')
    if (start.iso && end.iso && end.iso < start.iso) errors.push('End date is before start date')

    if (branch) {
      const key = branch.toUpperCase()
      const first = seenBranch.get(key)
      if (first) errors.push(`Duplicate branch code (also row ${first})`)
      else seenBranch.set(key, rowNum)
    }

    const data: ParsedStore = {
      branch_code: branch ?? '',
      store_name: storeName,
      town,
      rfid_m2_required: rfid.value,
      start_date: start.iso,
      end_date: end.iso,
      _row: rowNum,
    }

    if (errors.length) invalid.push({ row: rowNum, errors, data })
    else valid.push(data)
  })

  return { valid, invalid, totalRows, missingColumns }
}
