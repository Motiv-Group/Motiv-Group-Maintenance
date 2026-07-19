import Image from 'next/image'

// A person's avatar: the uploaded picture when set, else an initials monogram on
// a deterministic colour (same name → same colour). Server-safe (no hooks), so
// it renders in both the chrome and Settings. Circular by convention.
const PALETTE = [
  { bg: '#1d4ed8', fg: '#dbeafe' },
  { bg: '#0f766e', fg: '#ccfbf1' },
  { bg: '#b45309', fg: '#ffedd5' },
  { bg: '#6d28d9', fg: '#ede9fe' },
  { bg: '#be185d', fg: '#fce7f3' },
  { bg: '#15803d', fg: '#dcfce7' },
]

function initials(name: string): string {
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

export function UserAvatar({ name, avatarUrl, size = 40, className = '' }: {
  name: string | null | undefined
  avatarUrl?: string | null
  size?: number
  className?: string
}) {
  const display = (name ?? '').trim() || '?'
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={`${display} avatar`}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        unoptimized
      />
    )
  }
  const c = colourFor(display)
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${className}`}
      style={{ width: size, height: size, backgroundColor: c.bg, color: c.fg, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(display)}
    </span>
  )
}
