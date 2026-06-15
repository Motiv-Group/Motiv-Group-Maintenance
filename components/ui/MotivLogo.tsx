'use client'

import Image from 'next/image'

interface MotivLogoProps {
  /** Height in px — width is derived automatically from the SVG aspect ratio (647 × 496 ≈ 1.3 : 1) */
  height?: number
  className?: string
}

export function MotivLogo({ height = 48, className = '' }: MotivLogoProps) {
  // 647 / 496 ≈ 1.304 — keep the natural aspect ratio
  const width = Math.round(height * (647 / 496))

  return (
    <Image
      src="/logo.svg"
      alt="Motiv"
      width={width}
      height={height}
      className={`object-contain ${className}`}
      priority
    />
  )
}
