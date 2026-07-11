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
        {/* Blocking script prevents flash of wrong theme */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t===null&&d);if(dark){document.documentElement.classList.add('dark')}document.documentElement.style.colorScheme=dark?'dark':'light';})()`,
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
