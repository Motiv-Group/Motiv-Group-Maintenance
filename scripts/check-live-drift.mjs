#!/usr/bin/env node
// C9 — TRUE schema-drift check: compares the repo's canonical supabase/schema.sql
// against the LIVE database, using PostgREST's OpenAPI introspection (served at
// {SUPABASE_URL}/rest/v1/ to the service role). No pg password or new secrets
// needed — the same URL + service-role key the app already uses.
//
// What it compares (catalog-level — the 90% drift case):
//   • table set, both directions (repo-only = never applied; live-only = never folded)
//   • column set per table, both directions
//   • column type buckets (string/number/boolean/json) where confidently mappable
// What it does NOT compare (documented limitation): RLS policies, functions,
// triggers, nullability (PostgREST's `required` conflates NOT NULL with
// has-no-default) — `npm run schema:check` covers internal consistency, and the
// periodic Supabase advisor covers policies.
//
// Env: DRIFT_SUPABASE_URL + DRIFT_SUPABASE_KEY (or falls back to
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Exit 1 on drift.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── repo side: parse CREATE TABLE blocks from schema.sql ─────────────────────
// (Mirrors the parser in scripts/gen-db-types.mjs — kept as a copy on purpose:
// that script's OUTPUT is protected by the CI types-drift gate and must not be
// touched by this feature.)
function tsBucket(rawType) {
  let t = rawType.trim().toLowerCase()
  if (t.endsWith('[]')) t = t.slice(0, -2).trim()
  if (/^(uuid|text|varchar|character varying|char|citext|name|bpchar|inet|time|timestamptz|timestamp|date|interval)/.test(t)) return 'string'
  if (/^(bool|boolean)/.test(t)) return 'boolean'
  if (/^(smallint|integer|int|int2|int4|int8|bigint|numeric|decimal|real|double precision|float4|float8|money)/.test(t)) return 'number'
  if (/^(json|jsonb)/.test(t)) return 'json'
  return 'string'
}

function parseRepoSchema() {
  const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '')
  const tables = new Map()
  const tableRe = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi
  let m
  while ((m = tableRe.exec(sql)) !== null) {
    const cols = new Map()
    for (let line of m[2].split('\n')) {
      line = line.trim().replace(/,$/, '')
      if (!line) continue
      if (/^(primary key|foreign key|constraint|unique|check|exclude)\b/i.test(line)) continue
      const cm = line.match(/^"?(\w+)"?\s+(.+)$/)
      if (!cm) continue
      const typeMatch = cm[2].match(/^([\w ]+(?:\([^)]*\))?(?:\[\])?)/)
      const rawType = (typeMatch ? typeMatch[1] : cm[2]).replace(/\([^)]*\)/, '').trim()
      cols.set(cm[1], tsBucket(rawType))
    }
    tables.set(m[1], cols)
  }
  return tables
}

// ── live side: PostgREST OpenAPI ─────────────────────────────────────────────
function liveBucket(prop) {
  const t = prop.type
  const f = (prop.format ?? '').toLowerCase()
  if (t === 'integer' || t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  if (/^jsonb?$/.test(f) || t === 'object' || (t === 'array' && /json/.test(f))) return 'json'
  if (t === 'array') return f.replace(/\[\]$/, '') && /int|numeric|float|double|money/.test(f) ? 'number' : 'string'
  return 'string'
}

async function fetchLiveSchema(url, key) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`OpenAPI introspection failed: HTTP ${res.status} ${await res.text().then(t => t.slice(0, 200))}`)
  const spec = await res.json()
  const tables = new Map()
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    const cols = new Map()
    for (const [col, prop] of Object.entries(def.properties ?? {})) cols.set(col, liveBucket(prop))
    tables.set(name, cols)
  }
  return tables
}

// ── diff ─────────────────────────────────────────────────────────────────────
async function main() {
  const url = process.env.DRIFT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.DRIFT_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('check-live-drift: set DRIFT_SUPABASE_URL + DRIFT_SUPABASE_KEY (or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(2)
  }
  console.log(`Comparing supabase/schema.sql ⇄ live ${new URL(url).host} …`)
  const repo = parseRepoSchema()
  const live = await fetchLiveSchema(url, key)

  const problems = []
  const typeWarnings = []
  for (const [t, repoCols] of repo) {
    const liveCols = live.get(t)
    if (!liveCols) { problems.push(`table \`${t}\` is in schema.sql but NOT live (migration not applied?)`); continue }
    for (const [c, bucket] of repoCols) {
      if (!liveCols.has(c)) problems.push(`column \`${t}.${c}\` is in schema.sql but NOT live`)
      else if (liveCols.get(c) !== bucket) typeWarnings.push(`type bucket differs for \`${t}.${c}\`: schema.sql=${bucket} live=${liveCols.get(c)}`)
    }
    for (const c of liveCols.keys()) {
      if (!repoCols.has(c)) problems.push(`column \`${t}.${c}\` exists LIVE but not in schema.sql (fold the migration!)`)
    }
  }
  for (const t of live.keys()) {
    if (!repo.has(t)) problems.push(`table \`${t}\` exists LIVE but not in schema.sql (fold the migration!)`)
  }

  console.log(`Checked ${repo.size} repo tables against ${live.size} live relations.`)
  for (const w of typeWarnings) console.warn('  warn:', w)
  if (problems.length) {
    console.error(`\nDRIFT DETECTED (${problems.length}):`)
    for (const p of problems) console.error('  ✗', p)
    console.error('\nFix: apply the missing migration to the drifted side, or fold applied migrations into supabase/schema.sql (standing instruction #4).')
    process.exit(1)
  }
  console.log('No drift — schema.sql matches the live catalog. ✅')
}

main().catch(e => { console.error('check-live-drift:', e.message); process.exit(2) })
