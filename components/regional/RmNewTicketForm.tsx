'use client'

// RM logs a ticket on behalf of a store — the SM "Log a Ticket" wizard, plus a
// Store step (the RM covers several stores, so they pick one) and a Suppliers
// step (assign who quotes). Same stepper / look & feel as the SM wizard; posts
// to /api/regional/tickets and the normal lifecycle continues from there.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Camera, X, Check, ArrowRight, ArrowLeft, Search, Store as StoreIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadTicketPhotos } from '@/lib/upload'
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils'
import { categoryVisual } from '@/lib/categoryVisual'

const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Shopfront', 'General', 'Cleaning', 'Other']
const IMPACTS = Object.entries(OPERATIONAL_IMPACT_LABELS).map(([v, label]) => ({ v, label }))
const MAX_PHOTOS = 5

const STEPS = [
  { key: 'store', label: 'Store' },
  { key: 'issue', label: 'Issue' },
  { key: 'details', label: 'Details' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'photos', label: 'Photos' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'review', label: 'Review' },
] as const
const LAST = STEPS.length - 1

export function RmNewTicketForm({ stores, suppliers }: { stores: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [storeId, setStoreId] = useState('')
  const [category, setCategory] = useState('')
  const [impact, setImpact] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [storeQ, setStoreQ] = useState('')
  const [supplierQ, setSupplierQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Object URLs for thumbnails; revoked when the file list changes / unmounts.
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])

  const remaining = Math.max(0, MAX_PHOTOS - files.length)
  function addFiles(incoming: File[]) {
    const imgs = incoming.filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...imgs].slice(0, MAX_PHOTOS))
  }

  const storeName = stores.find(s => s.id === storeId)?.name ?? ''
  const impactLabel = impact ? OPERATIONAL_IMPACT_LABELS[impact] : ''
  const toggleSupplier = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shownStores = useMemo(() => {
    const term = storeQ.trim().toLowerCase()
    return stores.filter(s => !term || s.name.toLowerCase().includes(term))
  }, [stores, storeQ])
  const shownSuppliers = useMemo(() => {
    const term = supplierQ.trim().toLowerCase()
    return [...suppliers]
      .filter(s => !term || s.name.toLowerCase().includes(term))
      .sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name))
  }, [suppliers, supplierQ, sel])

  // Raised slate field on the card, emerald focus accent — matches the SM wizard.
  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60'

  // Per-step gate — returns an error message when the step isn't ready to advance.
  function stepError(i: number): string | null {
    if (i === 0 && !storeId) return 'Select the store this ticket is for.'
    if (i === 1 && !category) return 'Select a category to continue.'
    if (i === 2 && !description.trim()) return 'Add a short description of the issue.'
    if (i === 3 && !impact) return 'Choose how this affects trading.'
    if (i === 4 && files.length < 2) return 'Add at least 2 photos of the issue (up to 5).'
    if (i === 5 && sel.size < 1) return 'Assign at least one supplier to quote.'
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
      if (failed.length) { setStep(4); setError(`${failed.length} photo${failed.length === 1 ? '' : 's'} failed to upload (${failed.join(', ')}) — check your connection and try again.`); setLoading(false); return }
      // No title field — the API auto-composes "Category — first words of description".
      const res = await fetch('/api/regional/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, description, category, operational_impact: impact, photo_urls, supplierIds: [...sel] }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed to log ticket') }
      router.push('/regional/tickets'); router.refresh()
    } catch (e: any) { setError(e.message ?? 'Failed'); setLoading(false) }
  }

  return (
    <>
      <Stepper step={step} onJump={goTo} />

      {/* Announce the active step for screen readers. */}
      <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>

      <div className="min-h-[240px]">
        {step === 0 && (
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">Which store is this for?</legend>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Pick the store this ticket belongs to.</p>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input value={storeQ} onChange={e => setStoreQ(e.target.value)} placeholder="Search stores…" className={`${input} pl-9`} autoFocus />
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
              {shownStores.map(s => {
                const active = storeId === s.id
                return (
                  <button key={s.id} type="button" onClick={() => setStoreId(s.id)} aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${active
                      ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                    <span className="flex min-w-0 items-center gap-2"><StoreIcon size={16} className="shrink-0 text-indigo-500" /><span className="truncate">{s.name}</span></span>
                    {active && <Check size={16} className="shrink-0 text-emerald-500" />}
                  </button>
                )
              })}
              {!shownStores.length && <p className="px-1 py-2 text-sm text-[var(--text-faint)]">{stores.length ? 'No stores match.' : 'No stores in your region yet.'}</p>}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">What is the issue?</legend>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Select the category that best fits the job.</p>
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

        {step === 2 && (
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">Describe the issue</legend>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">What&apos;s wrong, where, and since when.</p>
            <textarea className={`${input} min-h-[150px]`} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. The walk-in freezer in the back stopped cooling since this morning…" autoFocus />
          </fieldset>
        )}

        {step === 3 && (
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

        {step === 4 && (
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">Add photos</legend>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Minimum 2, up to 5. Clear shots help the contractor quote faster.</p>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
              className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[var(--text)] text-sm font-medium transition ${remaining ? 'cursor-pointer hover:border-emerald-500/60' : 'opacity-50 cursor-not-allowed'}`}>
                  <ImagePlus size={16} /> Browse
                  <input type="file" accept="image/*" multiple disabled={!remaining} className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </label>
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

        {step === 5 && (
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--text)]">Assign suppliers to quote</legend>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Choose one or more suppliers to invite to quote this job.</p>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input value={supplierQ} onChange={e => setSupplierQ(e.target.value)} placeholder="Search suppliers…" className={`${input} pl-9`} autoFocus />
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
              {shownSuppliers.map(s => {
                const on = sel.has(s.id)
                return (
                  <button key={s.id} type="button" onClick={() => toggleSupplier(s.id)} aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${on
                      ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text)] ring-2 ring-emerald-500/30'
                      : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-[var(--text-muted)] hover:border-emerald-500/60'}`}>
                    <span className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${on ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-500'}`}>{on && <Check size={12} className="text-white" />}</span>
                    <span className="truncate flex-1">{s.name}</span>
                  </button>
                )
              })}
              {!shownSuppliers.length && <p className="px-1 py-2 text-sm text-[var(--text-faint)]">{suppliers.length ? 'No suppliers match.' : 'No suppliers on file yet.'}</p>}
            </div>
            {sel.size > 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">{sel.size} supplier{sel.size > 1 ? 's' : ''} selected</p>}
          </fieldset>
        )}

        {step === 6 && (
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Review &amp; submit</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-3">Check the details, then submit.</p>
            <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              <ReviewRow label="Store" onEdit={() => setStep(0)}>{storeName || '—'}</ReviewRow>
              <ReviewRow label="Category" onEdit={() => setStep(1)}>{category ? <CategoryTag category={category} /> : '—'}</ReviewRow>
              <ReviewRow label="Description" onEdit={() => setStep(2)}>{description.trim() || '—'}</ReviewRow>
              <ReviewRow label="Urgency" onEdit={() => setStep(3)}>{impactLabel || '—'}</ReviewRow>
              <ReviewRow label="Photos" onEdit={() => setStep(4)}>
                <div className="flex flex-wrap gap-2">
                  {previews.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL
                    <img key={i} src={u} alt={`Photo ${i + 1}`} onClick={() => setPreview(u)} className="h-12 w-12 rounded-lg object-cover cursor-pointer border border-[var(--border)]" />
                  ))}
                </div>
              </ReviewRow>
              <ReviewRow label="Suppliers" onEdit={() => setStep(5)}>{sel.size ? [...sel].map(id => suppliers.find(s => s.id === id)?.name ?? 'Supplier').join(', ') : '—'}</ReviewRow>
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

      {/* Tap-to-view lightbox */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral blob: preview URL; next/image can't optimize it */}
          <img src={preview} alt="Photo preview" className="max-h-full max-w-full rounded-lg" />
          <button type="button" onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Close"><X size={22} /></button>
        </div>
      )}
    </>
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
