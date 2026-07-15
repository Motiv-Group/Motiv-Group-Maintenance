'use client'

import Image from 'next/image'
import { useBranding } from '@/components/providers/BrandingProvider'

interface MotivLogoProps {
  /** Height in px of the symbol; the MOTIV wordmark scales to ~half of it. */
  height?: number
  className?: string
  /** Show the MOTIV wordmark next to the symbol (default). Set false for a compact,
   *  symbol-only mark (e.g. narrow mobile headers). */
  wordmark?: boolean
}

/**
 * Brand lockup for the app chrome: the gradient MOTIV symbol followed by the
 * MOTIV wordmark. Designed for the dark charcoal nav — the symbol's soft glow
 * blends into the charcoal. For the big login/auth logo (symbol + name stacked)
 * use MotivLockup. Sources + aspect ratios come from BrandingProvider so an
 * admin-uploaded logo swaps in everywhere at once.
 */
export function MotivLogo({ height = 32, className = '', wordmark = true }: MotivLogoProps) {
  const branding = useBranding()
  // Admin-tunable symbol size; everything else scales off the resulting height so
  // the lockup stays in proportion.
  const symH = Math.round(height * branding.navSymbolScale)
  const symW = Math.round(symH * branding.symbolAspect)
  // The MOTIV wordmark is kept small next to the symbol so the mark leads and the
  // name is a quiet label (not competing with it).
  const wordH = Math.round(symH * branding.navWordmarkScale)
  const wordW = Math.round(wordH * branding.wordmarkAspect)
  // items-end lines up the image BOXES; the shift lifts the wordmark so the two
  // VISIBLE bottoms line up. It's 0 for trimmed custom logos (bottoms already
  // align) and ~0.18 for the glow-padded built-in symbol, ± the admin nudge —
  // all resolved in BrandingProvider. Never let a nudge push it off the bottom.
  const wordShiftUp = Math.round(Math.max(-0.4, Math.min(0.4, branding.navWordmarkShift)) * symH)

  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: Math.round(symH * 0.16) }}>
      <Image src={branding.symbolUrl} alt={wordmark ? '' : branding.appName} width={symW} height={symH} priority unoptimized draggable={false} className="object-contain" />
      {wordmark && (
        <Image src={branding.wordmarkUrl} alt={branding.appName} width={wordW} height={wordH} priority unoptimized draggable={false} className="object-contain" style={{ transform: `translateY(-${wordShiftUp}px)` }} />
      )}
    </span>
  )
}
