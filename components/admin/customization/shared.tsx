'use client'

// Shared building blocks for the admin Customize page (sections, save state,
// colour fields, dark preview tiles). Theme-aware via the CSS vars in
// globals.css — the only hardcoded colour is DarkTile (see its comment).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Info, Loader2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

/* ---------------------------------- fetch ---------------------------------- */

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong — please try again.')
  return data as T
}

/** multipart POST — no Content-Type header so the browser sets the boundary. */
export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong — please try again.')
  return data as T
}

/* ------------------------------- save machine ------------------------------ */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Per-section save/upload state: spinner while running, a success tick that
 *  clears itself after a moment, and the error message for inline display. */
export function useAsyncSave<T>() {
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function run(task: () => Promise<T>): Promise<T | null> {
    if (timer.current) clearTimeout(timer.current)
    setState('saving')
    setError('')
    try {
      const result = await task()
      setState('saved')
      timer.current = setTimeout(() => setState('idle'), 2500)
      return result
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Something went wrong — please try again.')
      return null
    }
  }

  return { state, error, run }
}

/* --------------------------------- layout --------------------------------- */

export function Section({ icon, title, blurb, children }: {
  icon: ReactNode
  title: string
  blurb: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">{icon}{title}</h2>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{blurb}</p>
      </div>
      {children}
    </Card>
  )
}

export const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-blue-500/50'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-[var(--text-faint)]">{hint}</span>}
    </label>
  )
}

/** Save button + inline saved-tick / error message for a section. */
export function SaveRow({ state, error, dirty, onSave, label = 'Save changes' }: {
  state: SaveState
  error: string
  dirty: boolean
  onSave: () => void
  label?: string
}) {
  const saving = state === 'saving'
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving && <Loader2 size={15} className="animate-spin" />}
        {saving ? 'Saving…' : label}
      </button>
      {state === 'saved' && !dirty && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Check size={14} /> Saved
        </span>
      )}
      {state === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/* -------------------------------- dark tile -------------------------------- */

// Logo previews sit on a fixed dark checkerboard: the wordmark/lockup masters
// are white-on-transparent and would be invisible on a light surface. The
// hardcoded hex is deliberate — this tile must stay dark in BOTH themes, so it
// is exempt from the "always use CSS vars" rule.
const DARK_TILE_STYLE: CSSProperties = {
  backgroundColor: '#0e1016',
  backgroundImage:
    'linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%), ' +
    'linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.05) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
}

export function DarkTile({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div style={DARK_TILE_STYLE} className={`overflow-hidden rounded-xl ring-1 ring-[var(--border)] ${className}`}>
      {children}
    </div>
  )
}

/* ------------------------------- colour utils ------------------------------ */

/** '#rgb' / 'rgb' / '#rrggbb' / 'rrggbb' → canonical '#rrggbb', else null. */
export function normalizeHex(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (s.startsWith('#')) s = s.slice(1)
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/.test(s)) return null
  return `#${s}`
}

/** Mix a hex colour toward a target channel value (255 = white, 0 = black). */
function mixChannel(hex: string, target: number, amount: number): string {
  const parts = [0, 1, 2].map((i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.max(0, Math.min(255, Math.round(v + (target - v) * amount)))
  })
  return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export const lighten = (hex: string, amount: number) => mixChannel(hex, 255, amount)
export const darken = (hex: string, amount: number) => mixChannel(hex, 0, amount)

/** Colour wheel + editable hex text field, synced both ways. */
export function ColorField({ label, hint, value, onChange }: {
  label: string
  hint?: string
  value: string
  onChange: (hex: string) => void
}) {
  // Free-typed text is kept as a draft only while the field is focused, so a
  // partial entry ("0d1f" mid-type) is never clobbered by the canonical value;
  // blur snaps the field back to the last valid hex.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg bg-[var(--input-bg)] p-1 ring-1 ring-[var(--border)]"
        />
        <input
          type="text"
          value={draft ?? value}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} hex value`}
          onFocus={() => setDraft(value)}
          onChange={(e) => {
            setDraft(e.target.value)
            const hex = normalizeHex(e.target.value)
            if (hex) onChange(hex)
          }}
          onBlur={() => setDraft(null)}
          className={`${inputCls} font-mono`}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-[var(--text-faint)]">{hint}</p>}
    </div>
  )
}

/* ------------------------------ file validation ---------------------------- */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const TYPE_NAMES: Record<string, string> = {
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/jpeg': 'JPG',
}

export function validateImage(file: File, allowedTypes: string[]): string | null {
  if (!allowedTypes.includes(file.type)) {
    const names = allowedTypes.map((t) => TYPE_NAMES[t] ?? t).join(' or ')
    return `That file type isn't supported — please use a ${names} image.`
  }
  if (file.size > MAX_IMAGE_BYTES) return 'That image is over 8 MB — please use a smaller file.'
  return null
}
