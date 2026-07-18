// Removes the tagged e2e fixture from the dev database after the run.
// Set E2E_KEEP_SEED=1 to keep it (faster local iteration — seeding is
// idempotent, so the next run reuses it).

import { teardown } from './seed'

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_SEED === '1') return
  await teardown()
}
