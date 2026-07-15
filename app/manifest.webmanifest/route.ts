import { NextResponse } from 'next/server'
import { getAppSettings } from '@/lib/settings-server'
import { effectiveBrandHex } from '@/lib/settings'

// PWA manifest, generated per request so the Customize tab's app name, chrome
// colour and generated icons apply without a redeploy (replaces the old static
// public/manifest.json). Public — no auth.
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getAppSettings()
  const f = s.branding.files
  const chrome = effectiveBrandHex(s.colors)['600']
  const manifest = {
    name: s.appName,
    short_name: s.appName,
    description: s.tagline || 'Maintenance ticketing & quoting',
    start_url: '/',
    display: 'standalone',
    background_color: chrome,
    theme_color: chrome,
    icons: [
      { src: f['icon-192.png'] ?? '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: f['icon-512.png'] ?? '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: f['icon-512-maskable.png'] ?? '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return NextResponse.json(manifest, {
    headers: {
      'content-type': 'application/manifest+json',
      // Short CDN cache: logo/name swaps propagate within minutes.
      'cache-control': 'public, max-age=300',
    },
  })
}
