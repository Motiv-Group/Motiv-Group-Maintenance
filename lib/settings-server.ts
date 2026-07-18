// Server-only half of the app settings: load/save the single `app_settings` row
// via the service-role client. Import lib/settings.ts (types + helpers) from
// client code instead — this file pulls in next/headers via the Supabase client.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { AppSettings, DEFAULT_SETTINGS, EmailOverrides, LogoLayout, normaliseSettings } from '@/lib/settings'

const KEY = 'app'

async function loadFresh(): Promise<AppSettings> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (error) return DEFAULT_SETTINGS // table missing (migration not applied yet) → factory defaults
    return normaliseSettings(data?.value)
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Per-request memoised read — the root layout + pages can all call this freely. */
export const getAppSettings = cache(loadFresh)

/** Patch + persist. Returns the normalised result. Throws on DB failure. Top-level
 *  keys are shallow-merged; `logo` is deep-merged so a partial logo patch keeps the
 *  other layout fields. */
export async function saveAppSettings(
  patch: Partial<Omit<AppSettings, 'logo'>> & { logo?: Partial<LogoLayout> },
): Promise<AppSettings> {
  const current = await loadFresh()
  const next = normaliseSettings({
    ...current,
    ...patch,
    logo: patch.logo ? { ...current.logo, ...patch.logo } : current.logo,
    // Merge email overrides at the per-email-type level: an edited email replaces
    // its own override set (blank fields dropped by normalise); others untouched.
    emails: patch.emails ? ({ ...current.emails, ...patch.emails } as EmailOverrides) : current.emails,
  })
  const admin = createAdminClient()
  const { error } = await admin
    .from('app_settings')
    // AppSettings is a plain JSON-safe object; the interface just lacks the
    // implicit index signature the generated Json column type requires.
    .upsert({ key: KEY, value: next as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`app_settings save failed: ${error.message}`)
  return next
}
