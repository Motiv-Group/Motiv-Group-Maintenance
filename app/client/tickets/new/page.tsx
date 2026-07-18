'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { PlusCircle, ImagePlus, Camera, X, Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadTicketPhotos } from '@/lib/upload'
import { Card } from '@/components/exec/ui'
import { OPERATIONAL_IMPACT_LABELS, storeLabel } from '@/lib/utils'
import { categoryVisual } from '@/lib/categoryVisual'
import { useScrollLock } from '@/lib/useScrollLock'

// Category grid — same taxonomy the API + health engine expect. Icons/colours
// come from the shared categoryVisual() map so they match everywhere. "Multiple"
// covers a job spanning several trades (e.g. shopfront + plumbing + electrical).
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Shopfront', 'Cleaning', 'General', 'Multiple', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))
const MAX_PHOTOS = 5

const STEPS = [
  { key: 'issue', label: 'Issue' },
  { key: 'details', label: 'Details' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'photos', label: 'Photos' },
  { key: 'review', label: 'Review' },
] as const
const LAST = STEPS.length - 1

export default function LogTicketPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [impact, setImpact] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [storeName, setStoreName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Lock page scroll while the photo lightbox overlay is open.
  useScrollLock(!!preview)

  // Object URLs for thumbnails; revoked when the file list changes / unmounts.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])

  // Store is auto-detected from the SM's link (they don't pick one) — fetch its
  // name purely to confirm it read-only on the Review step. RLS ("stores read")
  // lets a store manager read their own store, so the browser client is fine.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: link } = await supabase.from('store_users').select('store_id').eq('user_id', user.id).limit(1).maybeSingle()
        if (!link?.store_id) return
        const { data: s } = await supabase.from('stores').select('name, sub_store').eq('id', link.store_id).maybeSingle()
        // storeLabel() de-dupes so a store whose sub_store == name shows once.
        if (alive && s) setStoreName(storeLabel(s.name, s.sub_store))
      } catch { /* best-effort; Review falls back to a generic label */ }
    })()
    return () => { alive = false }
  }, [])

  const remaining = Math.max(0, MAX_PHOTOS - files.length)
  function addFiles(incoming: File[]) {
    const imgs = incoming.filter(f => !f.type || f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...imgs].slice(0, MAX_PHOTOS))
  }

  // Raised slate field on the card, green focus accent — matches the design.
  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  // Per-step gate — returns an error message when the step isn't ready to advance.
  function stepError(i: number): string | null {
    if (i === 0 && !category) return 'Select a category to continue.'
    if (i === 1 && !description.trim()) return 'Add a short description of the issue.'
    if (i === 2 && !impact) return 'Choose how this affects trading.'
    if (i === 3 && files.length < 2) return 'Add at least 2 photos of the issue (up to 5).'
    return null
  }

  function goNext() {
    const msg = stepError(step)
    if (msg) { setError(msg); return }
    setError(''); setStep(s => Math.min(s + 1, LAST))
  }
  function goBack() { setError(''); setStep(s => Math.max(s - 1, 0)) }
  function goTo(i: number) { if (i < step) { setError(''); setStep(i) } }

  async function submit() {
    // Re-check every gate before firing (guards against jumping into Review).
    for (let i = 0; i < LAST; i++) { const msg = stepError(i); if (msg) { setStep(i); setError(msg); return } }
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      // Parallel upload; a failed photo BLOCKS submit instead of being silently dropped.
      const { urls: photo_urls, failed } = await uploadTicketPhotos(files, user?.id)
      if (failed.length) { setStep(3); setError(`${failed.length} photo${failed.length === 1 ? '' : 's'} failed to upload (${failed.join(', ')}) — check your connection and try again.`); setLoading(false); return }
      // No title field — the API auto-composes "Category — first words of
      // description" (store staff typing free-text titles produced nonsense).
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, category, operational_impact: impact, photo_urls }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed to log ticket') }
      router.push('/client/tickets'); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setLoading(false) }
  }

  const impactLabel = impact ? OPERATIONAL_IMPACT_LABELS[impact] : ''

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <BackLink fallbackHref="/client/tickets" label="Back to tickets" />

      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><PlusCircle className="text-emerald-500" size={22} /> Log a Ticket</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">A few quick steps and we&apos;ll take it from there.</p></div>

      <Card className="p-5 sm:p-6 space-y-6">
        <Stepper step={step} onJump={goTo} />

        {/* Announce the active step for screen readers. */}
        <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>

        <div className="min-h-[220px]">
          {step === 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-[var(--text)]">What is the issue?</legend>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Select a category. Choose <span className="font-semibold">Multiple</span> for a job that spans several trades.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {CATEGORIES.map(name => {
                  const active = category === name
                  const { Icon, textClass } = categoryVisual(name)
                  return (
                    <button key={name} type="button" onClick={() => setCategory(name)} aria-pressed={active}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-sm font-medium transition ${active
                        ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                      <Icon size={22} className={textClass} />
                      {name}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="text-sm font-semibold text-[var(--text)]">Describe the issue</legend>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">What&apos;s wrong, where, and since when.</p>
              <textarea className={`${input} min-h-[150px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. The walk-in freezer in the back stopped cooling since this morning…" autoFocus />
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="text-sm font-semibold text-[var(--text)]">How urgent is it?</legend>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Pick the impact on trading — this sets the priority.</p>
              <div className="space-y-2">
                {IMPACTS.map(i => {
                  const active = impact === i.v
                  return (
                    <button key={i.v} type="button" onClick={() => setImpact(i.v)} aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${active
                        ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                      {i.label}
                      {active && <Check size={16} className="shrink-0 text-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset>
              <legend className="text-sm font-semibold text-[var(--text)]">Add photos</legend>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Minimum 2, up to 5. Clear shots help the contractor quote faster.</p>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
                className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  {/* Browse — pick existing images */}
                  <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                    <ImagePlus size={16} /> Browse
                    <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                  </label>
                  {/* Take Photo — opens the device camera on phones (capture) */}
                  <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                    <Camera size={16} /> Take Photo
                    <input type="file" accept="image/*" capture="environment" disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                  </label>
                </div>
                <p className="text-center text-[11px] text-[var(--text-faint)] mt-2.5">{remaining} of {MAX_PHOTOS} slots remaining · drag &amp; drop also works</p>

                {files.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {files.map((f, i) => (
                      <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border)]">
                        <button type="button" onClick={() => setPreview(previews[i])} className="block h-full w-full" title={`View ${f.name}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL */}
                          <img src={previews[i]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                        </button>
                        <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} title="Remove photo"
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-500">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Review &amp; submit</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Check the details, then submit.</p>
              <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                <ReviewRow label="Store">{storeName ?? 'Your assigned store'}</ReviewRow>
                <ReviewRow label="Category" onEdit={() => setStep(0)}>{category ? <CategoryTag category={category} /> : '—'}</ReviewRow>
                <ReviewRow label="Description" onEdit={() => setStep(1)}>{description.trim() || '—'}</ReviewRow>
                <ReviewRow label="Urgency" onEdit={() => setStep(2)}>{impactLabel || '—'}</ReviewRow>
                <ReviewRow label="Photos" onEdit={() => setStep(3)}>
                  <div className="flex flex-wrap gap-2">
                    {previews.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL
                      <img key={i} src={u} alt={`Photo ${i + 1}`} onClick={() => setPreview(u)} className="h-12 w-12 rounded-lg object-cover cursor-pointer border border-[var(--border)]" />
                    ))}
                  </div>
                </ReviewRow>
              </dl>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>}

        {/* Wizard navigation */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={goBack} disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover)] disabled:opacity-0 disabled:pointer-events-none">
            <ArrowLeft size={16} /> Back
          </button>
          {step < LAST ? (
            <button type="button" onClick={goNext}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500">
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {loading ? 'Submitting…' : 'Submit Ticket'}
            </button>
          )}
        </div>
      </Card>

      {/* Tap-to-view lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL; next/image can't optimize it */}
          <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
        </div>
      )}
    </div>
  )
}

// Numbered-circle stepper with a connector line — clear in light and dark mode.
// Completed steps are clickable to jump back; upcoming steps are inert.
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Log ticket progress">
      <ol className="flex">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo'
          // Opaque circle bg (matches the card) so the connector line sits BEHIND
          // the circles instead of striking through them.
          const circle = state === 'todo'
            ? 'border-slate-300 dark:border-slate-600 text-[var(--text-faint)] bg-[var(--surface)]'
            : 'border-blue-600 bg-blue-600 text-white'
          return (
            <li key={s.key} className="relative flex-1 flex flex-col items-center">
              {/* connector from the previous circle's centre to this one's */}
              {i > 0 && <span aria-hidden className={`absolute top-4 right-1/2 h-0.5 w-full ${i <= step ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`} />}
              {state === 'done' ? (
                <button type="button" onClick={() => onJump(i)} aria-label={`Go back to ${s.label}`}
                  className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${circle} transition hover:opacity-90`}>
                  <Check size={16} />
                </button>
              ) : (
                <span aria-current={state === 'current' ? 'step' : undefined}
                  className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${circle}`}>
                  {i + 1}
                </span>
              )}
              <span className={`mt-2 text-[11px] text-center ${state === 'current' ? 'font-semibold text-[var(--text)]' : state === 'done' ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'}`}>{s.label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CategoryTag({ category }: { category: string }) {
  const { Icon, textClass } = categoryVisual(category)
  return <span className="inline-flex items-center gap-2"><Icon size={16} className={textClass} /> {category}</span>
}

function ReviewRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">{label}</dt>
        <dd className="mt-1 text-sm text-[var(--text)] break-words">{children}</dd>
      </div>
      {onEdit && <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">Edit</button>}
    </div>
  )
}
