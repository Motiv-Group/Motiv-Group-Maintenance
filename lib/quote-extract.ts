/**
 * Deterministic quote-total extraction.
 *
 * The amounts on a quote are extracted by CODE, not by the LLM, so the result
 * is exact and reproducible. The LLM is only used for the free-text description
 * (and as a date fallback) — never for the money values.
 *
 * Every number returned here is literally present on the document. Where a
 * missing total is derived, it is derived only by arithmetic on numbers that
 * ARE present (e.g. incl = excl + vat) — never by assuming a VAT rate.
 */

export interface ExtractedTotals {
  amount:          number | null   // excl VAT, or the sole total when supplier is not VAT-registered
  amount_incl_vat: number | null   // incl VAT, or null when no VAT breakdown exists
  confident:       boolean          // true only when totals were found cleanly and pass sanity checks
}

// ─── ZAR number parsing ──────────────────────────────────────────────────────
/**
 * Parse a South African currency string into a number.
 * Handles: "804,661.17", "804 661.17", "R 804 661,17", "1.200,50", "925360.46".
 * Returns null if no sensible number can be read.
 */
export function parseZar(raw: string): number | null {
  if (!raw) return null
  // strip currency markers and spaces, keep digits, separators, sign
  let s = raw.replace(/zar/gi, '').replace(/r(?=\s|\d)/gi, '').replace(/[^\d.,-]/g, '').trim()
  if (!s || !/\d/.test(s)) return null

  const lastDot   = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const decimalPos = Math.max(lastDot, lastComma)

  if (decimalPos === -1) {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const digitsAfter = s.length - decimalPos - 1
  let normalised: string
  if (digitsAfter === 1 || digitsAfter === 2) {
    // the last separator is the decimal point; everything before it is thousands grouping
    const intPart  = s.slice(0, decimalPos).replace(/[.,]/g, '')
    const fracPart = s.slice(decimalPos + 1)
    normalised = `${intPart}.${fracPart}`
  } else {
    // separator is a thousands group (e.g. "1,200" or "804.661") → integer
    normalised = s.replace(/[.,]/g, '')
  }

  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}

// ─── label-based amount lookup ───────────────────────────────────────────────
// A money token: optional R / ZAR, then digits with , . or space separators.
const MONEY = String.raw`R?\s?(?:ZAR)?\s?(-?\d[\d .,]*\d|\d)`

const EXCL_LABELS = [
  'total\\s+excl(?:uding)?\\.?\\s*(?:vat)?',
  'total\\s+before\\s+vat',
  'sub[\\s-]?total',
  'nett?\\s+total',
  '\\bnett\\b',
  'amount\\s+excl',
]

const VAT_LABELS = [
  'total\\s+vat',
  'vat\\s+amount',
  'vat\\s*@',
  '\\bvat\\b',
]

const INCL_LABELS = [
  'total\\s+incl(?:uding)?\\.?\\s*(?:vat)?',
  'grand\\s+total',
  'total\\s+zar',
  'total\\s+due',
  'amount\\s+due',
  'balance\\s+due',
]

/** Find the money value that appears immediately after any of the given labels. */
function findAmountAfter(text: string, labels: string[]): number | null {
  for (const lbl of labels) {
    const re = new RegExp(lbl + String.raw`[^\d\n]{0,40}?` + MONEY, 'i')
    const m = text.match(re)
    if (m) {
      const v = parseZar(m[1])
      if (v != null && v > 0) return v
    }
  }
  return null
}

/** Does the document mention VAT anywhere at all? */
function hasVatMention(text: string): boolean {
  return /\bvat\b/i.test(text)
}

/**
 * Extract excl/incl totals from extracted document text using only labelled
 * figures. All amounts returned are literally present on the document; a single
 * missing total may be completed by exact arithmetic (excl+vat / incl-vat).
 */
export function extractTotalsFromText(fullText: string): ExtractedTotals {
  const none: ExtractedTotals = { amount: null, amount_incl_vat: null, confident: false }
  if (!fullText) return none

  // Totals live at the end of a quote — search the tail first, then the whole doc.
  const tail = fullText.length > 2500 ? fullText.slice(-2500) : fullText
  const scopes = [tail, fullText]

  for (const scope of scopes) {
    const vat  = findAmountAfter(scope, VAT_LABELS)
    let excl   = findAmountAfter(scope, EXCL_LABELS)
    let incl   = findAmountAfter(scope, INCL_LABELS)

    // Both totals present
    if (excl != null && incl != null) {
      if (incl < excl) [excl, incl] = [incl, excl]        // labels mixed up — fix order
      const tol = Math.max(1, incl * 0.005)
      if (vat != null && Math.abs(excl + vat - incl) > tol) continue   // inconsistent → try next scope
      return { amount: round2(excl), amount_incl_vat: round2(incl), confident: true }
    }

    // excl + vat → derive incl by exact arithmetic
    if (excl != null && vat != null) {
      return { amount: round2(excl), amount_incl_vat: round2(excl + vat), confident: true }
    }

    // incl + vat → derive excl by exact arithmetic
    if (incl != null && vat != null) {
      return { amount: round2(incl - vat), amount_incl_vat: round2(incl), confident: true }
    }

    // Single total found and the document has no VAT mention → non-VAT supplier.
    if (excl != null && incl == null && !hasVatMention(fullText)) {
      return { amount: round2(excl), amount_incl_vat: null, confident: true }
    }
    if (incl != null && excl == null && !hasVatMention(fullText)) {
      // labelled "total/amount due" but no VAT anywhere → treat as the sole amount
      return { amount: round2(incl), amount_incl_vat: null, confident: true }
    }
  }

  return none
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ─── valid-until extraction ──────────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function toISO(d: Date): string | null {
  if (isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Extract a quote expiry date from text. Handles:
 *  - "Expiry 27 May 2026", "Valid until 27 May 2026"
 *  - "Valid until 27/05/2026"
 *  - "valid for a 30 day period" (today + 30)
 * Returns ISO YYYY-MM-DD or null.
 */
export function extractValidUntil(fullText: string, today = new Date()): string | null {
  if (!fullText) return null

  // "Expiry"/"Valid until/till" followed by an explicit date
  const labelled = /(?:expir\w*|valid\s+(?:until|till|to))\D{0,15}?(\d{1,2})[\s./-]+([a-z]{3,9}|\d{1,2})[\s./-]+(\d{2,4})/i
  const lm = fullText.match(labelled)
  if (lm) {
    const day = parseInt(lm[1], 10)
    const monRaw = lm[2].toLowerCase()
    const month = /^\d+$/.test(monRaw) ? parseInt(monRaw, 10) - 1 : MONTHS[monRaw.slice(0, 3)]
    let year = parseInt(lm[3], 10)
    if (year < 100) year += 2000
    if (month != null && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const iso = toISO(new Date(year, month, day))
      if (iso) return iso
    }
  }

  // "valid for a 30 day period" → today + N days
  const rel = fullText.match(/valid\s+for\s+(?:a\s+)?(\d{1,3})\s*(day|week|month)/i)
  if (rel) {
    const n = parseInt(rel[1], 10)
    const unit = rel[2].toLowerCase()
    const d = new Date(today)
    if (unit === 'day')   d.setDate(d.getDate() + n)
    if (unit === 'week')  d.setDate(d.getDate() + n * 7)
    if (unit === 'month') d.setMonth(d.getMonth() + n)
    return toISO(d)
  }

  return null
}
