'use client'

// Client-side view of the admin-customizable branding (logo URLs, app name,
// support contact, login backgrounds). The root layout builds the value from
// app_settings on the server and mounts this provider; components fall back to
// the built-in Motiv assets when nothing is customised (or in isolated renders
// with no provider).

import { createContext, useContext, type ReactNode } from 'react'
import { DEFAULT_BRAND_ASSETS } from '@/lib/settings'

export interface BrandingValue {
  appName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  authBgUrls: string[]
  symbolUrl: string
  wordmarkUrl: string
  lockupUrl: string
  /** width / height of each master — keeps custom logos aspect-correct. */
  symbolAspect: number
  wordmarkAspect: number
  lockupAspect: number
  /** Nav lockup: symbol height multiplier (1 = the header's base size). */
  navSymbolScale: number
  /** Nav lockup: wordmark height as a fraction of symbol height. */
  navWordmarkScale: number
  /** Nav lockup: how far (fraction of symbol height) to lift the wordmark so its
   *  bottom sits on the symbol's bottom. Resolved server-side — 0 for trimmed
   *  custom logos, ~0.18 for the glow-padded built-in symbol, ± the user nudge. */
  navWordmarkShift: number
  /** Login hero logo size multipliers (desktop / phone) and gap below it (px). */
  authLogoScale: number
  authLogoScaleMobile: number
  authLogoGap: number
  /** Solid hex for the login/auth primary buttons. */
  authButtonColor: string
}

export const DEFAULT_BRANDING: BrandingValue = {
  appName: 'Motiv',
  tagline: '',
  supportEmail: '',
  supportPhone: '',
  authBgUrls: [],
  ...DEFAULT_BRAND_ASSETS,
  navSymbolScale: 1,
  navWordmarkScale: 0.44,
  // Built-in symbol PNG has soft glow below the visible "M" — lift the wordmark
  // ~18% so their visible bottoms line up. Trimmed custom logos override to 0.
  navWordmarkShift: 0.18,
  authLogoScale: 1,
  authLogoScaleMobile: 0.6,
  authLogoGap: 12,
  authButtonColor: '#2563eb',
}

const BrandingContext = createContext<BrandingValue>(DEFAULT_BRANDING)

export function BrandingProvider({ value, children }: { value: BrandingValue; children: ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingValue {
  return useContext(BrandingContext)
}
