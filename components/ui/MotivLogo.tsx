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
  const symW = Math.round(height * (300 / 244)) // symbol aspect 300×244
  const wordH = Math.round(height * 0.5)
  const wordW = Math.round(wordH * (549 / 86))  // wordmark aspect 549×86

  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(height * 0.26) }}>
      <Image src="/brand/motiv-symbol.png" alt="" width={symW} height={height} priority unoptimized draggable={false} className="object-contain" />
      <Image src="/brand/motiv-wordmark.png" alt="Motiv" width={wordW} height={wordH} priority unoptimized draggable={false} className="object-contain" />
    </span>
  )
}
