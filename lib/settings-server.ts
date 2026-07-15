// Server-only half of the app settings: load/save the single `app_settings` row
// via the service-role client. Import lib/settings.ts (types + helpers) from
// client code instead — this file pulls in next/headers via the Supabase client.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { AppSettings, DEFAULT_SETTINGS, normaliseSettings } from '@/lib/settings'

const KEY = 'app'

async function loadFresh(): Promise<AppSettings> {
  try {
    // `app_settings` is newer than the generated database.types — cast until the
    // types are regenerated after the migration lands.
    const admin = createAdminClient() as any
    const { data, error } = await admin.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (error) return DEFAULT_SETTINGS // table missing (migration not applied yet) → factory defaults
    return normaliseSettings(data?.value)
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Per-request memoised read — the root layout + pages can all call this freely. */
export const getAppSettings = cache(loadFresh)

/** Shallow-patch + persist. Returns the normalised result. Throws on DB failure. */
export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadFresh()
  const next = normaliseSettings({ ...current, ...patch })
  const admin = createAdminClient() as any
  const { error } = await admin
    .from('app_settings')
    .upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`app_settings save failed: ${error.message}`)
  return next
}
