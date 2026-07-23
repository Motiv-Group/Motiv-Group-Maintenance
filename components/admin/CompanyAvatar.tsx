'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

// Company avatar: the uploaded logo when present, else a deterministic monogram
// (initials + a colour derived from the name so the same company is always the
// same colour). Client component so a broken/missing logo URL falls back to the
// monogram via onError instead of rendering the browser's torn-image glyph with
// the alt text spilling out of the avatar box. Size in px.
const PALETTE = [
  { bg: '#1e3a8a', fg: '#dbeafe' }, // blue
  { bg: '#065f46', fg: '#d1fae5' }, // emerald
  { bg: '#7c2d12', fg: '#ffedd5' }, // orange
  { bg: '#5b21b6', fg: '#ede9fe' }, // violet
  { bg: '#155e75', fg: '#cffafe' }, // cyan
  { bg: '#831843', fg: '#fce7f3' }, // pink
  { bg: '#3f6212', fg: '#ecfccb' }, // lime
  { bg: '#7f1d1d', fg: '#fee2e2' }, // red
]

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function colourFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function CompanyAvatar({ name, logoUrl, size = 40, className = '' }: {
  name: string
  logoUrl?: string | null
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const [seenUrl, setSeenUrl] = useState(logoUrl)
  const imgRef = useRef<HTMLImageElement>(null)
  // Reset when the URL changes (admin re-uploads a working logo) — the
  // render-phase "adjust state on prop change" pattern, so no effect fires.
  if (logoUrl !== seenUrl) {
    setSeenUrl(logoUrl)
    setBroken(false)
  }
  // Catch the hydration race where the <img> errored before React attached
  // onError: a complete image with zero natural size failed to decode.
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth === 0) setBroken(true)
  }, [logoUrl])

  const rounded = 'rounded-xl'
  if (logoUrl && !broken) {
    return (
      <Image
        ref={imgRef}
        src={logoUrl}
        alt={`${name} logo`}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className={`${rounded} shrink-0 overflow-hidden object-cover ring-1 ring-[var(--border)] bg-white ${className}`}
        style={{ width: size, height: size }}
        unoptimized
      />
    )
  }
  const c = colourFor(name)
  return (
    <span
      className={`${rounded} inline-flex shrink-0 items-center justify-center overflow-hidden font-bold ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size, backgroundColor: c.bg, color: c.fg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {monogram(name)}
    </span>
  )
}
