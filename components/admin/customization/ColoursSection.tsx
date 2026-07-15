'use client'

// Section 3 — Colours. Two simple pickers (chrome + warm accent) that derive
// the full 8-stop brand palette, an advanced per-stop editor, and a live
// preview rendered from the CURRENT unsaved values via inline styles.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, ChevronDown, Loader2, Palette } from 'lucide-react'
import { BRAND_DEFAULT_HEX, type AppSettings, type BrandStop } from '@/lib/settings'
import { ColorField, Section, darken, lighten, postJson, useAsyncSave } from './shared'

type SettingsResponse = { ok: true; settings: AppSettings }

const STOP_ORDER: BrandStop[] = ['50', '100', '300', '400', '500', '600', '700', '900']

const STOP_HINTS: Record<BrandStop, string> = {
  '50': 'Lightest warm tint — page highlights & subtle fills',
  '100': 'Light warm tint — badges & soft backgrounds',
  '300': 'Mid warm shade — borders & muted accents',
  '400': 'Warm accent — headings, highlights & badges',
  '500': 'Raised chrome surfaces — chips on the nav bars',
  '600': 'Nav bars & app chrome — the main brand colour',
  '700': 'Deep chrome — nav borders & pressed states',
  '900': 'Deepest backgrounds & shadows',
}

function toFull(overrides: Partial<Record<BrandStop, string>>): Record<BrandStop, string> {
  const full = { ...BRAND_DEFAULT_HEX } as Record<BrandStop, string>
  for (const stop of STOP_ORDER) {
    const v = overrides[stop]
    if (v) full[stop] = v.toLowerCase()
  }
  return full
}

const AUTH_BTN_DEFAULT = '#2563eb'

export function ColoursSection({ initialColors, initialButtonColor, appName, symbolSrc }: {
  initialColors: Partial<Record<BrandStop, string>>
  initialButtonColor: string
  appName: string
  symbolSrc: string
}) {
  const router = useRouter()
  const [stops, setStops] = useState<Record<BrandStop, string>>(() => toFull(initialColors))
  const [savedStops, setSavedStops] = useState<Record<BrandStop, string>>(() => toFull(initialColors))
  const [btn, setBtn] = useState(initialButtonColor)
  const [savedBtn, setSavedBtn] = useState(initialButtonColor)
  const [advanced, setAdvanced] = useState(false)
  // Which button kicked off the in-flight request, so only it shows a spinner.
  const [op, setOp] = useState<'save' | 'reset' | null>(null)
  const saver = useAsyncSave<SettingsResponse>()
  const saving = saver.state === 'saving'

  const dirty = btn !== savedBtn || STOP_ORDER.some((s) => stops[s] !== savedStops[s])
  const canReset = btn.toLowerCase() !== AUTH_BTN_DEFAULT || STOP_ORDER.some(
    (s) => stops[s] !== String(BRAND_DEFAULT_HEX[s]).toLowerCase() || savedStops[s] !== String(BRAND_DEFAULT_HEX[s]).toLowerCase(),
  )

  // Chrome colour drives the dark stops; warm accent drives the light tints.
  function setChrome(hex: string) {
    setStops((s) => ({ ...s, '500': lighten(hex, 0.08), '600': hex, '700': darken(hex, 0.35), '900': darken(hex, 0.6) }))
  }
  function setAccent(hex: string) {
    setStops((s) => ({ ...s, '50': lighten(hex, 0.9), '100': lighten(hex, 0.72), '300': lighten(hex, 0.28), '400': hex }))
  }

  async function saveColours() {
    setOp('save')
    // Only stops that differ from the defaults go over the wire; stops equal
    // to the default are omitted (that's the contract for "no override").
    const overrides: Partial<Record<BrandStop, string>> = {}
    for (const s of STOP_ORDER) {
      if (stops[s] !== String(BRAND_DEFAULT_HEX[s]).toLowerCase()) overrides[s] = stops[s]
    }
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', { colors: overrides, authButtonColor: btn }))
    if (data) {
      const full = toFull(data.settings.colors)
      setStops(full)
      setSavedStops(full)
      setBtn(data.settings.authButtonColor)
      setSavedBtn(data.settings.authButtonColor)
      router.refresh()
    }
  }

  async function resetColours() {
    setOp('reset')
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', { colors: {}, authButtonColor: AUTH_BTN_DEFAULT }))
    if (data) {
      const full = toFull({})
      setStops(full)
      setSavedStops(full)
      setBtn(data.settings.authButtonColor)
      setSavedBtn(data.settings.authButtonColor)
      router.refresh()
    }
  }

  return (
    <Section
      icon={<Palette size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Colours"
      blurb="The app's colour scheme — the dark chrome (navigation bars, buttons on the login screen) and the warm accent shades used for tints and badges. Changes apply instantly for everyone after saving; no redeploy needed."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField
          label="Chrome colour"
          hint="The dark base colour — top and bottom navigation bars, and the main buttons on the login screen."
          value={stops['600']}
          onChange={setChrome}
        />
        <ColorField
          label="Warm accent"
          hint="The warm highlight colour — light tints, badges and subtle borders."
          value={stops['400']}
          onChange={setAccent}
        />
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400"
      >
        <ChevronDown size={14} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} />
        Advanced: edit individual shades
      </button>
      {advanced && (
        <div className="grid gap-3 sm:grid-cols-2">
          {STOP_ORDER.map((stop) => (
            <ColorField
              key={stop}
              label={`Shade ${stop}`}
              hint={STOP_HINTS[stop]}
              value={stops[stop]}
              onChange={(hex) => setStops((s) => ({ ...s, [stop]: hex }))}
            />
          ))}
        </div>
      )}

      {/* Live preview from the CURRENT unsaved values — inline styles only,
          since these colours don't exist as Tailwind classes yet. */}
      <div>
        <div className="overflow-hidden rounded-xl ring-1 ring-[var(--border)]">
          <div
            style={{ backgroundColor: stops['600'], borderBottom: `1px solid ${stops['700']}` }}
            className="flex items-center gap-2.5 px-4 py-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
            <img src={symbolSrc} alt="" className="h-5 w-5 object-contain" />
            <span className="text-xs font-bold text-white">{appName || 'Motiv'}</span>
            <span className="ml-auto grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: stops['500'] }}>
              <Bell size={11} className="text-white/80" />
            </span>
          </div>
          <div className="space-y-3 bg-[var(--app-bg)] p-4">
            <button
              type="button"
              tabIndex={-1}
              className="pointer-events-none rounded-lg px-3.5 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: stops['600'] }}
            >
              Primary button
            </button>
            <div className="rounded-lg p-3" style={{ backgroundColor: stops['50'], border: `1px solid ${stops['400']}` }}>
              <div className="text-xs font-semibold" style={{ color: stops['900'] }}>Highlight card</div>
              <div className="text-[11px]" style={{ color: stops['700'] }}>Warm tint surface with the accent border.</div>
            </div>
            <div className="flex gap-1.5">
              {STOP_ORDER.map((s) => (
                <div key={s} className="min-w-0 flex-1 text-center">
                  <div className="h-6 rounded-md ring-1 ring-black/10" style={{ backgroundColor: stops[s] }} />
                  <div className="mt-0.5 text-[9px] tabular-nums text-[var(--text-faint)]">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">Preview — how the main surfaces will look.</p>
      </div>

      {/* Login button colour — independent of the chrome palette, with its own
          preview on the dark login background. */}
      <div className="grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
        <ColorField
          label="Login button colour"
          hint="The colour of the “Log in” / “Create account” buttons on the sign-in screens. Use a hex code or the picker."
          value={btn}
          onChange={setBtn}
        />
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Preview</span>
          <div className="grid place-items-center rounded-xl bg-[#0b0c11] px-4 py-5 ring-1 ring-[var(--border)]">
            <button
              type="button"
              tabIndex={-1}
              className="pointer-events-none w-full max-w-[220px] rounded-lg px-6 py-3 text-base font-semibold text-white shadow-sm"
              style={{ backgroundColor: btn }}
            >
              Log in
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={saveColours}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && op === 'save' && <Loader2 size={15} className="animate-spin" />}
          {saving && op === 'save' ? 'Saving…' : 'Save colours'}
        </button>
        <button
          type="button"
          onClick={resetColours}
          disabled={!canReset || saving}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && op === 'reset' && <Loader2 size={15} className="animate-spin" />}
          Reset to Motiv defaults
        </button>
        {saver.state === 'saved' && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Check size={14} /> Saved
          </span>
        )}
        {saver.state === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{saver.error}</span>}
      </div>
    </Section>
  )
}
