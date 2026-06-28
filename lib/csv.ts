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

// Obvious ".com" typos that are not real TLDs — reject so e.g. "gmail.come"
// doesn't slip through (these are not valid ccTLDs/gTLDs).
const TLD_TYPOS = new Set(['come', 'comm', 'con', 'cpm', 'cmo', 'ocm', 'ccom', 'coma', 'vom', 'xom', 'co0m'])
// Big webmail providers that only ever use one domain — anything else is a typo.
const SINGLE_DOMAIN_PROVIDERS: Record<string, string> = {
  gmail: 'gmail.com', googlemail: 'googlemail.com', icloud: 'icloud.com', me: 'me.com', mac: 'mac.com',
}
// Common misspellings of popular webmail second-level domains — reject outright
// (e.g. "gmaile.com", "gmial.com", "hotmial.com"). These are never real domains.
const EMAIL_SLD_TYPOS = new Set([
  'gmaile', 'gmial', 'gmai', 'gmil', 'gmali', 'gmaill', 'gnail', 'gmsil', 'gamil', 'gmail1',
  'hotmial', 'hotmai', 'hotmil', 'hatmail', 'yaho', 'yahooo', 'yhaoo', 'outlok', 'outloo', 'iclod', 'iclould',
])

/**
 * True when `raw` is a valid email address. Beyond the basic shape it requires a
 * letters-only TLD (2–24 chars), rejects common ".com" typos (e.g. ".come"),
 * rejects misspelled provider domains (e.g. "gmaile.com"), and flags wrong
 * domains for single-domain webmail providers (e.g. "gmail.co").
 */
export function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return false
  const email = raw.trim().toLowerCase()
  const m = /^[^\s@]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24})$/.exec(email)
  if (!m) return false
  const domain = m[1]
  const labels = domain.split('.')
  const tld = labels[labels.length - 1]
  if (TLD_TYPOS.has(tld)) return false
  const firstLabel = labels[0]
  if (EMAIL_SLD_TYPOS.has(firstLabel)) return false
  if (SINGLE_DOMAIN_PROVIDERS[firstLabel] && domain !== SINGLE_DOMAIN_PROVIDERS[firstLabel]) return false
  return true
}

/**
 * True when `raw` is a valid South African phone number. Normalises first
 * (SA-aware), then requires exactly +27 followed by 9 digits — so junk and
 * too-long/too-short numbers (e.g. an extra trailing digit) are rejected.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  const n = normalisePhone(raw)
  return !!n && /^\+27\d{9}$/.test(n)
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
