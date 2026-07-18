// Role-matrix smoke (audit T4). For every role: the home + every nav tab
// renders without an error boundary; other roles' sections redirect away
// (proxy.ts gate); and the cross-supplier isolation probe — supplier B must
// NOT see supplier A's awarded ticket. This is exactly the class of test that
// would have caught the S1-S4 page-level authZ leaks.

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { stateFor } from './global-setup'
import type { SeedResult } from './seed'

const fixture = (): SeedResult =>
  JSON.parse(readFileSync(resolve(__dirname, '.auth', 'fixture.json'), 'utf8'))

const TABS: Record<string, { home: string; tabs: string[]; foreign: string }> = {
  store_manager: { home: '/client', tabs: ['/client', '/client/tickets', '/client/visits'], foreign: '/regional' },
  regional_manager: { home: '/regional', tabs: ['/regional', '/regional/stores', '/regional/tickets', '/regional/signoff', '/regional/snag', '/regional/suppliers', '/regional/projects'], foreign: '/admin' },
  supplier: { home: '/supplier', tabs: ['/supplier', '/supplier/tickets', '/supplier/quotes', '/supplier/signoff', '/supplier/snag', '/supplier/technicians', '/supplier/stats'], foreign: '/regional' },
  executive: { home: '/executive', tabs: ['/executive', '/executive/regions', '/executive/stores', '/executive/suppliers', '/executive/decisions'], foreign: '/client' },
  individual: { home: '/individual', tabs: ['/individual', '/individual/tickets'], foreign: '/supplier' },
  system_admin: { home: '/admin', tabs: ['/admin', '/admin/accounts', '/admin/hierarchy', '/admin/suppliers', '/admin/projects', '/admin/audit'], foreign: '/client' },
}

async function expectRendered(page: Page, path: string) {
  const res = await page.goto(path)
  expect(res, `${path} should respond`).not.toBeNull()
  expect(res!.status(), `${path} status`).toBeLessThan(400)
  // Error boundary / crash marker must not be present.
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
}

for (const [role, cfg] of Object.entries(TABS)) {
  test.describe(`${role}`, () => {
    test.use({ storageState: stateFor(role) })

    test(`every nav tab renders`, async ({ page }) => {
      for (const tab of cfg.tabs) await expectRendered(page, tab)
    })

    test(`is gated out of ${cfg.foreign}`, async ({ page }) => {
      await page.goto(cfg.foreign)
      // proxy.ts must bounce to the role's own home (or login) — never render
      // another role's section.
      await page.waitForURL(url => !url.pathname.startsWith(cfg.foreign), { timeout: 15_000 })
    })
  })
}

test.describe('cross-supplier isolation', () => {
  test.use({ storageState: stateFor('supplier-b') })

  test("supplier B cannot open supplier A's awarded ticket", async ({ page }) => {
    const { awardedTicketId } = fixture()
    await page.goto(`/supplier/tickets/${awardedTicketId}`)
    // The loader redirects non-awarded/non-invited suppliers to /supplier/tickets.
    await page.waitForURL(url => !url.pathname.includes(awardedTicketId), { timeout: 15_000 })
  })

  test("supplier B's ticket list does not contain supplier A's ticket", async ({ page }) => {
    await page.goto('/supplier/tickets')
    await expect(page.getByText('motiv-e2e awarded ticket')).toHaveCount(0)
  })
})

test.describe('unauthenticated', () => {
  test('protected sections all bounce to login', async ({ page }) => {
    for (const path of ['/client', '/regional', '/supplier', '/executive', '/individual', '/admin']) {
      await page.goto(path)
      await page.waitForURL('**/auth/login**', { timeout: 15_000 })
    }
  })
})
