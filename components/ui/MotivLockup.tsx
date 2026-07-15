'use client'

import Image from 'next/image'
import type { CSSProperties } from 'react'
import { useBranding } from '@/components/providers/BrandingProvider'

interface MotivLockupProps {
  /** Base (desktop) height in px of the full logo (symbol + MOTIV name stacked).
   *  The admin size multipliers scale this; phones render at the mobile one. */
  height?: number
  className?: string
}

/**
 * Full brand logo — the gradient symbol with the MOTIV name beneath it. Used as
 * the large hero logo on the auth pages. Source + aspect come from
 * BrandingProvider (admin-customizable). Renders responsively: the admin's
 * desktop size on wide screens, a smaller mobile size on phones (both tunable
 * from the Customize tab) so the logo never dominates the small pinned-width
 * mobile viewport. The height swap is a CSS media query (`.auth-hero-logo` in
 * globals.css) driven by the two CSS vars set here — the width/height attrs stay
 * at the desktop size to reserve space (no layout shift).
 */
export function MotivLockup({ height = 130, className = '' }: MotivLockupProps) {
  const branding = useBranding()
  const desktopH = Math.round(height * branding.authLogoScale)
  const mobileH = Math.round(height * branding.authLogoScaleMobile)
  const width = Math.round(desktopH * branding.lockupAspect)
  const style = { '--logo-h': `${desktopH}px`, '--logo-h-mobile': `${mobileH}px` } as CSSProperties
  return (
    <Image
      src={branding.lockupUrl}
      alt={branding.appName}
      width={width}
      height={desktopH}
      priority
      unoptimized
      draggable={false}
      style={style}
      className={`auth-hero-logo object-contain ${className}`}
    />
  )
}
