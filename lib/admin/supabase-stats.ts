import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'
import { ok, degraded, unconfigured, errored, type ProviderResult } from './types'

export interface TableStat { table: string; rows: number | null; bytes: number | null }
export interface SupabaseStats {
  dbSizeBytes: number | null       // whole-database size (from admin_db_stats RPC)
  storageBytes: number | null      // sum of storage.objects sizes
  storageObjects: number | null
  authUsers: number | null
  tables: TableStat[]
  totalRows: number
  /** True when the admin_db_stats() SQL function is installed (gives sizes). */
  rpcInstalled: boolean
}

// Fallback table list — only used when the admin_db_stats() function isn't
// installed yet. Each is counted individually; a missing table just shows "—".
const FALLBACK_TABLES = [
  'companies', 'user_profiles', 'tickets', 'quotes', 'completions',
  'suppliers', 'notifications', 'ratings', 'push_subscriptions', 'regions',
]

// Shape of the admin_db_stats() RPC payload. The function is installed by a
// migration the type generator doesn't see (Functions is empty in the generated
// types), so both the rpc call and its return are typed locally.
interface AdminDbStatsPayload {
  db_size_bytes?: unknown
  storage_bytes?: unknown
  storage_objects?: unknown
  auth_users?: unknown
  tables?: { table: string; rows?: unknown; bytes?: unknown }[]
}
type AdminDbStatsRpc = (fn: 'admin_db_stats') => PromiseLike<{ data: unknown; error: { message: string } | null }>

// Two switchable targets: the live production database (the app's own Supabase
// project) or a separate dev database. Dev needs its own service-role credentials.
export type SupabaseTarget = 'prod' | 'dev'

function resolveClient(target: SupabaseTarget): { db?: SupabaseClient<Database>; unconfiguredMsg?: string; erroredMsg?: string } {
  if (target === 'dev') {
    const url = process.env.SUPABASE_URL_DEV
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY_DEV
    if (!url || !key) return { unconfiguredMsg: 'Set SUPABASE_URL_DEV and SUPABASE_SERVICE_ROLE_KEY_DEV to show the dev database here. (Apply the admin_db_stats migration to that project too for size gauges.)' }
    return { db: createClient<Database>(url, key, { auth: { persistSession: false } }) }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { erroredMsg: 'Supabase env vars are missing.' }
  }
  return { db: createAdminClient() as unknown as SupabaseClient<Database> }
}

export async function getSupabaseStats(target: SupabaseTarget = 'prod'): Promise<ProviderResult<SupabaseStats>> {
  const { db, unconfiguredMsg, erroredMsg } = resolveClient(target)
  if (unconfiguredMsg) return unconfigured(unconfiguredMsg)
  if (erroredMsg || !db) return errored(erroredMsg ?? 'Supabase is not configured.')

  // Preferred path: one RPC round-trip that returns db size, storage size,
  // auth user count, and per-table row/size estimates (see the
  // admin_db_stats migration). Falls back to per-table head counts if the
  // function hasn't been applied to the database yet.
  const { data, error } = await (db.rpc as unknown as AdminDbStatsRpc)('admin_db_stats')
  if (!error && data) {
    const d = data as AdminDbStatsPayload // rpc return isn't in the generated types
    const tables: TableStat[] = Array.isArray(d.tables)
      ? d.tables.map((t) => ({ table: t.table, rows: numOrNull(t.rows), bytes: numOrNull(t.bytes) }))
      : []
    const totalRows = tables.reduce((a, t) => a + (t.rows ?? 0), 0)
    return ok({
      dbSizeBytes: numOrNull(d.db_size_bytes),
      storageBytes: numOrNull(d.storage_bytes),
      storageObjects: numOrNull(d.storage_objects),
      authUsers: numOrNull(d.auth_users),
      tables,
      totalRows,
      rpcInstalled: true,
    })
  }

  // Fallback — exact head counts, no sizes. Prompt to apply the migration.
  const counts = await Promise.all(
    FALLBACK_TABLES.map(async (table) => {
      try {
        // Fallback names may be absent from the DB and the generated types (a
        // missing table just renders "—"), hence the table-union cast.
        const { count } = await db.from(table as keyof Database['public']['Tables']).select('id', { count: 'exact', head: true })
        return { table, rows: count ?? null, bytes: null } as TableStat
      } catch {
        return { table, rows: null, bytes: null } as TableStat
      }
    }),
  )
  const totalRows = counts.reduce((a, t) => a + (t.rows ?? 0), 0)
  return degraded(
    {
      dbSizeBytes: null, storageBytes: null, storageObjects: null, authUsers: null,
      tables: counts, totalRows, rpcInstalled: false,
    },
    'Row counts only. Apply the admin_db_stats migration to see database + storage sizes and all tables.',
  )
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
