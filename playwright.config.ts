import { defineConfig } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'

// E2E role-matrix smoke (audit T4). Runs ONLY with a .env.e2e pointing at the
// DEV Supabase project — e2e/env.ts hard-refuses production. The webServer
// starts the app on a dedicated port with the e2e env injected, so the app
// under test and the seed script share the same database.
//
// Not part of `npm test` (vitest) or the CI build job — run on demand with
// `npm run test:e2e`. See docs/E2E.md.

function e2eEnv(): Record<string, string> {
  const file = resolve(__dirname, '.env.e2e')
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const raw of require('fs').readFileSync(file, 'utf8').split(/\r?\n/) as string[]) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq !== -1) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}
const env = e2eEnv()
// Real env vars (CI secrets) win over .env.e2e.
for (const k of ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY', 'E2E_BASE_URL']) {
  if (process.env[k]) env[k] = process.env[k] as string
}
const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 45_000,
  retries: 1,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: env['E2E_BASE_URL'] ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      // Point the app under test at the DEV project from .env.e2e — overrides
      // whatever .env.local holds (production) for this process only.
      NEXT_PUBLIC_SUPABASE_URL: env['E2E_SUPABASE_URL'] ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env['E2E_SUPABASE_ANON_KEY'] ?? '',
      SUPABASE_SERVICE_ROLE_KEY: env['E2E_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      // Next also loads .env.local (production values) into the dev server —
      // blank the Turnstile keys so the login form doesn't demand a CAPTCHA
      // the tests can't solve. (The dev Supabase project doesn't enforce
      // captcha on sign-in; only the UI gate blocks.)
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '',
    },
  },
})
