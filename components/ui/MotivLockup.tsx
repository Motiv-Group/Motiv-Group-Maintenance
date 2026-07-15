'use client'

import Image from 'next/image'
import { useBranding } from '@/components/providers/BrandingProvider'

interface MotivLockupProps {
  /** Height in px of the full logo (symbol + MOTIV name stacked). */
  height?: number
  className?: string
}

/**
 * Full brand logo — the gradient symbol with the MOTIV name beneath it. Used as
 * the large hero logo on the auth pages. Its soft glow blends into the charcoal
 * background. For the compact chrome lockup (symbol + wordmark) use MotivLogo.
 * Source + aspect come from BrandingProvider (admin-customizable).
 */
export function MotivLockup({ height = 130, className = '' }: MotivLockupProps) {
  const branding = useBranding()
  const width = Math.round(height * branding.lockupAspect)
  return (
    <Image
      src={branding.lockupUrl}
      alt={branding.appName}
      width={width}
      height={height}
      priority
      unoptimized
      draggable={false}
      className={`object-contain ${className}`}
    />
  )
}
