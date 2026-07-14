import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { ServiceWorkerSetup } from '@/components/ui/ServiceWorkerSetup'
import './globals.css'

export const metadata: Metadata = {
  title: 'Motiv',
  description: 'Maintenance ticketing & quoting platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Motiv',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0e1016',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce set by middleware; applied to the inline theme script.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking script: (1) prevents a flash of the wrong theme, (2) applies the
            saved desktop content-width, and (3) on phones pins the layout viewport to
            a FIXED width (MOBILE_VIEWPORT_PX) so every page renders at one consistent
            zoom with the content blocks filling the width — instead of leaving a gap
            beside wide elements (e.g. the progress stepper). Tune MOBILE_VIEWPORT_PX:
            larger = more zoomed-out + more room for wide rows. Desktop/tablet keep
            device-width. Runs before first paint so there's no flash/reflow. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t===null&&d);if(dark){document.documentElement.classList.add('dark')}document.documentElement.style.colorScheme=dark?'dark':'light';var w=parseInt(localStorage.getItem('content-width'),10);if(!isNaN(w)){w=Math.max(70,Math.min(95,w));document.documentElement.style.setProperty('--content-width',w+'%')}try{var MOBILE_VIEWPORT_PX=560;var phone=Math.min(screen.width,screen.height)<=480;var vp=document.querySelector('meta[name=viewport]');if(!vp){vp=document.createElement('meta');vp.setAttribute('name','viewport');document.head.appendChild(vp)}vp.setAttribute('content',phone?('width='+MOBILE_VIEWPORT_PX):'width=device-width, initial-scale=1')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        {/* Web splash removed for now (native Android splash unaffected). */}
        <ThemeProvider>
          <ServiceWorkerSetup />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
