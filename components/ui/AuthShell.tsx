import type { ReactNode } from 'react'
import { MotivLockup } from '@/components/ui/MotivLockup'

/**
 * Shared frame for every auth-pipeline page (login, signup, forgot / reset
 * password, supplier onboarding) so they read as one composed module:
 *  - forced-dark near-black page with a single, very subtle neutral radial glow
 *    behind the module (the logo stays the only real decorative feature),
 *  - the transparent MOTIV lockup, sitting close to the card,
 *  - a strengthened card (lifted background, visible hairline border + ring and
 *    a soft shadow) so it separates cleanly from the page.
 */
export function AuthShell({
  children,
  logoHeight = 168,
  maxWidth = 'sm',
}: {
  children: ReactNode
  logoHeight?: number
  maxWidth?: 'sm' | 'md'
}) {
  return (
    <div className="dark">
      <div className="relative min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4 py-10">
        {/* Subtle neutral glow — depth without colour; logo remains the focus. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_26%,rgba(255,255,255,0.055),transparent_72%)]"
        />
        <div className={`relative w-full ${maxWidth === 'md' ? 'max-w-md' : 'max-w-sm sm:max-w-md'}`}>
          {/* Logo — close to the card so the two read as one login module. */}
          <div className="flex items-center justify-center mb-6">
            <MotivLockup height={logoHeight} />
          </div>

          <div className="rounded-2xl border border-white/15 bg-[#181a21] p-6 shadow-2xl shadow-black/50 ring-1 ring-white/5 sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
