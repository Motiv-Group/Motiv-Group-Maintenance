#!/usr/bin/env node
// Generate lib/database.types.ts from supabase/schema.sql (B20).
//
// schema.sql is the canonical mirror of the live DB, so we derive the typed
// Supabase `Database` from it — no project creds needed, and it regenerates
// whenever schema.sql changes. It is intentionally close to (but not identical
// to) what `supabase gen types typescript` emits: Row/Insert/Update per table
// plus a Relationships array (from foreign keys) so embedded selects type-check.
//
// Fidelity notes: Insert/Update are permissive (all columns optional) to favour
// low false-positives on adoption — the win is catching wrong TABLE/COLUMN names
// and type mismatches on the input side, not enforcing every NOT NULL.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8')
const code = sql.replace(/--[^\n]*/g, '') // strip line comments

// ── SQL type → TS type ──────────────────────────────────────────────────────
function tsType(rawType) {
  let t = rawType.trim().toLowerCase()
  let isArray = false
  if (t.endsWith('[]')) { isArray = true; t = t.slice(0, -2).trim() }
  let base
  if (/^(uuid|text|varchar|character varying|char|citext|name|bpchar|inet|time|timestamptz|timestamp|timestamp with time zone|timestamp without time zone|date|interval)/.test(t)) base = 'string'
  else if (/^(bool|boolean)/.test(t)) base = 'boolean'
  else if (/^(smallint|integer|int|int2|int4|int8|bigint|numeric|decimal|real|double precision|float4|float8|money)/.test(t)) base = 'number'
  else if (/^(json|jsonb)/.test(t)) base = 'Json'
  else base = 'string' // enums / domains / unknown → treat as string
  return isArray ? `${base}[]` : base
}

// ── Parse CREATE TABLE blocks ───────────────────────────────────────────────
const tables = {} // name -> { columns: [{name, tsType, nullable}], relationships: [] }
const tableRe = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi
let tm
while ((tm = tableRe.exec(code)) !== null) {
  const name = tm[1]
  const body = tm[2]
  const columns = []
  for (let line of body.split('\n')) {
    line = line.trim().replace(/,$/, '')
    if (!line) continue
    const low = line.toLowerCase()
    // Skip table-level constraints.
    if (/^(primary key|foreign key|constraint|unique|check|exclude)\b/.test(low)) continue
    const m = line.match(/^"?(\w+)"?\s+(.+)$/)
    if (!m) continue
    const colName = m[1]
    // Column type = everything up to the first constraint keyword.
    const rest = m[2]
    const typeMatch = rest.match(/^([\w ]+(?:\([^)]*\))?(?:\[\])?)/)
    const rawType = (typeMatch ? typeMatch[1] : rest).replace(/\([^)]*\)/, '').trim()
    const nullable = !/\bnot null\b/i.test(rest)
    columns.push({ name: colName, tsType: tsType(rawType), nullable })
  }
  tables[name] = { columns, relationships: [] }
}

// ── Foreign keys → Relationships ────────────────────────────────────────────
// Inline: `<col> ... references public.Y(refcol)` inside a create table.
// Standalone: `alter table public.X add foreign key (col) references public.Y(refcol)`.
const fkRe = /alter table (?:only )?public\.(\w+)\s+add (?:constraint \w+ )?foreign key \((\w+)\)\s+references public\.(\w+)\s*\((\w+)\)/gi
let fk
while ((fk = fkRe.exec(code)) !== null) {
  const [, table, col, refTable, refCol] = fk
  if (!tables[table]) continue
  tables[table].relationships.push({
    foreignKeyName: `${table}_${col}_fkey`, columns: [col],
    isOneToOne: false, referencedRelation: refTable, referencedColumns: [refCol],
  })
}

// ── Emit ────────────────────────────────────────────────────────────────────
const q = (s) => `"${s}"`
const rel = (r) =>
  `        {\n` +
  `          foreignKeyName: ${q(r.foreignKeyName)}\n` +
  `          columns: [${q(r.columns[0])}]\n` +
  `          isOneToOne: ${r.isOneToOne}\n` +
  `          referencedRelation: ${q(r.referencedRelation)}\n` +
  `          referencedColumns: [${q(r.referencedColumns[0])}]\n` +
  `        }`

const tableType = (name, t) => {
  const row = t.columns.map((c) => `          ${c.name}: ${c.tsType}${c.nullable ? ' | null' : ''}`).join('\n')
  const ins = t.columns.map((c) => `          ${c.name}?: ${c.tsType}${c.nullable ? ' | null' : ''}`).join('\n')
  const rels = t.relationships.length ? t.relationships.map(rel).join(',\n') : ''
  return (
    `      ${name}: {\n` +
    `        Row: {\n${row}\n        }\n` +
    `        Insert: {\n${ins}\n        }\n` +
    `        Update: {\n${ins}\n        }\n` +
    `        Relationships: [${rels ? '\n' + rels + '\n      ' : ''}]\n` +
    `      }`
  )
}

const tablesOut = Object.entries(tables).sort((a, b) => a[0].localeCompare(b[0])).map(([n, t]) => tableType(n, t)).join('\n')

const out = `// AUTO-GENERATED from supabase/schema.sql by scripts/gen-db-types.mjs — do not edit by hand.
// Regenerate with: npm run gen:types  (runs whenever schema.sql changes)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
${tablesOut}
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
`

writeFileSync(join(root, 'lib', 'database.types.ts'), out)
const nCols = Object.values(tables).reduce((s, t) => s + t.columns.length, 0)
const nRels = Object.values(tables).reduce((s, t) => s + t.relationships.length, 0)
console.log(`✓ lib/database.types.ts — ${Object.keys(tables).length} tables, ${nCols} columns, ${nRels} relationships.`)
