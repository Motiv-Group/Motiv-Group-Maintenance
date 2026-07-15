'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { useBranding } from '@/components/providers/BrandingProvider'

/**
 * Shared frame for every auth-pipeline page (login, signup, forgot / reset
 * password, supplier onboarding) so they read as one composed module:
 *  - forced-dark near-black page with a single, very subtle neutral radial glow
 *    behind the module (the logo stays the only real decorative feature),
 *  - optionally an admin-uploaded background photo (Customize tab), dimmed hard
 *    so the card stays legible — picked at random per visit,
 *  - the transparent MOTIV lockup, sitting close to the card,
 *  - a strengthened card (lifted background, visible hairline border + ring and
 *    a soft shadow) so it separates cleanly from the page,
 *  - the support contact (if configured) as a quiet footer line.
 */
export function AuthShell({
  children,
  logoHeight = 120,
  maxWidth = 'sm',
  raise = 0,
  logoGap = 20,
}: {
  children: ReactNode
  logoHeight?: number
  maxWidth?: 'sm' | 'md' | 'lg'
  /** Shift the whole logo+card module up by this many px (balance on tall screens). */
  raise?: number
  /** Gap (px) between the logo and the card. */
  logoGap?: number
}) {
  const branding = useBranding()
  // Background photo is chosen AFTER mount (not during SSR) so server and client
  // markup match; it then fades in over the plain charcoal.
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  useEffect(() => {
    const urls = branding.authBgUrls
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random pick must happen client-side only (Math.random during SSR would mismatch hydration); single set on mount
    if (urls.length) setBgUrl(urls[Math.floor(Math.random() * urls.length)])
  }, [branding.authBgUrls])

  const widthClass = maxWidth === 'lg' ? 'max-w-[540px]' : maxWidth === 'md' ? 'max-w-md' : 'max-w-sm sm:max-w-md'
  const support = [branding.supportEmail, branding.supportPhone].filter(Boolean)
  return (
    <div className="dark">
      <div className="relative min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4 py-10">
        {bgUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL; plain img avoids remote-domain config
          <img src={bgUrl} alt="" aria-hidden draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 transition-opacity duration-700" />
        )}
        {/* Subtle neutral glow — depth without colour; logo remains the focus. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_26%,rgba(255,255,255,0.055),transparent_72%)]"
        />
        <div
          className={`relative w-full ${widthClass}`}
          style={raise ? { transform: `translateY(-${raise}px)` } : undefined}
        >
          {/* Logo — a tight gap above the card; the two read as one centred group. */}
          <div className="flex items-center justify-center" style={{ marginBottom: logoGap }}>
            <MotivLockup height={logoHeight} />
          </div>

          <div className="rounded-2xl border border-white/15 bg-[#181a21] p-7 shadow-2xl shadow-black/50 ring-1 ring-white/5 sm:p-8">
            {children}
          </div>

          {support.length > 0 && (
            <p className="mt-5 text-center text-xs text-white/45">
              Need help?{' '}
              {branding.supportEmail && (
                <a href={`mailto:${branding.supportEmail}`} className="underline decoration-white/30 underline-offset-2 hover:text-white/70">{branding.supportEmail}</a>
              )}
              {branding.supportEmail && branding.supportPhone && ' · '}
              {branding.supportPhone && (
                <a href={`tel:${branding.supportPhone.replace(/\s+/g, '')}`} className="underline decoration-white/30 underline-offset-2 hover:text-white/70">{branding.supportPhone}</a>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
