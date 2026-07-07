#!/usr/bin/env node
// Schema consistency check (PATH_TO_9.5 C9).
//
// `supabase/schema.sql` is hand-maintained (migrations are folded in by hand),
// so the easiest way for it to drift is a dangling reference — an `alter table`,
// foreign key, RLS policy, or trigger that points at a table which isn't actually
// defined in the file (a typo, or folding a migration but forgetting the CREATE).
// This catches exactly that class of error in CI, with no DB access.
//
// It does NOT detect drift from the LIVE database (that needs a pg_dump against
// production with a DB-URL secret — see the note in the C9 tracker row). What it
// guarantees is that schema.sql is internally consistent.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8')

// Strip line comments so `-- references public.foo` in prose can't create a false hit.
const code = sql.replace(/--[^\n]*/g, '')

// Tables the file DEFINES.
const definedTables = new Set()
{
  const re = /create table (?:if not exists )?public\.(\w+)/gi
  let m
  while ((m = re.exec(code)) !== null) definedTables.add(m[1])
}

// Places that REFERENCE a public table — each must be in definedTables.
const refs = [] // { table, kind }
const push = (re, kind) => {
  let m
  while ((m = re.exec(code)) !== null) refs.push({ table: m[1], kind })
}
push(/alter table (?:only )?public\.(\w+)/gi, 'alter table')
push(/references public\.(\w+)/gi, 'foreign key')
push(/create policy [^\n]*? on public\.(\w+)/gi, 'policy')
push(/create trigger [\s\S]*? on public\.(\w+)/gi, 'trigger')

// `storage.*` / `auth.*` objects are external (Supabase-managed) — only check public.
const dangling = refs.filter((r) => !definedTables.has(r.table))

if (dangling.length) {
  console.error(`✖ schema.sql: ${dangling.length} reference(s) to undefined public tables:\n`)
  const byTable = new Map()
  for (const d of dangling) {
    const a = byTable.get(d.table) ?? []
    a.push(d.kind)
    byTable.set(d.table, a)
  }
  for (const [table, kinds] of byTable) {
    console.error(`  - public.${table}  (via ${[...new Set(kinds)].join(', ')})`)
  }
  console.error('\nEither the CREATE TABLE is missing (folded a migration but forgot it) or the name is a typo.')
  process.exit(1)
}

console.log(`✓ schema.sql consistent — ${definedTables.size} tables defined, ${refs.length} references all resolve.`)
