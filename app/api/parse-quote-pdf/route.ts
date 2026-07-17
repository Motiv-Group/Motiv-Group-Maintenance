import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractText } from 'unpdf'
import * as XLSX from 'xlsx'
import { extractTotalsFromText, extractValidUntil, type ExtractedTotals } from '@/lib/quote-extract'
import { rateLimit } from '@/lib/rate-limit'
import { fetchWithRetry } from '@/lib/fetch-retry'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB/file — caps DoS + Groq spend

const GROQ_API_KEY = process.env.GROQ_API_KEY!
const GROQ_BASE    = 'https://api.groq.com/openai/v1'

const TEXT_MODEL   = 'llama-3.3-70b-versatile'
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
]

interface ParsedQuote {
  amount:          number | null   // excl VAT (or sole total if supplier not VAT-registered)
  amount_incl_vat: number | null   // incl VAT; null if no VAT breakdown
  description:     string | null
  valid_until:     string | null
}

/**
 * POST /api/parse-quote-pdf
 * Accepts multipart/form-data with one or more "file" fields.
 *   - A single PDF / Excel / image, OR
 *   - several images (rendered pages of a scanned PDF — up to 5).
 *
 * AMOUNTS are extracted deterministically by code (never guessed by the LLM)
 * for text-bearing files. The LLM only writes the description. For image-only
 * input the vision model extracts everything but must return null when unsure.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Expensive (Groq LLM) — cap per user so it can't be hammered.
  if (!(await rateLimit(`parse-pdf:${user.id}`, 15, 60_000)))
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })

  const formData = await req.formData()
  const files = formData.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (files.length > 5) return NextResponse.json({ error: 'Too many files (max 5).' }, { status: 400 })
  const oversize = files.find(f => f.size > MAX_FILE_BYTES)
  if (oversize) return NextResponse.json({ error: 'File too large (max 15 MB).' }, { status: 413 })

  const today = new Date().toISOString().split('T')[0]
  const first = files[0]
  const isPdf   = first.type === 'application/pdf'
  const isExcel = EXCEL_TYPES.includes(first.type) || /\.xlsx?$/i.test(first.name)
  const isImage = files.every(f => IMAGE_TYPES.includes(f.type))

  if (!isPdf && !isExcel && !isImage) {
    return NextResponse.json({ error: 'Only PDF, Excel or image files are supported for auto-fill' }, { status: 400 })
  }

  let result: ParsedQuote

  try {
    if (isPdf) {
      result = await extractFromPdf(first, today)
    } else if (isExcel) {
      result = await extractFromExcel(first, today)
    } else {
      result = await extractFromImages(files, today)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'SCANNED_PDF') {
      return NextResponse.json({ error: 'SCANNED_PDF' }, { status: 422 })
    }
    console.error('[parse-quote-pdf] extraction error:', err)
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 })
  }

  return NextResponse.json(sanitise(result))
}

// ─── PDF (digital, text layer) ────────────────────────────────────────────────
async function extractFromPdf(file: File, today: string): Promise<ParsedQuote> {
  let text = ''
  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const { text: raw } = await extractText(buffer, { mergePages: true })
    text = (typeof raw === 'string' ? raw : (raw as string[]).join('\n')).trim()
  } catch (err) {
    console.error('[parse-quote-pdf] extractText error:', err)
    throw new Error('Could not read PDF')
  }

  // No text layer → scanned PDF. Tell the client to render pages to images and retry.
  if (text.length < 30) throw new Error('SCANNED_PDF')

  return fromText(text, today)
}

// ─── Excel (.xlsx / .xls) ─────────────────────────────────────────────────────
async function extractFromExcel(file: File, today: string): Promise<ParsedQuote> {
  let text = ''
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    // Tab-separated so values like "804,661.17" keep their separators intact.
    text = wb.SheetNames
      .map(name => XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: '\t', RS: '\n', blankrows: false }))
      .join('\n')
      .trim()
  } catch (err) {
    console.error('[parse-quote-pdf] excel parse error:', err)
    throw new Error('Could not read Excel file')
  }

  if (!text) throw new Error('Could not read Excel file')

  return fromText(text, today)
}

/** Shared path for text-bearing documents: deterministic amounts + LLM description. */
async function fromText(text: string, today: string): Promise<ParsedQuote> {
  const totals: ExtractedTotals = extractTotalsFromText(text)
  const validFromRegex = extractValidUntil(text)

  // LLM writes ONLY the description (and a date fallback). It never sets amounts.
  let description: string | null = null
  let validFromLlm: string | null = null
  try {
    const meta = await llmDescribe(text, today)
    description  = meta.description
    validFromLlm = meta.valid_until
  } catch (err) {
    console.error('[parse-quote-pdf] description LLM error:', err)
  }

  return {
    amount:          totals.confident ? totals.amount : null,
    amount_incl_vat: totals.confident ? totals.amount_incl_vat : null,
    description,
    valid_until:     validFromRegex ?? validFromLlm,
  }
}

const DESCRIBE_PROMPT = (today: string) => `You summarise South African maintenance / shopfitting quotes. Today is ${today}.
Return ONLY a JSON object with these keys:
- "description": a 1–3 sentence plain-English summary of the scope of work and materials quoted. Be specific about the trades involved (e.g. tiling, plumbing, electrical, signage). Do NOT mention prices.
- "valid_until": the quote expiry as ISO YYYY-MM-DD if one is clearly stated ("Expiry", "Valid until", "valid for N days"); otherwise null.
Do NOT output any monetary amounts. Return only the JSON object.`

async function llmDescribe(text: string, today: string): Promise<{ description: string | null; valid_until: string | null }> {
  const res = await fetchWithRetry(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 300,
      messages: [
        { role: 'system', content: DESCRIBE_PROMPT(today) },
        { role: 'user',   content: text.slice(0, 24000) },
      ],
    }),
  }, { timeoutMs: 30_000, retries: 1, label: 'groq-quote-text' })
  if (!res.ok) throw new Error(`Groq LLM error: ${await res.text()}`)
  const json = await res.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = parseJsonResponse(json.choices[0].message.content)
  return {
    description: typeof parsed.description === 'string' ? parsed.description : null,
    valid_until: typeof parsed.valid_until === 'string' ? parsed.valid_until : null,
  }
}

// ─── Images (photos, or rendered scanned-PDF pages) ───────────────────────────
const VISION_PROMPT = (today: string) => `You read South African maintenance / shopfitting quotes from images. Today is ${today}.
Return ONLY a JSON object with these keys:
- "amount": the TOTAL EXCLUDING VAT as a plain number (look for "Subtotal", "Sub-total (ex VAT)", "Total Excl VAT", "Total before VAT", "Nett"). null if you cannot read it clearly.
- "amount_incl_vat": the TOTAL INCLUDING VAT as a plain number (look for "Total (incl VAT)", "Total Incl VAT", "Grand Total", "Total Due", "TOTAL ZAR"). null if there is no VAT total.
- "description": a 1–3 sentence summary of the scope of work. null if unreadable.
- "valid_until": quote expiry as ISO YYYY-MM-DD, or null.
- "confidence": "high" ONLY if the amounts are clearly legible and you are certain they are correct; otherwise "low".

CRITICAL RULES:
- Output a number ONLY if you can literally read it on the image. NEVER estimate, calculate, or guess an amount.
- If the image is blurry, cropped, or the totals are not visible, set the amounts to null and "confidence" to "low".
- Do not invent VAT. If no VAT line is shown, set amount_incl_vat to null.
Return only the JSON object.`

async function extractFromImages(files: File[], today: string): Promise<ParsedQuote> {
  const imageBlocks = await Promise.all(
    files.slice(0, 5).map(async f => {
      const base64 = Buffer.from(await f.arrayBuffer()).toString('base64')
      return { type: 'image_url', image_url: { url: `data:${f.type};base64,${base64}` } }
    })
  )

  const res = await fetchWithRetry(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: 'system', content: VISION_PROMPT(today) },
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: 'Extract the quote fields from these image(s). Return ONLY the JSON object.' },
          ],
        },
      ],
    }),
  }, { timeoutMs: 45_000, retries: 1, label: 'groq-quote-vision' })

  if (!res.ok) throw new Error(`Groq vision error: ${await res.text()}`)

  const json = await res.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = parseJsonResponse(json.choices[0].message.content)

  // Precision gate: only trust amounts when the model declares high confidence
  // AND they pass a basic sanity check. Otherwise blank → user fills manually.
  const confident = parsed.confidence === 'high'
  let amount      = confident && typeof parsed.amount === 'number'          ? parsed.amount          : null
  let inclVat     = confident && typeof parsed.amount_incl_vat === 'number' ? parsed.amount_incl_vat : null

  if (amount != null && inclVat != null) {
    if (inclVat < amount) [amount, inclVat] = [inclVat, amount]
    const ratio = inclVat / amount
    if (ratio < 1 || ratio > 1.3) { amount = null; inclVat = null }  // implausible VAT spread → reject
  }

  return {
    amount,
    amount_incl_vat: inclVat,
    description: typeof parsed.description === 'string' ? parsed.description : null,
    valid_until: typeof parsed.valid_until === 'string' ? parsed.valid_until : null,
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────
interface RawParsed {
  amount?: unknown
  amount_incl_vat?: unknown
  description?: unknown
  valid_until?: unknown
  confidence?: unknown
}

/** Robustly extract a JSON object from a model response that may wrap it in prose/markdown. */
function parseJsonResponse(content: string): RawParsed {
  const trimmed = (content || '').trim()
  try { return JSON.parse(trimmed) } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  throw new Error('Could not parse JSON from model response')
}

/** Final shape + type guards before returning to the client. */
function sanitise(p: ParsedQuote): ParsedQuote {
  return {
    amount:          typeof p.amount === 'number' && p.amount > 0          ? round2(p.amount)          : null,
    amount_incl_vat: typeof p.amount_incl_vat === 'number' && p.amount_incl_vat > 0 ? round2(p.amount_incl_vat) : null,
    description:     typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null,
    valid_until:     typeof p.valid_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.valid_until) ? p.valid_until : null,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
