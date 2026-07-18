# E2E role-matrix smoke (Playwright) — audit T4

The suite that would have caught the S1–S4 class of bug: it logs in as **every
role**, walks every nav tab, asserts the route gates bounce foreign roles, and
probes **cross-supplier isolation** (supplier B must never see supplier A's
awarded ticket).

## What it needs (one-time, ~5 min)

The suite seeds real auth users + rows, so it must run against the **DEV
Supabase project** (the same one Preview deployments use — see
`docs/PREVIEW_DEPLOYMENTS.md`). It hard-refuses production:
`e2e/env.ts` compares against `.env.local`'s URL and stops if they match, and
it won't run at all without an explicit `E2E_SEED_ALLOWED=yes`.

Create `.env.e2e` in the repo root (git-ignored):

```
E2E_SUPABASE_URL=https://<dev-project-ref>.supabase.co
E2E_SUPABASE_ANON_KEY=<dev anon key>
E2E_SUPABASE_SERVICE_ROLE_KEY=<dev service role key>
E2E_SEED_ALLOWED=yes
```

(Values: Supabase dashboard → the **motiv-dev** project → Settings → API.)

## Run it

```
npm run test:e2e        # headless run (starts next dev on :3100 itself)
npm run test:e2e:ui     # Playwright UI mode
E2E_KEEP_SEED=1 npm run test:e2e   # keep the seeded fixture for faster re-runs
```

`playwright.config.ts` starts the app on port **3100** with the dev-project env
injected (your `.env.local` / prod values are not touched), seeds the fixture
(idempotent), logs in once per role and caches storage states in `e2e/.auth/`,
runs the specs, then tears the fixture down (unless `E2E_KEEP_SEED=1`).

## What's covered (`e2e/smoke.spec.ts`)

- **Per role** (store_manager, regional_manager, supplier, executive,
  individual, system_admin): home + every nav tab renders with no error
  boundary; a foreign role's section redirects away.
- **Cross-supplier isolation:** supplier B blocked from supplier A's awarded
  ticket detail (loader redirect) and A's ticket absent from B's list.
- **Unauthenticated:** every protected section bounces to `/auth/login`.

## The fixture (`e2e/seed.ts`)

Tagged, isolated, idempotent: company `motiv-e2e Co` → region `E2E` → store
`E2E-001`, two verified supplier orgs (A awarded a ticket, B not invited), one
auth user per role at `<role>@motiv-e2e.test` (+ `supplier-b@motiv-e2e.test`),
shared password in `e2e/seed.ts`. Teardown deletes everything by tag.

## CI

Deliberately **not** in the CI build job — it needs dev-project secrets and a
browser. Wire it later as a separate workflow with
`E2E_SUPABASE_*` repo secrets + `npx playwright install chromium` if wanted;
the config already reads plain env vars over `.env.e2e` when present.
