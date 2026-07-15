'use client'

// Section — Logo sizing & alignment. Two blocks with live previews:
//  · Nav logo: wordmark size + a vertical nudge so its bottom lines up with the
//    symbol's bottom (custom logos are trimmed differently to the built-in one).
//  · Login logo: separate desktop + mobile size and the gap above the card, so
//    the hero logo isn't oversized on phones.
import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Ruler } from 'lucide-react'
import type { AppSettings, LogoLayout } from '@/lib/settings'
import { LOGO_LAYOUT_DEFAULT, LOGO_LAYOUT_RANGE } from '@/lib/settings'
import { DarkTile, Section, SaveRow, postJson, useAsyncSave } from './shared'

type SettingsResponse = { ok: true; settings: AppSettings }

const eq = (a: LogoLayout, b: LogoLayout) =>
  (Object.keys(a) as (keyof LogoLayout)[]).every((k) => a[k] === b[k])

export function LogoLayoutSection({ initialLayout, symbolUrl, wordmarkUrl, lockupUrl, custom }: {
  initialLayout: LogoLayout
  symbolUrl: string
  wordmarkUrl: string
  lockupUrl: string
  /** Custom (trimmed) logo active — its symbol has no glow padding, so the nav
   *  wordmark sits at base shift 0 (built-in needs ~0.18). Mirrors app/layout. */
  custom: boolean
}) {
  const router = useRouter()
  const [layout, setLayout] = useState<LogoLayout>(initialLayout)
  const [saved, setSaved] = useState<LogoLayout>(initialLayout)
  const saver = useAsyncSave<SettingsResponse>()
  const dirty = !eq(layout, saved)

  const set = <K extends keyof LogoLayout>(k: K, v: number) => setLayout((l) => ({ ...l, [k]: v }))

  async function save() {
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', { logo: layout }))
    if (data) {
      setLayout(data.settings.logo)
      setSaved(data.settings.logo)
      router.refresh()
    }
  }
  function reset() {
    setLayout({ ...LOGO_LAYOUT_DEFAULT })
  }

  // Nav preview: mirror MotivLogo's layout at a fixed nav height (44px).
  const navH = 44
  const baseShift = custom ? 0 : 0.18
  const navShift = baseShift + layout.navWordmarkNudge
  const wordH = Math.round(navH * layout.navWordmarkScale)

  // Login preview: illustrative base height so both frames fit the tile.
  const previewBase = 74

  return (
    <Section
      icon={<Ruler size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Logo sizing & alignment"
      blurb="Fine-tune how the logo sits in the top navigation bar and how big it is on the login screen. Changes apply everywhere once saved."
    >
      {/* ── Nav logo ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-bold text-[var(--text)]">Top navigation logo</h3>
          <p className="text-[11px] leading-snug text-[var(--text-faint)]">
            The symbol + MOTIV wordmark shown in the header. Use the nudge to line the bottom of the text up with the bottom of the mark.
          </p>
        </div>
        <DarkTile className="flex items-end px-5 py-4">
          {/* Mirrors components/ui/MotivLogo.tsx composition. */}
          <span className="inline-flex items-end" style={{ gap: Math.round(navH * 0.16) }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
            <img src={symbolUrl} alt="" style={{ height: navH }} className="w-auto object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
            <img src={wordmarkUrl} alt="" style={{ height: wordH, transform: `translateY(-${Math.round(navShift * navH)}px)` }} className="w-auto object-contain" />
          </span>
          {/* Baseline guide — the symbol's bottom edge, to check alignment. */}
          <span aria-hidden className="pointer-events-none ml-4 mb-0 h-px flex-1 self-end bg-white/20" />
        </DarkTile>
        <div className="grid gap-4 sm:grid-cols-2">
          <Slider label="Wordmark size" value={layout.navWordmarkScale} range={LOGO_LAYOUT_RANGE.navWordmarkScale} step={0.02} display={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('navWordmarkScale', v)} />
          <Slider label="Wordmark vertical nudge" value={layout.navWordmarkNudge} range={LOGO_LAYOUT_RANGE.navWordmarkNudge} step={0.01} display={(v) => (v === 0 ? 'Aligned' : `${v > 0 ? '↑' : '↓'} ${Math.abs(Math.round(v * 100))}%`)} onChange={(v) => set('navWordmarkNudge', v)} />
        </div>
      </div>

      {/* ── Login logo ── */}
      <div className="space-y-3 border-t border-[var(--border)] pt-4">
        <div>
          <h3 className="text-xs font-bold text-[var(--text)]">Login screen logo</h3>
          <p className="text-[11px] leading-snug text-[var(--text-faint)]">
            The big logo above the sign-in card. Desktop and phone sizes are set separately so it stays in proportion on small screens.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LoginPreview label="Desktop" lockupUrl={lockupUrl} logoH={Math.round(previewBase * layout.authLogoScale)} gap={layout.authLogoGap} />
          <LoginPreview label="Phone" lockupUrl={lockupUrl} logoH={Math.round(previewBase * layout.authLogoScaleMobile)} gap={layout.authLogoGap} narrow />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="Size — desktop" value={layout.authLogoScale} range={LOGO_LAYOUT_RANGE.authLogoScale} step={0.05} display={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('authLogoScale', v)} />
          <Slider label="Size — phone" value={layout.authLogoScaleMobile} range={LOGO_LAYOUT_RANGE.authLogoScaleMobile} step={0.05} display={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('authLogoScaleMobile', v)} />
          <Slider label="Spacing above card" value={layout.authLogoGap} range={LOGO_LAYOUT_RANGE.authLogoGap} step={2} display={(v) => `${Math.round(v)}px`} onChange={(v) => set('authLogoGap', v)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} label="Save logo layout" />
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]"
        >
          <RotateCcw size={13} /> Reset to defaults
        </button>
      </div>
    </Section>
  )
}

function Slider({ label, value, range, step, display, onChange }: {
  label: string
  value: number
  range: readonly [number, number]
  step: number
  display: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text)]">{label}</span>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">{display(value)}</span>
      </span>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--input-bg)] accent-blue-600 ring-1 ring-[var(--border)]"
      />
    </label>
  )
}

function LoginPreview({ label, lockupUrl, logoH, gap, narrow }: {
  label: string
  lockupUrl: string
  logoH: number
  gap: number
  narrow?: boolean
}) {
  const cardStyle: CSSProperties = { marginTop: gap }
  return (
    <div className="space-y-1">
      <DarkTile className="flex flex-col items-center px-3 py-4">
        <div className={narrow ? 'w-24' : 'w-full'}>
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
            <img src={lockupUrl} alt="" style={{ height: logoH }} className="w-auto object-contain" />
            {/* Fake sign-in card so the gap reads as spacing above it. */}
            <div style={cardStyle} className="h-8 w-full rounded-md bg-white/10 ring-1 ring-white/10" />
          </div>
        </div>
      </DarkTile>
      <p className="text-center text-[10px] text-[var(--text-faint)]">{label}</p>
    </div>
  )
}
