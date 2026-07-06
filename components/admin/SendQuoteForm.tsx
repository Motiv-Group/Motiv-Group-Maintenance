'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, X, FileText, Loader2, Calendar, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SchedulePicker } from '@/components/ui/SchedulePicker'
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
    await page.render({ canvasContext: ctx as any, viewport, canvas } as any).promise
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
  amount:          number
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
      <Button
        onClick={() => setOpen(true)}
        className={`w-full ${isVariation
          ? 'bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]'
          : 'bg-green-600 hover:bg-green-700 text-white border-green-600 focus:ring-green-500'}`}
      >
        {isEdit ? 'Edit Quote' : isVariation ? 'Raise Variation Order' : 'Upload Quote'}
      </Button>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-brand-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        {isEdit ? 'Edit Quote' : isVariation ? 'Raise Variation Order' : 'Send Quote'}
      </h3>
      {isVariation && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          For extra materials or work needed to complete the job. This is sent to the regional manager for approval before work continues.
        </p>
      )}

      {/* Supplier responsibility disclaimer */}
      <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          ⚠ It is your responsibility to verify all amounts and details are correct before submitting — whether auto-filled from the document or entered manually.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* File upload — first so PDF parse runs before user edits fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Attachment <span className="text-red-500">*</span>{' '}
            <span className="text-gray-400 font-normal">(PDF, Excel, image or Word, max 10 MB)</span>
          </label>
          {file ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
              <FileText size={18} className="text-brand-600 shrink-0" />
              <a
                href={filePreview ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 dark:text-brand-400 truncate flex-1 hover:underline"
                title="View attachment"
              >
                {file.name}
              </a>
              {parsing ? (
                <span className="flex items-center gap-1 text-xs text-brand-600 shrink-0">
                  <Loader2 size={12} className="animate-spin" /> Reading…
                </span>
              ) : (
                <span className="text-xs text-gray-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
              )}
              <button
                type="button"
                // Removing the quote clears the whole form so the next file
                // populates fresh (parse only fills still-empty fields).
                onClick={() => {
                  if (filePreview) URL.revokeObjectURL(filePreview)
                  setFilePreview(null); setFile(null)
                  setAutofilled(false); setNeedAmount(false); setParseError(false)
                  setValidNA(false); setWarrantyNA(false)
                  reset({ amount: undefined as any, amount_incl_vat: '', description: '', valid_until: '' })
                }}
                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
            {existingFileUrl && (
              <a href={existingFileUrl} target="_blank" rel="noopener noreferrer"
                className="mb-2 inline-flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:underline">
                <FileText size={13} /> View current attachment — drop a new file below to replace
              </a>
            )}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud size={28} className={`mx-auto mb-2 ${isDragActive ? 'text-brand-500' : 'text-gray-400'}`} />
              {isDragActive ? (
                <p className="text-sm text-brand-600 font-medium">Drop it here…</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Drag & drop a file, or <span className="text-brand-600 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Excel or photo auto-fills fields · Word also accepted · max 10 MB</p>
                </>
              )}
            </div>
            </>
          )}
        </div>

        {/* Auto-fill banner */}
        {autofilled && !parsing && (
          <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800/40 rounded-lg">
            <Sparkles size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
            <p className="text-xs text-brand-700 dark:text-brand-300">
              Fields auto-filled from your file — please review and adjust if needed.
            </p>
          </div>
        )}

        {/* Amount needs manual entry — context read, but amount not confidently found */}
        {needAmount && !parsing && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ Couldn&apos;t read the amount with confidence — please enter the amount(s) manually.
            </p>
          </div>
        )}

        {/* Parse error banner */}
        {parseError && !parsing && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 rounded-lg">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              {parseError === 'scanned'
                ? '⚠️ Could not read this PDF automatically. Please fill in manually.'
                : '⚠️ Could not auto-fill fields from this file. Please fill in manually.'}
            </p>
          </div>
        )}

        <div>
          <div className="grid grid-cols-2 gap-3 items-start">
            <Input
              id="amount"
              type="number"
              step="0.01"
              label="Excl. VAT (R) *"
              placeholder="0.00"
              error={errors.amount?.message}
              {...register('amount', { required: 'Required', min: { value: 1, message: 'Must be > 0' } })}
            />
            <Input
              id="amount_incl_vat"
              type="number"
              step="0.01"
              label="Incl. VAT (R)"
              placeholder="0.00"
              error={errors.amount_incl_vat?.message}
              {...register('amount_incl_vat', {
                min: { value: 1, message: 'Must be > 0' },
                setValueAs: v => v === '' ? '' : Number(v),
              })}
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Incl. VAT — leave blank if supplier not VAT-registered</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            rows={3}
            placeholder="Describe what the quote covers..."
            {...register('description', { required: 'Description is required' })}
          />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>

        {/* Warranty / Guarantee — on quotes AND variation orders, required (manual text or N/A) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Warranty / Guarantee <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={2}
            disabled={warrantyNA}
            placeholder="e.g. 12-month workmanship guarantee, 2-year parts warranty…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none disabled:opacity-50"
            {...register('warranty')}
          />
          <div className="flex items-center gap-2 mt-1.5">
            {/* N/A active state matches the "Valid until" selected colour (gold). */}
            <button
              type="button"
              onClick={() => { setWarrantyNA(v => !v); if (!warrantyNA) setValue('warranty', ''); setError('') }}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                warrantyNA
                  ? 'bg-[#C6A35D] text-white border-[#C6A35D]'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#C6A35D]'
              }`}
            >
              N/A
            </button>
            <span className="text-xs text-gray-400">No warranty? Describe it manually, or select N/A.</span>
          </div>
        </div>

        {/* Valid Until — quotes only (a variation order has no validity date) */}
        {!isVariation && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Valid Until <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESETS.map(p => {
              const val     = addDays(p.days)
              const isActive = !validNA && watch('valid_until') === val
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setValue('valid_until', val); setValidNA(false) }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    isActive
                      ? 'bg-[#C6A35D] text-white border-[#C6A35D]'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#C6A35D]'
                  }`}
                >
                  <Calendar size={11} />
                  {p.label}
                </button>
              )
            })}

            {/* N/A option */}
            <button
              type="button"
              onClick={() => { setValidNA(true); setValue('valid_until', '') }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                validNA
                  ? 'bg-gray-600 text-white border-gray-600'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              N/A
            </button>
          </div>

          {validNA ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">No expiry date — quote has no valid-until.</p>
          ) : watch('valid_until') ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Valid until:{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Proposed start date &amp; time <span className="text-red-500">*</span></label>
            <button type="button" onClick={() => setPickOpen(true)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-amber-400 dark:border-[#C6A35D]/60 bg-amber-50 dark:bg-[#C6A35D]/10 text-sm text-gray-900 dark:text-[var(--text)] hover:border-amber-500 transition">
              <span className="flex items-center gap-2"><Calendar size={15} className="text-amber-600 dark:text-[#C6A35D]" />{schedule ? formatDateTime(schedule) : 'Set proposed start'}</span>
              <span className="text-xs text-amber-700 dark:text-[#C6A35D] font-semibold">{schedule ? 'Change' : 'Select'}</span>
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The job schedules to this time once the quote is approved.</p>
            {pickOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPickOpen(false)}>
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-5" onClick={e => e.stopPropagation()}>
                  <p className="text-sm font-bold text-[var(--text)] mb-3">Propose a start date &amp; time</p>
                  <SchedulePicker priority={priority} createdAt={createdAt ?? new Date().toISOString()} busy={false}
                    onConfirm={iso => { setSchedule(iso); setPickOpen(false); setError('') }} onCancel={() => setPickOpen(false)} />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {confirmVals && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">{isVariation ? 'Submit this variation order to the manager?' : 'Send this quote to the manager?'} Please double-check the amount and details first.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => doSubmit(confirmVals)} disabled={loading} className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">{loading ? 'Submitting…' : isVariation ? 'Yes, submit variation order' : 'Yes, send quote'}</button>
              <button type="button" onClick={() => setConfirmVals(null)} className="px-3 py-2 rounded-lg ring-1 ring-gray-300 dark:ring-gray-600 text-gray-600 dark:text-gray-300 text-sm">Back</button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={loading} className={`flex-1 ${isVariation
            ? 'bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]'
            : 'bg-green-600 hover:bg-green-700 text-white border-green-600 focus:ring-green-500'}`} disabled={uploading || parsing}>
            {uploading ? (
              <><Loader2 size={14} className="animate-spin mr-1.5" /> Uploading…</>
            ) : isEdit ? 'Update Quote' : isVariation ? 'Submit Variation Order' : 'Send Quote'}
          </Button>
          <Button type="button" variant="danger" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
