import {
  Zap, Droplets, Snowflake, Refrigerator, Flame, Building2, Store, Sparkles, Wrench, Layers,
  type LucideIcon,
} from 'lucide-react'

// Single source of truth for how a maintenance category is drawn — the icon and
// its colour. Used by the ticket-log wizard tiles, the store "today" work-queue
// rows, and anywhere else a category is shown, so a category always looks the
// same across the app. Colours are chosen to match the trade (electrical = amber
// spark, plumbing = blue water, gas = orange flame, …).
//
// NOTE: these Tailwind class strings must stay literal — tailwind.config scans
// lib/** so they survive purging.

export type CategoryVisual = { Icon: LucideIcon; textClass: string; badgeClass: string }

// A job spanning several trades, e.g. "Shopfront/Plumbing/Electrical" or "Multiple".
const MULTI_SPLIT = /\s*(?:\/|,|&|\+|\band\b)\s*/i

export function isMultiCategory(category?: string | null): boolean {
  const c = String(category ?? '').trim()
  if (!c) return false
  if (/^multiple\b|multi[-\s]?trade|various/i.test(c)) return true
  return c.split(MULTI_SPLIT).map(s => s.trim()).filter(Boolean).length > 1
}

const HUES: Record<string, { t: string; b: string }> = {
  amber: { t: 'text-amber-500', b: 'bg-amber-500/15 text-amber-500' },
  blue: { t: 'text-blue-500', b: 'bg-blue-500/15 text-blue-500' },
  cyan: { t: 'text-cyan-500', b: 'bg-cyan-500/15 text-cyan-500' },
  sky: { t: 'text-sky-500', b: 'bg-sky-500/15 text-sky-500' },
  orange: { t: 'text-orange-500', b: 'bg-orange-500/15 text-orange-500' },
  slate: { t: 'text-slate-400', b: 'bg-slate-500/15 text-slate-400' },
  violet: { t: 'text-violet-500', b: 'bg-violet-500/15 text-violet-500' },
  teal: { t: 'text-teal-500', b: 'bg-teal-500/15 text-teal-500' },
  purple: { t: 'text-purple-500', b: 'bg-purple-500/15 text-purple-500' },
  gray: { t: 'text-gray-400', b: 'bg-gray-500/15 text-gray-400' },
}

function v(Icon: LucideIcon, hue: keyof typeof HUES | string): CategoryVisual {
  const h = HUES[hue] ?? HUES.gray
  return { Icon, textClass: h.t, badgeClass: h.b }
}

export function categoryVisual(category?: string | null): CategoryVisual {
  if (isMultiCategory(category)) return v(Layers, 'purple')
  const c = String(category ?? '').toLowerCase().trim()
  // Order matters: check "refrigeration" before the generic "air" of HVAC.
  if (/electr|power/.test(c)) return v(Zap, 'amber')
  if (/plumb|water|leak|drain|pipe|geyser/.test(c)) return v(Droplets, 'blue')
  if (/refriger|fridge|freezer|cold\s*room/.test(c)) return v(Refrigerator, 'sky')
  if (/hvac|aircon|air|climate|ventil|cooling|heating/.test(c)) return v(Snowflake, 'cyan')
  if (/gas/.test(c)) return v(Flame, 'orange')
  if (/struct|build|roof|ceiling|wall|floor|carpent|joiner/.test(c)) return v(Building2, 'slate')
  if (/shopfront|storefront|store\s*front|\bfront\b|glass|door|lock|signage|shutter/.test(c)) return v(Store, 'violet')
  if (/clean/.test(c)) return v(Sparkles, 'teal')
  // general / other / unknown
  return v(Wrench, 'gray')
}
