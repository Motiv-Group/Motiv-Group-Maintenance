// Shared helpers for the RM store-account import flow.

/**
 * Normalise a phone number to E.164 (+27XXXXXXXXX for SA locals).
 * Returns null when empty. Same logic as app/api/profile/route.ts.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0027')) digits = digits.slice(2) // 0027… → 27…

  // Strip the SA country code then the national trunk 0, so all of
  // "0761936165", "270761936165" and "+270761936165" collapse to the same
  // 9-digit subscriber number.
  let local = digits
  if (local.startsWith('27')) local = local.slice(2)
  if (local.startsWith('0'))  local = local.slice(1)
  if (local.length === 9) return `+27${local}`

  // Fallbacks for anything that isn't a standard SA mobile.
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`
  return `+${digits}`
}

/** Generate a readable 12-char password (mixed case + digits, no ambiguous chars). */
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

// Columns recognised in an uploaded store-account spreadsheet.
export const STORE_CSV_HEADERS = [
  'full_name', 'email', 'phone', 'address', 'company_name', 'sub_store', 'branch_code', 'password',
] as const

/**
 * Parse CSV text into row objects keyed by STORE_CSV_HEADERS. Tolerant of
 * comma/semicolon separators and header casing/spacing. Keeps rows that have at
 * least an email (the required identity field). Lifted from the supplier import.
 */
export function parseStoreCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const rawHeaders = lines[0]
    .split(sep)
    .map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))

  const headerMap: Record<number, string> = {}
  rawHeaders.forEach((h, i) => {
    const match = STORE_CSV_HEADERS.find(known => known === h || h.includes(known.split('_')[0]))
    if (match) headerMap[i] = match
  })

  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
    const row: Record<string, string> = {}
    Object.entries(headerMap).forEach(([i, key]) => {
      row[key] = cols[Number(i)] ?? ''
    })
    return row
  }).filter(r => r.email)
}
