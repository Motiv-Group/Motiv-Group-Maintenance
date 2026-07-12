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
  // The "MOTIV" wordmark is wide (aspect 4.6), so a full-height wordmark overflows
  // the narrow nav. Set it to ~2/3 of the symbol height and bottom-align both so the
  // word sits on the same baseline as the "M".
  const wordH = Math.round(height * 0.66)
  const wordW = Math.round(wordH * (701 / 151))  // wordmark aspect 701×151

  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: Math.round(height * 0.24) }}>
      <Image src="/brand/motiv-symbol.png" alt="" width={symW} height={height} priority unoptimized draggable={false} className="object-contain" />
      <Image src="/brand/motiv-wordmark.png" alt="Motiv" width={wordW} height={wordH} priority unoptimized draggable={false} className="object-contain" />
    </span>
  )
}
