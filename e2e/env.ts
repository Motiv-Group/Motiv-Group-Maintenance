// E2E environment loader + safety gate.
//
// The e2e suite NEVER reads .env.local (that points at production). It reads
// ONLY .env.e2e (git-ignored), which must point at the DEV Supabase project
// (see docs/PREVIEW_DEPLOYMENTS.md for creating it). Seeding writes real auth
// users and rows, so running it against production would pollute live data —
// the guard below makes that impossible to do by accident.

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export interface E2eEnv {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  baseURL: string
}

function parseDotenv(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

/** Read the production URL from .env.local (if present) purely to BLOCK it. */
function prodUrl(root: string): string | null {
  const p = resolve(root, '.env.local')
  if (!existsSync(p)) return null
  return parseDotenv(p)['NEXT_PUBLIC_SUPABASE_URL'] ?? null
}

export function loadE2eEnv(root: string = process.cwd()): E2eEnv {
  // Precedence: real environment variables (CI secrets) over .env.e2e (local).
  const file = resolve(root, '.env.e2e')
  const fromFile = existsSync(file) ? parseDotenv(file) : {}
  const env: Record<string, string> = { ...fromFile }
  for (const k of ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY', 'E2E_SEED_ALLOWED', 'E2E_BASE_URL']) {
    if (process.env[k]) env[k] = process.env[k] as string
  }
  if (!env['E2E_SUPABASE_URL']) {
    throw new Error(
      'No e2e environment. The suite refuses to run against .env.local (production). ' +
      'Create .env.e2e (or set E2E_* env vars) with the DEV Supabase project values:\n' +
      '  E2E_SUPABASE_URL=...\n  E2E_SUPABASE_ANON_KEY=...\n  E2E_SUPABASE_SERVICE_ROLE_KEY=...\n' +
      '  E2E_SEED_ALLOWED=yes\n' +
      'See docs/E2E.md.'
    )
  }
  const supabaseUrl = env['E2E_SUPABASE_URL'] ?? ''
  const anonKey = env['E2E_SUPABASE_ANON_KEY'] ?? ''
  const serviceRoleKey = env['E2E_SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('.env.e2e is missing E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_ROLE_KEY.')
  }
  if (env['E2E_SEED_ALLOWED'] !== 'yes') {
    throw new Error('.env.e2e must set E2E_SEED_ALLOWED=yes — an explicit acknowledgement that this project will be seeded with test data.')
  }
  // Hard guard: never seed the project .env.local points at (production).
  const prod = prodUrl(root)
  if (prod && supabaseUrl.replace(/\/$/, '') === prod.replace(/\/$/, '')) {
    throw new Error(
      `SAFETY STOP: .env.e2e points at the SAME Supabase project as .env.local (${prod}). ` +
      'That is production — seeding it would create real users and rows. Point .env.e2e at the DEV project.'
    )
  }
  return { supabaseUrl, anonKey, serviceRoleKey, baseURL: env['E2E_BASE_URL'] ?? 'http://localhost:3100' }
}
