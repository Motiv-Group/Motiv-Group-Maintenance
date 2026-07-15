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
}

export const DEFAULT_BRANDING: BrandingValue = {
  appName: 'Motiv',
  tagline: '',
  supportEmail: '',
  supportPhone: '',
  authBgUrls: [],
  ...DEFAULT_BRAND_ASSETS,
}

const BrandingContext = createContext<BrandingValue>(DEFAULT_BRANDING)

export function BrandingProvider({ value, children }: { value: BrandingValue; children: ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingValue {
  return useContext(BrandingContext)
}
