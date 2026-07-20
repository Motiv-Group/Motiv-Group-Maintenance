'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, X, FileText, Loader2, Calendar, Sparkles, Check, Clock, AlertTriangle, AlertCircle, Lock, ChevronDown } from 'lucide-react'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { uploadFiles } from '@/lib/upload'
import { formatDateTime } from '@/lib/utils'

/**
 * Render pages of a scanned PDF to JPEG blobs using pdfjs-dist (browser only).
 * Totals live on the LAST page, scope on the first — so for long PDFs we send
 * page 1 plus the final pages (vision model accepts up to 5 images per request).
 */
async function pdfPagesToBlobs(file: File, maxPages = 5): Promise<Blob[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // unpkg mirrors npm exactly — cdnjs doesn't carry pdfjs-dist v6.x
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const total       = pdf.numPages

  // Choose which pages to send: all if small, else first + last (maxPages-1)
  let pageNums: number[]
  if (total <= maxPages) {
    pageNums = Array.from({ length: total }, (_, i) => i + 1)
  } else {
    const tail = Array.from({ length: maxPages - 1 }, (_, i) => total - (maxPages - 2) + i)
    pageNums = [1, ...tail]
  }

  const blobs: Blob[] = []
  for (const num of pageNums) {
    const page     = await pdf.getPage(num)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas   = document.createElement('canvas')
    canvas.width   = viewport.width
    canvas.height  = viewport.height
    const ctx      = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/jpeg', 0.82)
    )
    blobs.push(blob)
  }
  return blobs
}

/** Downscale an image to keep the base64 payload under Groq's 4 MB vision limit. */
async function imageToBlob(file: File, maxDim = 2200, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w      = Math.round(bitmap.width * scale)
  const h      = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/jpeg', quality)
  )
}

interface ParsedResult {
  amount:          number | null
  amount_incl_vat: number | null
  description:     string | null
  valid_until:     string | null
}

interface QuoteForm {
  amount:          number | ''
  amount_incl_vat: number | ''
  description:     string
  valid_until:     string
  warranty:        string
}

export interface ExistingQuote {
  id:              string
  amount:          number
  amount_incl_vat: number | null
  description:     string
  valid_until:     string | null
  file_url:        string | null
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const PRESETS = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '1 month', days: 30 },
] as const

export function SendQuoteForm({
  ticketId,
  variant = 'quote',
  existingQuote = null,
  competitive = false,
  priority = 'P3',
  createdAt,
  defaultOpen = false,
  onClose,
}: {
  ticketId: string
  variant?: 'quote' | 'variation'
  existingQuote?: ExistingQuote | null
  /** Competitive model: post the quote against the invited supplier via the
   *  ticket submit-quote route (updates ticket_suppliers + status). */
  competitive?: boolean
  /** Ticket priority + created time — used to bound the proposed-schedule picker. */
  priority?: string
  createdAt?: string
  /** Render already expanded (caller controls the trigger button). */
  defaultOpen?: boolean
  /** Called when the form is cancelled/closed — lets the caller hide it. */
  onClose?: () => void
}) {
  const isVariation = variant === 'variation'
  const isEdit      = !!existingQuote
  // A proposed job start is required on a fresh competitive supplier quote.
  const wantsSchedule = competitive && !isVariation && !isEdit
  const router = useRouter()
  const [open,       setOpen]       = useState(defaultOpen)
  const [schedule,   setSchedule]   = useState('')   // ISO of the proposed start
  const [pickOpen,   setPickOpen]   = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [file,       setFile]       = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(existingQuote?.file_url ?? null)
  const [uploading,  setUploading]  = useState(false)
  const [parsing,     setParsing]     = useState(false)
  const [confirmVals, setConfirmVals] = useState<QuoteForm | null>(null)   // competitive: confirm before sending
  const [autofilled,  setAutofilled]  = useState(false)
  const [parseError,  setParseError]  = useState<'scanned' | 'generic' | false>(false)
  const [needAmount,  setNeedAmount]  = useState(false)   // parsed ok but amount couldn't be read confidently
  const [validNA,     setValidNA]     = useState(isEdit ? existingQuote!.valid_until === null : false)
  const [warrantyNA,  setWarrantyNA]  = useState(false)   // quote warranty: manual text or explicit N/A

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<QuoteForm>({
    defaultValues: existingQuote
      ? {
          amount:          existingQuote.amount,
          amount_incl_vat: existingQuote.amount_incl_vat ?? '',
          description:     existingQuote.description,
          valid_until:     existingQuote.valid_until ?? '',
        }
      : undefined,
  })

  // Dark, squared field (matches the app's input style + image spec).
  const field = 'w-full px-3.5 py-2.5 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40'
  // Green selection tile (idle → active), shared by the N/A + valid-until toggles.
  const tile = (active: boolean) => `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium ring-1 transition ${active
    ? 'ring-emerald-500 bg-emerald-500/10 text-[var(--text)]'
    : 'ring-[var(--border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:ring-emerald-500/60'}`

  /**
   * Apply a parse result to the form. NEVER overwrites a field the supplier has
   * already filled — only populates fields that are still empty. Returns true if
   * anything was filled.
   */
  function applyParsed(data: ParsedResult): boolean {
    if (data.amount          !== null && !getValues('amount'))            setValue('amount',          data.amount)
    if (data.amount_incl_vat !== null && !getValues('amount_incl_vat'))   setValue('amount_incl_vat', data.amount_incl_vat)
    if (data.description     !== null && !getValues('description')?.trim()) setValue('description',   data.description)
    if (data.valid_until     !== null && !validNA && !getValues('valid_until')) setValue('valid_until', data.valid_until)

    const filledSomething = data.amount !== null || data.description !== null || data.valid_until !== null
    // Precision mode: if context was read but the amount field is still empty, prompt manual entry.
    setNeedAmount(filledSomething && !getValues('amount'))
    return filledSomething
  }

  async function onDrop(accepted: File[]) {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setFilePreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    // NOTE: we intentionally do NOT reset the form here — anything the supplier
    // already typed is preserved; parsing only fills still-empty fields.
    setAutofilled(false)
    setParseError(false)
    setNeedAmount(false)

    const isExcel   = /\.xlsx?$/i.test(f.name) || f.type.includes('spreadsheet') || f.type === 'application/vnd.ms-excel'
    const parseable = f.type === 'application/pdf' || f.type.startsWith('image/') || isExcel
    if (!parseable) return

    setParsing(true)

    try {
      const fd = new FormData()
      if (f.type.startsWith('image/')) {
        // Downscale before sending so large phone photos stay under the vision size limit
        const img = await imageToBlob(f)
        fd.append('file', img, 'quote.jpg')
      } else {
        fd.append('file', f)
      }
      const res = await fetch('/api/parse-quote-pdf', { method: 'POST', body: fd })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        if (errBody.error === 'SCANNED_PDF') {
          // Scanned PDF — render pages to images in the browser, retry with the vision model
          try {
            const blobs = await pdfPagesToBlobs(f)
            const fd2 = new FormData()
            blobs.forEach((b, i) => fd2.append('file', b, `quote-page${i + 1}.jpg`))
            const res2 = await fetch('/api/parse-quote-pdf', { method: 'POST', body: fd2 })
            if (!res2.ok) { setParseError('generic'); return }
            const data2 = await res2.json() as ParsedResult
            if (applyParsed(data2)) setAutofilled(true)
            else setParseError('generic')
          } catch (convErr) {
            console.error('[parse-quote-pdf] PDF→image conversion failed:', convErr)
            setParseError('scanned')
          }
        } else {
          console.error('[parse-quote-pdf] API error:', res.status, errBody)
          setParseError('generic')
        }
        return
      }

      const data = await res.json() as ParsedResult
      if (applyParsed(data)) setAutofilled(true)
      else setParseError('generic')
    } catch (err) {
      console.error('[parse-quote-pdf] fetch error:', err)
      setParseError('generic')
    } finally {
      setParsing(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  })

  async function uploadFile(f: File): Promise<string | null> {
    const { urls } = await uploadFiles([f], 'quote-attachments')
    return urls[0] ?? null
  }

  async function onSubmit(values: QuoteForm) {
    // valid_until is required for a quote (unless N/A); not applicable to a variation.
    if (!isVariation && !validNA && !values.valid_until) {
      setError('Please select a Valid Until date or choose N/A.')
      return
    }
    // Warranty / guarantee is required on a quote AND a variation order — typed
    // manually or explicit N/A.
    if (!warrantyNA && !values.warranty?.trim()) {
      setError('Please state the warranty / guarantee, or select N/A.')
      return
    }
    if (!file && !existingFileUrl) {
      setError('Please attach the quote document (PDF, Excel, image or Word) before submitting.')
      return
    }
    if (wantsSchedule && !schedule) {
      setError('Please set a proposed job start date & time.')
      return
    }
    // Competitive supplier quote → confirm before sending.
    if (competitive && !confirmVals) { setConfirmVals(values); setError(''); return }
    await doSubmit(values)
  }

  async function doSubmit(values: QuoteForm) {
    setConfirmVals(null)
    setLoading(true)
    setError('')

    let fileUrl = existingFileUrl
    if (file) {
      setUploading(true)
      fileUrl = await uploadFile(file)
      setUploading(false)
      if (!fileUrl) {
        setError('File upload failed. Check the quote-attachments storage bucket exists.')
        setLoading(false)
        return
      }
    }

    // Competitive variation order → the v3 transition endpoint (ticket_variations),
    // not the quotes table. Same form as a quote, minus the schedule.
    if (competitive && isVariation) {
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit_variation', description: values.description, amount: values.amount ? Number(values.amount) : undefined, warranty: warrantyNA ? 'N/A' : (values.warranty?.trim() || null), fileUrls: fileUrl ? [fileUrl] : [] }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Failed to submit variation order'); setLoading(false); return }
      reset(); if (filePreview) URL.revokeObjectURL(filePreview)
      setFilePreview(null); setFile(null); setOpen(false); setValidNA(false); setWarrantyNA(false); router.refresh(); setLoading(false)
      onClose?.()   // in a pop-up, close it — don't collapse to the lone "Upload" button
      return
    }

    // Quotes always post through the competitive supplier route (submit-quote); the
    // legacy /api/quotes create + edit paths were removed to keep one workflow.
    const res = await fetch(`/api/tickets/${ticketId}/submit-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        ticket_id:       ticketId,
        type:            variant,
        amount:          Number(values.amount),
        amount_incl_vat: values.amount_incl_vat !== '' ? Number(values.amount_incl_vat) : null,
        file_url:        fileUrl,
        valid_until:     validNA ? null : values.valid_until,
        warranty:        warrantyNA ? 'N/A' : (values.warranty?.trim() || null),
        proposed_schedule_at: wantsSchedule ? schedule : undefined,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || (isEdit ? 'Failed to update quote' : 'Failed to send quote'))
      setLoading(false)
      return
    }

    reset()
    if (filePreview) URL.revokeObjectURL(filePreview)
    setFilePreview(null)
    setFile(null)
    setOpen(false)
    setAutofilled(false)
    setNeedAmount(false)
    setValidNA(false); setWarrantyNA(false)
    router.refresh()
    setLoading(false)
    onClose?.()   // in a pop-up, close it — don't collapse to the lone "Upload" button
  }

  function handleClose() {
    setOpen(false)
    setConfirmVals(null)
    if (filePreview) URL.revokeObjectURL(filePreview)
    setFilePreview(null)
    setFile(null)
    setAutofilled(false)
    setNeedAmount(false)
    setValidNA(false); setWarrantyNA(false)
    reset()
    onClose?.()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition ${isVariation
          ? 'bg-blue-600 hover:bg-blue-500'
          : 'bg-green-700 hover:bg-green-600'}`}
      >
        {isEdit ? 'Edit Quote' : isVariation ? 'Raise Variation Order' : 'Upload Quote'}
      </button>
    )
  }

  const title = isEdit ? 'Edit Quote' : isVariation ? 'Raise Variation Order' : 'Send Quote'
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold text-[var(--text)]">{title}</h3>
        <button type="button" onClick={handleClose} aria-label="Close" className="shrink-0 -m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={20} /></button>
      </div>
      {isVariation && (
        <p className="text-xs text-[var(--text-muted)]">
          For extra materials or work needed to complete the job. This is sent to the regional manager for approval before work continues.
        </p>
      )}

      {/* Supplier responsibility disclaimer */}
      <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          It is your responsibility to verify all amounts and details are correct before submitting — whether auto-filled from the document or entered manually.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* File upload — first so PDF parse runs before user edits fields */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1">
            Attachment <span className="text-red-500">*</span>{' '}
            <span className="text-[var(--text-faint)] font-normal">(PDF, Excel, image or Word, max 10 MB)</span>
          </label>
          {file ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
              <FileText size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <a
                href={filePreview ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 truncate flex-1 hover:underline"
                title="View attachment"
              >
                {file.name}
              </a>
              {parsing ? (
                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 shrink-0">
                  <Loader2 size={12} className="animate-spin" /> Reading…
                </span>
              ) : (
                <span className="text-xs text-[var(--text-faint)] shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
              )}
              <button
                type="button"
                // Removing the quote clears the whole form so the next file
                // populates fresh (parse only fills still-empty fields).
                onClick={() => {
                  // Removing the attachment clears EVERY field so the next file fills fresh.
                  if (filePreview) URL.revokeObjectURL(filePreview)
                  setFilePreview(null); setFile(null)
                  setAutofilled(false); setNeedAmount(false); setParseError(false)
                  setValidNA(false); setWarrantyNA(false); setSchedule(''); setError('')
                  reset({ amount: '', amount_incl_vat: '', description: '', valid_until: '', warranty: '' })
                }}
                className="p-1 text-[var(--text-faint)] hover:text-red-500 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
            {existingFileUrl && (
              <a href={existingFileUrl} target="_blank" rel="noopener noreferrer"
                className="mb-2 inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                <FileText size={13} /> View current attachment — drop a new file below to replace
              </a>
            )}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--border)] hover:border-emerald-500/60 hover:bg-[var(--hover)]'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud size={28} className={`mx-auto mb-2 ${isDragActive ? 'text-blue-500' : 'text-[var(--text-faint)]'}`} />
              {isDragActive ? (
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Drop it here…</p>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-muted)]">
                    Drag &amp; drop a file, or <span className="text-blue-600 dark:text-blue-400 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-[var(--text-faint)] mt-1">PDF, Excel or photo auto-fills fields · Word also accepted · max 10 MB</p>
                </>
              )}
            </div>
            </>
          )}
        </div>

        {/* Auto-fill banner */}
        {autofilled && !parsing && (
          <div className="rounded-xl bg-blue-500/10 ring-1 ring-blue-500/30 p-3.5 flex items-start gap-2.5">
            <Sparkles size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Fields auto-filled from your file — please review and adjust if needed.
            </p>
          </div>
        )}

        {/* Amount needs manual entry — context read, but amount not confidently found */}
        {needAmount && !parsing && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Couldn&apos;t read the amount with confidence — please enter the amount(s) manually.
            </p>
          </div>
        )}

        {/* Parse error banner */}
        {parseError && !parsing && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 p-3.5 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {parseError === 'scanned'
                ? 'Could not read this PDF automatically. Please fill in manually.'
                : 'Could not auto-fill fields from this file. Please fill in manually.'}
            </p>
          </div>
        )}

        <div>
          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-[var(--text)] mb-1">Excl. VAT (R) *</label>
              <input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                className={field}
                {...register('amount', { required: 'Required', min: { value: 1, message: 'Must be > 0' } })}
              />
              {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
            </div>
            <div>
              <label htmlFor="amount_incl_vat" className="block text-sm font-medium text-[var(--text)] mb-1">Incl. VAT (R)</label>
              <input
                id="amount_incl_vat"
                type="number"
                step="0.01"
                placeholder="0.00"
                className={field}
                {...register('amount_incl_vat', {
                  min: { value: 1, message: 'Must be > 0' },
                  setValueAs: v => v === '' ? '' : Number(v),
                })}
              />
              {errors.amount_incl_vat && <p className="mt-1 text-xs text-red-500">{errors.amount_incl_vat.message}</p>}
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">Incl. VAT — leave blank if supplier not VAT-registered</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1">Description <span className="text-red-500">*</span></label>
          <div className="relative">
            <textarea
              maxLength={2000}
              className={`${field} resize-none pb-7`}
              rows={3}
              placeholder="Describe what the quote covers..."
              {...register('description', { required: 'Description is required' })}
            />
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums text-[var(--text-faint)]">{watch('description')?.length ?? 0} / 2000</span>
          </div>
          {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>}
        </div>

        {/* Warranty / Guarantee — on quotes AND variation orders, required (manual text or N/A) */}
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1">
            Warranty / Guarantee <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={2}
            disabled={warrantyNA}
            placeholder="e.g. 12-month workmanship guarantee, 2-year parts warranty…"
            className={`${field} resize-none disabled:opacity-50`}
            {...register('warranty')}
          />
          <label className="mt-2 flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={warrantyNA}
              onChange={e => { setWarrantyNA(e.target.checked); if (e.target.checked) setValue('warranty', ''); setError('') }}
              className="h-4 w-4 accent-blue-600"
            />
            No warranty? Select this option
          </label>
        </div>

        {/* Valid Until — quotes only (a variation order has no validity date) */}
        {!isVariation && (
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
            Valid Until <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESETS.map(p => {
              const val     = addDays(p.days)
              // eslint-disable-next-line react-hooks/incompatible-library -- compiler skips this component; runtime unaffected (React Compiler not enabled)
              const isActive = !validNA && watch('valid_until') === val
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => { setValue('valid_until', val); setValidNA(false) }}
                  className={tile(isActive)}
                >
                  {isActive ? <Check size={11} className="text-emerald-500" /> : <Calendar size={11} />}
                  {p.label}
                </button>
              )
            })}

            {/* N/A option */}
            <button
              type="button"
              aria-pressed={validNA}
              onClick={() => { setValidNA(true); setValue('valid_until', '') }}
              className={tile(validNA)}
            >
              {validNA && <Check size={11} className="text-emerald-500" />}
              N/A
            </button>
          </div>

          {validNA ? (
            <p className="text-xs text-[var(--text-muted)] mt-2">No expiry date — quote has no valid-until.</p>
          ) : watch('valid_until') ? (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Valid until:{' '}
              <span className="font-medium text-[var(--text)]">
                {new Date(watch('valid_until') + 'T00:00:00').toLocaleDateString('en-ZA', {
                  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg',
                })}
              </span>
            </p>
          ) : (
            <p className="text-xs text-red-500 mt-2">Required — select an expiry date or choose N/A.</p>
          )}

          <input type="hidden" {...register('valid_until')} />
        </div>
        )}

        {/* Proposed start date — supplier only; auto-schedules the job on approval.
            Uses the same picker as post-acceptance scheduling, bounded by urgency. */}
        {wantsSchedule && (
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Proposed start date &amp; time <span className="text-red-500">*</span></label>
            <button type="button" onClick={() => setPickOpen(true)} className={`${field} flex items-center justify-between gap-2 text-left`}>
              <span className="flex items-center gap-2">
                <Calendar size={16} className="shrink-0 text-[var(--text-faint)]" />
                <span className={schedule ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'}>{schedule ? formatDateTime(schedule) : 'Select date & time'}</span>
              </span>
              <ChevronDown size={16} className="shrink-0 text-[var(--text-faint)]" />
            </button>
            <p className="text-xs text-[var(--text-muted)] mt-1">The job schedules to this time once the quote is approved.</p>
            {pickOpen && (
              <Modal onClose={() => setPickOpen(false)} maxWidth="max-w-2xl">
                {close => (
                  <>
                    <DrawerHeader onClose={close} title={<span className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400"><Calendar size={15} /></span><span className="text-base font-bold text-[var(--text)]">Set proposed start date &amp; time</span></span>} />
                    <SchedulePicker priority={priority} createdAt={createdAt ?? new Date().toISOString()} busy={false}
                      onConfirm={iso => { setSchedule(iso); close(); setError('') }} onCancel={close} />
                  </>
                )}
              </Modal>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-3.5 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {confirmVals ? (
          // Competitive confirm replaces the Send/Cancel row in place (no separate row).
          <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
            <p className="text-sm text-[var(--text)]">{isVariation ? 'Submit this variation order to the manager?' : 'Send this quote to the manager?'} Please double-check the amount and details first.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => doSubmit(confirmVals)} disabled={loading} className="px-3 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50 bg-green-700 hover:bg-green-600">{loading ? 'Submitting…' : isVariation ? 'Yes, submit variation order' : 'Yes, send quote'}</button>
              <button type="button" onClick={() => setConfirmVals(null)} className="px-3 py-2 rounded-lg ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm">Back</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading || uploading || parsing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 bg-green-700 hover:bg-green-600"
            >
              {uploading ? (
                <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              ) : loading ? (
                <><Loader2 size={14} className="animate-spin" /> {isVariation ? 'Submitting…' : 'Sending…'}</>
              ) : isEdit ? 'Update Quote' : isVariation ? 'Submit Variation Order' : 'Send Quote'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-semibold transition hover:bg-[var(--hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {!isVariation && (
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-[var(--text-faint)]">
            <Lock size={12} /> Quotes are secure and only visible to authorised users.
          </p>
        )}
      </form>
    </>
  )
  // In a modal (defaultOpen) the shared Modal already supplies the card + padding,
  // so render bare to avoid a double card; standalone keeps its own card.
  return defaultOpen
    ? <div className="space-y-4">{inner}</div>
    : <div className="rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-5 space-y-4">{inner}</div>
}
