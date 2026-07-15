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
  const symW = Math.round(height * branding.symbolAspect)
  // The MOTIV wordmark is kept small next to the symbol so the mark leads and the
  // name is a quiet label (not competing with it).
  const wordH = Math.round(height * 0.44)
  const wordW = Math.round(wordH * branding.wordmarkAspect)
  // items-end lines up the image BOXES, but the symbol PNG's solid "M" ends ~24%
  // above its box bottom (soft glow below) while the wordmark's text ends ~13%
  // above its own — so nudge the wordmark up to align the two VISIBLE bottoms.
  const wordShiftUp = Math.round(0.18 * height)

  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: Math.round(height * 0.16) }}>
      <Image src={branding.symbolUrl} alt={wordmark ? '' : branding.appName} width={symW} height={height} priority unoptimized draggable={false} className="object-contain" />
      {wordmark && (
        <Image src={branding.wordmarkUrl} alt={branding.appName} width={wordW} height={wordH} priority unoptimized draggable={false} className="object-contain" style={{ transform: `translateY(-${wordShiftUp}px)` }} />
      )}
    </span>
  )
}
