'use client'

import Image from 'next/image'

interface MotivLogoProps {
  /** Height in px of the symbol; the MOTIV wordmark scales to ~half of it. */
  height?: number
  className?: string
}

/**
 * Brand lockup for the app chrome: the gradient MOTIV symbol followed by the
 * MOTIV wordmark. Designed for the dark charcoal nav — the symbol's soft glow
 * blends into the charcoal. For the big login/auth logo (symbol + name stacked)
 * use /brand/motiv-lockup.png directly.
 */
export function MotivLogo({ height = 32, className = '' }: MotivLogoProps) {
  const symW = Math.round(height * (1536 / 1024)) // symbol aspect 1536×1024
  // The MOTIV wordmark is kept small next to the symbol so the mark leads and the
  // name is a quiet label (not competing with it).
  const wordH = Math.round(height * 0.44)
  const wordW = Math.round(wordH * (701 / 151))  // wordmark aspect 701×151
  // items-end lines up the image BOXES, but the symbol PNG's solid "M" ends ~24%
  // above its box bottom (soft glow below) while the wordmark's text ends ~13%
  // above its own — so nudge the wordmark up to align the two VISIBLE bottoms.
  const wordShiftUp = Math.round(0.18 * height)

  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: Math.round(height * 0.16) }}>
      <Image src="/brand/motiv-symbol.png" alt="" width={symW} height={height} priority unoptimized draggable={false} className="object-contain" />
      <Image src="/brand/motiv-wordmark.png" alt="Motiv" width={wordW} height={wordH} priority unoptimized draggable={false} className="object-contain" style={{ transform: `translateY(-${wordShiftUp}px)` }} />
    </span>
  )
}
