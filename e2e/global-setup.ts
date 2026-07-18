// Seeds the dev database, then logs in once per role and saves a Playwright
// storage state each — specs reuse the states instead of logging in per test.

import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { seed, ROLES, emailFor, SUPPLIER_B_EMAIL, E2E_PASSWORD, type E2eRole } from './seed'

export const STATE_DIR = resolve(__dirname, '.auth')
export const stateFor = (who: string) => resolve(STATE_DIR, `${who}.json`)

const HOME: Record<E2eRole, string> = {
  store_manager: '/client',
  regional_manager: '/regional',
  supplier: '/supplier',
  executive: '/executive',
  individual: '/individual',
  system_admin: '/admin',
}

async function login(baseURL: string, email: string, expectedHome: string, out: string) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })
  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  // proxy.ts redirects a logged-in user to their role home.
  await page.waitForURL(`**${expectedHome}**`, { timeout: 20_000 })
  await page.context().storageState({ path: out })
  await browser.close()
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3100'
  const fixture = await seed()
  mkdirSync(STATE_DIR, { recursive: true })
  // Specs read the seeded ids (ticket ids for the isolation probe) from disk.
  writeFileSync(resolve(STATE_DIR, 'fixture.json'), JSON.stringify(fixture, null, 2))

  for (const role of ROLES) {
    await login(baseURL, emailFor(role), HOME[role], stateFor(role))
  }
  await login(baseURL, SUPPLIER_B_EMAIL, '/supplier', stateFor('supplier-b'))
}
