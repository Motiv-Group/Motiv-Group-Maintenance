'use client'

import Image from 'next/image'

interface MotivLockupProps {
  /** Height in px of the full logo (symbol + MOTIV name stacked). */
  height?: number
  className?: string
}

/**
 * Full brand logo — the gradient symbol with the MOTIV name beneath it. Used as
 * the large hero logo on the auth pages. Its soft glow blends into the charcoal
 * background. For the compact chrome lockup (symbol + wordmark) use MotivLogo.
 */
export function MotivLockup({ height = 130, className = '' }: MotivLockupProps) {
  const width = Math.round(height * (700 / 666)) // lockup aspect 700×666
  return (
    <Image
      src="/brand/motiv-lockup.png"
      alt="Motiv"
      width={width}
      height={height}
      priority
      unoptimized
      draggable={false}
      className={`object-contain ${className}`}
    />
  )
}
