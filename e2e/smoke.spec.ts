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

// Ticket DETAIL pages — the class of bug the nav-only matrix missed (a detail
// page can throw a server error / error boundary even when its list renders fine).
// Open a seeded ticket's detail for every role that can see it and assert it
// renders without an error boundary.
test.describe('ticket detail pages render', () => {
  const cases: { role: string; paths: (f: SeedResult) => string[] }[] = [
    { role: 'regional_manager', paths: f => [f.awardedTicketId, f.openTicketId, f.closeoutTicketId, f.completedTicketId].map(id => `/regional/tickets/${id}`) },
    { role: 'store_manager', paths: f => [f.awardedTicketId, f.openTicketId, f.closeoutTicketId, f.completedTicketId].map(id => `/client/tickets/${id}`) },
    { role: 'supplier', paths: f => [f.awardedTicketId, f.closeoutTicketId, f.completedTicketId].map(id => `/supplier/tickets/${id}`) },
  ]
  for (const c of cases) {
    test(`${c.role} ticket detail renders`, async ({ browser }) => {
      const f = fixture()
      const ctx = await browser.newContext({ storageState: stateFor(c.role) })
      const page = await ctx.newPage()
      // A Server Component passing a function to a Client Component throws
      // "Functions cannot be passed directly to Client Components" — which crashes
      // the page but doesn't always trip the "Something went wrong" boundary text in
      // dev, so watch the console/page-error stream for it explicitly.
      const renderErrors: string[] = []
      const capture = (text: string) => { if (/Functions cannot be passed directly to Client Components|Maximum update depth|Objects are not valid as a React child/i.test(text)) renderErrors.push(text) }
      page.on('pageerror', e => capture(String(e?.message ?? e)))
      page.on('console', m => { if (m.type() === 'error') capture(m.text()) })
      try {
        for (const p of c.paths(f)) await expectRendered(page, p)
      } finally {
        await ctx.close()
      }
      expect(renderErrors, `RSC/render errors on ${c.role} detail:\n${renderErrors.join('\n')}`).toEqual([])
    })
  }
})

test.describe('cross-supplier isolation', () => {
  test.use({ storageState: stateFor('supplier-b') })

  test("supplier B cannot open supplier A's awarded ticket", async ({ page }) => {
    const { awardedTicketId } = fixture()
    await page.goto(`/supplier/tickets/${awardedTicketId}`)
    // The loader redirects non-awarded/non-invited suppliers to /supplier/tickets.
    await page.waitForURL(url => !url.pathname.includes(awardedTicketId), { timeout: 30_000 })
    // Belt + braces: wherever we landed, none of A's ticket content is present.
    await expect(page.getByText('motiv-e2e awarded ticket')).toHaveCount(0)
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
