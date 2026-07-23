import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { BrandingProvider, type BrandingValue } from '@/components/providers/BrandingProvider'
import { ServiceWorkerSetup } from '@/components/ui/ServiceWorkerSetup'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { getAppSettings } from '@/lib/settings-server'
import { BRAND_DEFAULT_HEX, BRAND_STOPS, DEFAULT_BRAND_ASSETS, effectiveBrandHex, hexToChannels } from '@/lib/settings'
import './globals.css'

// Title, icons and theme colour follow the admin Customize tab (app_settings),
// so both are computed per request instead of exported statically.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getAppSettings()
  const f = s.branding.files
  return {
    title: s.appName,
    description: s.tagline || 'Maintenance ticketing & quoting platform',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: s.appName,
    },
    // With no custom logo the app/favicon.ico + app/icon.png + app/apple-icon.png
    // file conventions serve the built-in icons; custom ones point at storage.
    icons: s.branding.version
      ? {
          icon: [
            { url: f['favicon-32.png'], sizes: '32x32', type: 'image/png' },
            { url: f['favicon-16.png'], sizes: '16x16', type: 'image/png' },
            { url: f['icon-192.png'], sizes: '192x192', type: 'image/png' },
          ].filter(i => !!i.url),
          shortcut: f['favicon.ico'],
          apple: f['apple-touch-icon.png'],
        }
      : undefined,
  }
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getAppSettings()
  return {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: effectiveBrandHex(s.colors)['600'],
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce set by middleware; applied to the inline theme script.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const settings = await getAppSettings()

  // Palette overrides from the Customize tab: emit only the stops that differ
  // from factory, as RGB channels (see tailwind.config.ts). The dark nav-bg
  // follows brand-600 so a re-coloured chrome doesn't leave a stale nav.
  const hex = effectiveBrandHex(settings.colors)
  const changed = BRAND_STOPS.filter(stop => hex[stop] !== BRAND_DEFAULT_HEX[stop])
  const paletteCss = changed.length
    ? `:root{${changed.map(stop => `--brand-${stop}:${hexToChannels(hex[stop])};`).join('')}}` +
      (hex['600'] !== BRAND_DEFAULT_HEX['600'] ? `html.dark{--nav-bg:${hex['600']};}` : '')
    : ''

  const f = settings.branding.files
  const dims = settings.branding.dims
  const aspect = (key: string, fallback: number) => {
    const d = dims[key]
    return d && d.h > 0 ? d.w / d.h : fallback
  }
  const branding: BrandingValue = {
    appName: settings.appName,
    tagline: settings.tagline,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    authBgUrls: settings.authBgUrls,
    symbolUrl: f['symbol.png'] || DEFAULT_BRAND_ASSETS.symbolUrl,
    wordmarkUrl: f['wordmark.png'] || DEFAULT_BRAND_ASSETS.wordmarkUrl,
    lockupUrl: f['lockup.png'] || DEFAULT_BRAND_ASSETS.lockupUrl,
    symbolAspect: aspect('symbol.png', DEFAULT_BRAND_ASSETS.symbolAspect),
    wordmarkAspect: aspect('wordmark.png', DEFAULT_BRAND_ASSETS.wordmarkAspect),
    lockupAspect: aspect('lockup.png', DEFAULT_BRAND_ASSETS.lockupAspect),
    navSymbolScale: settings.logo.navSymbolScale,
    navWordmarkScale: settings.logo.navWordmarkScale,
    // Custom logos are trimmed tight by the generator → their bottoms already
    // line up, so base shift 0; the built-in glow-padded symbol needs ~0.18.
    // The user's nudge is added on top of whichever base applies.
    navWordmarkShift: (settings.branding.version ? 0 : 0.18) + settings.logo.navWordmarkNudge,
    authLogoScale: settings.logo.authLogoScale,
    authLogoScaleMobile: settings.logo.authLogoScaleMobile,
    authLogoGap: settings.logo.authLogoGap,
    authButtonColor: settings.authButtonColor,
  }

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking script: (1) prevents a flash of the wrong theme — the fallback
            when the user hasn't chosen a theme is the admin-configured default
            ('system' = follow the device), (2) applies the saved desktop
            content-width, and (3) on phones pins the layout viewport to a FIXED
            width (MOBILE_VIEWPORT_PX) so every page renders at one consistent
            zoom with the content blocks filling the width — instead of leaving a
            gap beside wide elements (e.g. the progress stepper). Tune
            MOBILE_VIEWPORT_PX: larger = more zoomed-out + more room for wide
            rows. Desktop/tablet keep device-width. Runs before first paint so
            there's no flash/reflow. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var p='${settings.defaultTheme}';var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t===null&&(p==='dark'||(p!=='light'&&d)));if(dark){document.documentElement.classList.add('dark')}document.documentElement.style.colorScheme=dark?'dark':'light';var w=parseInt(localStorage.getItem('content-width'),10);if(!isNaN(w)){w=Math.max(70,Math.min(95,w));document.documentElement.style.setProperty('--content-width',w+'%')}try{var MOBILE_VIEWPORT_PX=560;var phone=Math.min(screen.width,screen.height)<=480;var vp=document.querySelector('meta[name=viewport]');if(!vp){vp=document.createElement('meta');vp.setAttribute('name','viewport');document.head.appendChild(vp)}vp.setAttribute('content',phone?('width='+MOBILE_VIEWPORT_PX):'width=device-width, initial-scale=1')}catch(e){}})()`,
          }}
        />
        {/* CSP: style-src allows inline styles, no nonce needed here. */}
        {paletteCss && <style id="brand-overrides" dangerouslySetInnerHTML={{ __html: paletteCss }} />}
      </head>
      <body className="min-h-screen antialiased">
        {/* Web splash removed for now (native Android splash unaffected). */}
        <BrandingProvider value={branding}>
          <ThemeProvider>
            <ServiceWorkerSetup />
            {children}
          </ThemeProvider>
        </BrandingProvider>
        {/* Real-user Core Web Vitals + page-view analytics. Both inject their script
            client-side via the trusted React bundle → allowed by the strict-dynamic
            CSP; they beacon same-origin (/_vercel/*), covered by connect-src 'self'. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
