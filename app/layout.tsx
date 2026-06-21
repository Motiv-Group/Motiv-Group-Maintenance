import type { Metadata, Viewport } from 'next'
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
  themeColor: '#0d1f2d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script prevents flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=t==='dark'||(t===null&&d);if(dark){document.documentElement.classList.add('dark')}document.documentElement.style.colorScheme=dark?'dark':'light';})()`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        {/* First-load splash — paints instantly (SSR), fades out via CSS.
            The inline script rotates the city image so it differs each open
            (portrait set on phones, the landscape image on wide screens). */}
        <div id="motiv-splash" aria-hidden="true" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var P=['/splash/cape-town.jpg','/splash/durban.jpg','/splash/johannesburg.jpg','/splash/johannesburg-2.jpg'];var L='/splash/horisontal.jpg';var el=document.getElementById('motiv-splash');if(!el)return;var pick;if(window.innerWidth>window.innerHeight&&window.innerWidth>=900){pick=L;}else{var last=null;try{last=localStorage.getItem('msplash');}catch(e){}var pool=P.filter(function(p){return p!==last;});if(!pool.length)pool=P;pick=pool[Math.floor(Math.random()*pool.length)];try{localStorage.setItem('msplash',pick);}catch(e){}}el.style.backgroundImage="url('"+pick+"')";})();`,
          }}
        />
        <ThemeProvider>
          <ServiceWorkerSetup />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
