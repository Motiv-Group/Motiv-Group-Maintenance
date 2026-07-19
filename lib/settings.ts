// App-wide customization settings (admin "Customize" tab) — types, defaults and
// pure helpers only. This module is imported by CLIENT components too, so it must
// stay free of server-only imports (Supabase server client lives in
// lib/settings-server.ts).

export type BrandStop = '50' | '100' | '300' | '400' | '500' | '600' | '700' | '900'

export const BRAND_STOPS: BrandStop[] = ['50', '100', '300', '400', '500', '600', '700', '900']

// Mirrors the compiled defaults in tailwind.config.ts / globals.css. If those
// change, change these too — the admin colour editor treats these as "factory".
export const BRAND_DEFAULT_HEX: Record<BrandStop, string> = {
  '50': '#f8f5ed',
  '100': '#e8dfc4',
  '300': '#c9b99a',
  '400': '#b5a07d',
  '500': '#1b1d24',
  '600': '#0e1016',
  '700': '#090a0e',
  '900': '#050608',
}

// Built-in logo asset paths + natural aspect ratios (width/height of the trimmed
// masters in public/brand/). Lives here — a plain, non-'use client' module — so
// the SERVER root layout can import it for fallbacks. A constant exported from a
// 'use client' file (e.g. BrandingProvider) is stubbed to undefined when read in
// a Server Component, so it must NOT be the source of these values.
export const DEFAULT_BRAND_ASSETS = {
  symbolUrl: '/brand/motiv-symbol.png',
  wordmarkUrl: '/brand/motiv-wordmark.png',
  lockupUrl: '/brand/motiv-lockup.png',
  symbolAspect: 1536 / 1024,
  wordmarkAspect: 701 / 151,
  lockupAspect: 606 / 640,
} as const

export interface BrandingState {
  /** Timestamp of the last "Generate & apply" run; null = built-in logo files. */
  version: number | null
  /** Generated asset key (e.g. 'icon-192.png') → public storage URL. */
  files: Record<string, string>
  /** Natural dimensions of the trimmed masters, for aspect-correct rendering. */
  dims: Record<string, { w: number; h: number }>
  /** Public URL of the downloadable asset pack (repo + Android files). */
  zipUrl: string | null
}

// Logo layout knobs (nav lockup + login hero), all editable from the Customize
// tab. Kept as ratios/px with safe clamps so a bad value can never break layout.
export interface LogoLayout {
  /** Nav symbol height multiplier (1 = the size each header passes in). */
  navSymbolScale: number
  /** Nav wordmark height as a fraction of the symbol height. */
  navWordmarkScale: number
  /** Vertical nudge of the nav wordmark, as a fraction of symbol height.
   *  + = move the MOTIV text UP (toward the symbol's mid), − = down. 0 = sit on
   *  the symbol's bottom edge (correct for trimmed custom logos). */
  navWordmarkNudge: number
  /** Login/auth hero logo size multiplier on desktop (1 = each page's base). */
  authLogoScale: number
  /** Login/auth hero logo size multiplier on phones (< the desktop one so the
   *  logo doesn't dominate the small pinned-width mobile viewport). */
  authLogoScaleMobile: number
  /** Gap in px between the hero logo and the auth card. */
  authLogoGap: number
}

export const LOGO_LAYOUT_DEFAULT: LogoLayout = {
  navSymbolScale: 1,
  navWordmarkScale: 0.44,
  navWordmarkNudge: 0,
  authLogoScale: 1,
  authLogoScaleMobile: 0.6,
  authLogoGap: 28,
}

// Clamp ranges — also the slider bounds in the Customize UI. Keep in sync.
export const LOGO_LAYOUT_RANGE = {
  navSymbolScale: [0.7, 1.45],
  navWordmarkScale: [0.28, 0.7],
  navWordmarkNudge: [-0.25, 0.25],
  authLogoScale: [0.5, 1.6],
  authLogoScaleMobile: [0.35, 1.3],
  authLogoGap: [0, 56],
} as const satisfies Record<keyof LogoLayout, readonly [number, number]>

export interface AppSettings {
  appName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  /** Optional app-store / APK download link (in addition to the install steps). */
  appDownloadUrl: string
  /** Editable "Add to Home Screen" install steps shown in invite emails + the
   *  Customize preview. Newline-separated; empty = the built-in default steps. */
  appInstallAndroid: string
  appInstallIos: string
  /** What people see before choosing a theme themselves ('system' = device setting). */
  defaultTheme: 'light' | 'dark' | 'system'
  /** Hex overrides ('#rrggbb') of the brand palette; missing stop = factory colour. */
  colors: Partial<Record<BrandStop, string>>
  /** Solid hex ('#rrggbb') for the login/auth primary buttons. */
  authButtonColor: string
  /** Optional login-screen background photos (public URLs, one picked per visit). */
  authBgUrls: string[]
  /** Logo sizing/alignment knobs (nav + login). */
  logo: LogoLayout
  /** Per-email-type copy overrides (subject/heading/… ); missing = built-in copy. */
  emails: EmailOverrides
  branding: BrandingState
}

// ── Editable email copy ──────────────────────────────────────────────────────
// The invite/notification emails the app sends. Admins can override the WORDING
// only (subject/heading/intro/button/footer); links, the credentials block, the
// logo and the layout stay locked in code. Default copy + placeholders live in
// lib/emails/defaults.ts. Values may contain {placeholders} substituted at send.
export const EMAIL_KEYS = ['role_invite', 'supplier_invite', 'password_reset', 'store_welcome', 'supplier_added'] as const
export type EmailKey = (typeof EMAIL_KEYS)[number]
export const EMAIL_COPY_FIELDS = ['subject', 'heading', 'lead', 'sub', 'ctaLabel', 'footerNote'] as const
export type EmailCopyField = (typeof EMAIL_COPY_FIELDS)[number]
export type EmailCopy = Record<EmailCopyField, string>
export type EmailOverrides = Partial<Record<EmailKey, Partial<EmailCopy>>>

const AUTH_BUTTON_DEFAULT = '#2563eb'

/** Keep only known email keys/fields with trimmed, length-capped string values. */
export function normaliseEmails(raw: unknown): EmailOverrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: EmailOverrides = {}
  for (const key of EMAIL_KEYS) {
    const e = (r[key] && typeof r[key] === 'object' ? r[key] : null) as Record<string, unknown> | null
    if (!e) continue
    const copy: Partial<EmailCopy> = {}
    for (const f of EMAIL_COPY_FIELDS) {
      const v = e[f]
      // Empty string = "use the built-in default", so it is dropped (not stored).
      if (typeof v === 'string' && v.trim()) copy[f] = v.slice(0, 600)
    }
    if (Object.keys(copy).length) out[key] = copy
  }
  return out
}

// Built-in "Add to Home Screen" steps (newline-separated). Used when the admin
// leaves the Customize field blank. It's a PWA — installed via the browser.
export const DEFAULT_INSTALL_ANDROID = 'Open this site in Chrome.\nTap the ⋮ menu (top-right).\nTap “Add to Home screen”, then “Install”.'
export const DEFAULT_INSTALL_IOS = 'Open this site in Safari.\nTap the Share button.\nScroll down and tap “Add to Home Screen”, then “Add”.'

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Motiv',
  tagline: 'Maintenance ticketing & quoting platform',
  supportEmail: '',
  supportPhone: '',
  appDownloadUrl: '',
  appInstallAndroid: '',
  appInstallIos: '',
  defaultTheme: 'system',
  colors: {},
  authButtonColor: AUTH_BUTTON_DEFAULT,
  authBgUrls: [],
  logo: { ...LOGO_LAYOUT_DEFAULT },
  emails: {},
  branding: { version: null, files: {}, dims: {}, zipUrl: null },
}

/** Clamp a value into a [min,max] range, falling back to the default if not finite. */
export function clampNum(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Normalise an untrusted logo-layout object against the ranges + defaults. */
export function normaliseLogoLayout(raw: unknown): LogoLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    navSymbolScale: clampNum(r.navSymbolScale, LOGO_LAYOUT_RANGE.navSymbolScale, LOGO_LAYOUT_DEFAULT.navSymbolScale),
    navWordmarkScale: clampNum(r.navWordmarkScale, LOGO_LAYOUT_RANGE.navWordmarkScale, LOGO_LAYOUT_DEFAULT.navWordmarkScale),
    navWordmarkNudge: clampNum(r.navWordmarkNudge, LOGO_LAYOUT_RANGE.navWordmarkNudge, LOGO_LAYOUT_DEFAULT.navWordmarkNudge),
    authLogoScale: clampNum(r.authLogoScale, LOGO_LAYOUT_RANGE.authLogoScale, LOGO_LAYOUT_DEFAULT.authLogoScale),
    authLogoScaleMobile: clampNum(r.authLogoScaleMobile, LOGO_LAYOUT_RANGE.authLogoScaleMobile, LOGO_LAYOUT_DEFAULT.authLogoScaleMobile),
    authLogoGap: Math.round(clampNum(r.authLogoGap, LOGO_LAYOUT_RANGE.authLogoGap, LOGO_LAYOUT_DEFAULT.authLogoGap)),
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

/** '#0e1016' → '14 16 22' (space-separated RGB channels for CSS `rgb(var(--x) / a)`). */
export function hexToChannels(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`
}

/** Effective palette = factory colours + saved overrides. */
export function effectiveBrandHex(colors: AppSettings['colors']): Record<BrandStop, string> {
  const out = { ...BRAND_DEFAULT_HEX }
  for (const stop of BRAND_STOPS) {
    const v = colors[stop]
    if (isHex(v)) out[stop] = v.toLowerCase()
  }
  return out
}

/** Deep-merge an untrusted stored value over the defaults, dropping junk. */
export function normaliseSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const b = (r.branding && typeof r.branding === 'object' ? r.branding : {}) as Record<string, unknown>
  const colors: AppSettings['colors'] = {}
  const rc = (r.colors && typeof r.colors === 'object' ? r.colors : {}) as Record<string, unknown>
  for (const stop of BRAND_STOPS) if (isHex(rc[stop])) colors[stop] = (rc[stop] as string).toLowerCase()
  const str = (v: unknown, fallback: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : fallback)
  return {
    appName: str(r.appName, DEFAULT_SETTINGS.appName, 40).trim() || DEFAULT_SETTINGS.appName,
    tagline: str(r.tagline, DEFAULT_SETTINGS.tagline, 120),
    supportEmail: str(r.supportEmail, ''),
    supportPhone: str(r.supportPhone, '', 40),
    appDownloadUrl: str(r.appDownloadUrl, '', 300).trim(),
    appInstallAndroid: str(r.appInstallAndroid, '', 1200),
    appInstallIos: str(r.appInstallIos, '', 1200),
    defaultTheme: r.defaultTheme === 'light' || r.defaultTheme === 'dark' ? r.defaultTheme : 'system',
    colors,
    authButtonColor: isHex(r.authButtonColor) ? (r.authButtonColor as string).toLowerCase() : AUTH_BUTTON_DEFAULT,
    authBgUrls: Array.isArray(r.authBgUrls) ? r.authBgUrls.filter((u): u is string => typeof u === 'string').slice(0, 4) : [],
    logo: normaliseLogoLayout(r.logo),
    emails: normaliseEmails(r.emails),
    branding: {
      version: typeof b.version === 'number' ? b.version : null,
      files: (b.files && typeof b.files === 'object' ? b.files : {}) as Record<string, string>,
      dims: (b.dims && typeof b.dims === 'object' ? b.dims : {}) as Record<string, { w: number; h: number }>,
      zipUrl: typeof b.zipUrl === 'string' ? b.zipUrl : null,
    },
  }
}
