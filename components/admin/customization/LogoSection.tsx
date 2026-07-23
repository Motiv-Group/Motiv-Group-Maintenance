'use client'

// Section 2 — Logo & app icons. Upload the three master images once; the
// backend generates every icon size, applies the web ones instantly and packs
// a zip for the Android app / code repo (those need a rebuild to pick up).
import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, ImageIcon, ImageUp, Loader2, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useFileDrop } from '@/components/ui/useFileDrop'
import { formatDate } from '@/lib/utils'
import type { AppSettings, BrandingState } from '@/lib/settings'
import { Callout, DarkTile, Section, postForm, postJson, useAsyncSave, validateImage } from './shared'

type SettingsResponse = { ok: true; settings: AppSettings }

type SlotKey = 'symbol' | 'wordmark' | 'lockup'
type Picked = { file: File; url: string }

const SLOTS: { key: SlotKey; title: string; desc: string; fileKey: string; fallback: string }[] = [
  { key: 'symbol', title: 'Symbol', desc: 'the M mark — used for icons', fileKey: 'symbol.png', fallback: '/brand/motiv-symbol.png' },
  { key: 'wordmark', title: 'Wordmark', desc: 'the MOTIV text — white, only visible on dark backgrounds', fileKey: 'wordmark.png', fallback: '/brand/motiv-wordmark.png' },
  { key: 'lockup', title: 'Lockup', desc: 'symbol + text — used on the login screen', fileKey: 'lockup.png', fallback: '/brand/motiv-lockup.png' },
]

const GENERATED: { key: string; label: string }[] = [
  { key: 'favicon-16.png', label: 'Favicon 16×16' },
  { key: 'favicon-32.png', label: 'Favicon 32×32' },
  { key: 'icon-192.png', label: 'App icon 192' },
  { key: 'icon-512.png', label: 'App icon 512' },
  { key: 'icon-512-maskable.png', label: 'Maskable (Android)' },
  { key: 'apple-touch-icon.png', label: 'Apple touch icon' },
]

// One upload slot — its own drag-and-drop target sharing the parent's addFiles.
function SlotCard({ slot, chosen, previewSrc, generating, err, onPick, onDropFiles }: {
  slot: { key: SlotKey; title: string; desc: string; fileKey: string; fallback: string }
  chosen: Picked | null
  previewSrc: string
  generating: boolean
  err?: string
  onPick: (e: ChangeEvent<HTMLInputElement>) => void
  onDropFiles: (files: File[]) => void
}) {
  const src = chosen?.url ?? previewSrc
  const { isDragging, dropProps } = useFileDrop({
    onFiles: onDropFiles,
    accept: 'image/png,image/webp',
    multiple: false,
    disabled: generating,
  })
  return (
    <div className="min-w-0 space-y-2">
      <div>
        <div className="text-xs font-semibold text-[var(--text)]">{slot.title}</div>
        <div className="text-[11px] leading-snug text-[var(--text-faint)]">{slot.desc}</div>
      </div>
      <div {...dropProps} className={`relative rounded-xl transition ${isDragging ? 'ring-2 ring-blue-500' : ''}`}>
        <DarkTile className="grid h-28 place-items-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs; next/image is not worth configuring for previews */}
          <img src={src} alt={`${slot.title} preview`} className="max-h-full max-w-full object-contain" />
        </DarkTile>
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-blue-500/10 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            Drop image here
          </div>
        )}
      </div>
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-semibold text-blue-600 ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] dark:text-blue-400 ${generating ? 'pointer-events-none opacity-50' : ''}`}>
        <input type="file" accept="image/png,image/webp" className="sr-only" disabled={generating} onChange={onPick} />
        <ImageUp size={13} /> {chosen ? 'Change image' : 'Choose image'}
      </label>
      {chosen && <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">New image selected — not applied yet</p>}
      {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}

export function LogoSection({ initialBranding }: { initialBranding: BrandingState }) {
  const router = useRouter()
  const [branding, setBranding] = useState<BrandingState>(initialBranding)
  const [picked, setPicked] = useState<Record<SlotKey, Picked | null>>({ symbol: null, wordmark: null, lockup: null })
  const [fileErr, setFileErr] = useState<Partial<Record<SlotKey, string>>>({})
  const [confirmRevert, setConfirmRevert] = useState(false)

  const gen = useAsyncSave<SettingsResponse>()
  const revert = useAsyncSave<SettingsResponse>()
  const generating = gen.state === 'saving'
  const anyPicked = SLOTS.some((s) => picked[s.key] !== null)

  // branding.version is the backend's cache-busting stamp (epoch ms when set
  // by Date.now()); only format it as a date when it plausibly is one.
  const activeSince = branding.version != null && branding.version > 1e11
    ? formatDate(new Date(branding.version).toISOString())
    : null

  // Core selection logic — shared by the <input onChange> and drag-and-drop.
  // These slots are single-file, so only the first file is used.
  function addFiles(key: SlotKey, files: File[]) {
    const file = files[0]
    if (!file) return
    const err = validateImage(file, ['image/png', 'image/webp'])
    setFileErr((prev) => ({ ...prev, [key]: err ?? undefined }))
    if (err) return
    const old = picked[key]
    if (old) URL.revokeObjectURL(old.url)
    const url = URL.createObjectURL(file)
    setPicked((prev) => ({ ...prev, [key]: { file, url } }))
  }

  function pick(key: SlotKey, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    addFiles(key, files)
  }

  async function generate() {
    const chosen = SLOTS.map((s) => ({ key: s.key, picked: picked[s.key] })).filter((c) => c.picked)
    if (!chosen.length) return
    const data = await gen.run(() => {
      const fd = new FormData()
      for (const c of chosen) fd.append(c.key, c.picked!.file)
      return postForm<SettingsResponse>('/api/admin/branding/logo', fd)
    })
    if (data) {
      for (const c of chosen) URL.revokeObjectURL(c.picked!.url)
      setPicked({ symbol: null, wordmark: null, lockup: null })
      setBranding(data.settings.branding)
      router.refresh()
    }
  }

  async function doRevert(close: () => void) {
    const data = await revert.run(() => postJson<SettingsResponse>('/api/admin/customization', { resetBranding: true }))
    if (data) {
      setBranding(data.settings.branding)
      close()
      router.refresh()
    }
  }

  return (
    <Section
      icon={<ImageIcon size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Logo & app icons"
      blurb="Upload one, two or all three master images — only the ones you pick are updated. The system generates every size the app needs (favicons, home-screen icons, Android launcher icons) and applies the web ones instantly. The zip is for the Android app and the code repository, which need a rebuild to pick the new logo up."
    >
      {/* Three upload slots — stack on mobile, side by side from sm. */}
      <div className="grid gap-4 sm:grid-cols-3">
        {SLOTS.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            chosen={picked[slot.key]}
            previewSrc={branding.files[slot.fileKey] ?? slot.fallback}
            generating={generating}
            err={fileErr[slot.key]}
            onPick={(e) => pick(slot.key, e)}
            onDropFiles={(files) => addFiles(slot.key, files)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={!anyPicked || generating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {generating ? 'Generating…' : 'Generate & apply'}
        </button>
        {generating && (
          <span className="text-xs text-[var(--text-muted)]">Generating icon sizes — this can take up to half a minute…</span>
        )}
        {!generating && !anyPicked && (
          <span className="text-[11px] text-[var(--text-faint)]">Pick at least one image to enable. PNG or WebP, up to 8 MB each. The Symbol regenerates all favicons &amp; app icons.</span>
        )}
        {gen.state === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{gen.error}</span>}
      </div>

      {/* Active custom branding: what was generated + the zip for the developer. */}
      {branding.version != null && (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} /> Custom logo active{activeSince ? ` since ${activeSince}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setConfirmRevert(true)}
              className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
            >
              Revert to built-in logo
            </button>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold text-[var(--text)]">What was generated</h3>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {GENERATED.map((g) => {
                const url = branding.files[g.key]
                if (!url) return null
                return (
                  <div key={g.key} className="min-w-0 space-y-1">
                    <DarkTile className="grid h-16 place-items-center p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
                      <img src={url} alt={g.label} className="max-h-full max-w-full object-contain" />
                    </DarkTile>
                    <div className="text-center text-[10px] leading-tight text-[var(--text-faint)]">{g.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {branding.zipUrl && (
            <a
              href={branding.zipUrl}
              download
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              <Download size={15} /> Download full asset pack (.zip)
            </a>
          )}

          <Callout>
            Web is already updated. The zip contains files for the Android app and the code repository — hand it to your developer / follow the README inside.
          </Callout>
        </div>
      )}

      {confirmRevert && (
        <Modal onClose={() => setConfirmRevert(false)}>
          {(close) => (
            <>
              <h3 className="text-base font-bold text-[var(--text)]">Revert to the built-in logo?</h3>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                The app goes back to the original Motiv logo and icons everywhere — browser tab, home-screen icon and login screen. You can upload a new logo again at any time.
              </p>
              {revert.state === 'error' && <p className="text-xs text-red-600 dark:text-red-400">{revert.error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => doRevert(close)}
                  disabled={revert.state === 'saving'}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {revert.state === 'saving' && <Loader2 size={15} className="animate-spin" />}
                  Revert logo
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </Section>
  )
}
