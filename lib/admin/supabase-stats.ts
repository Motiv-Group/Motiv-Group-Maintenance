import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { ok, degraded, errored, type ProviderResult } from './types'

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

export async function getSupabaseStats(): Promise<ProviderResult<SupabaseStats>> {
  // Service-role env is required app-wide, so Supabase is always "configured".
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return errored('Supabase env vars are missing.')
  }
  const db = createAdminClient()

  // Preferred path: one RPC round-trip that returns db size, storage size,
  // auth user count, and per-table row/size estimates (see the
  // admin_db_stats migration). Falls back to per-table head counts if the
  // function hasn't been applied to the database yet.
  const { data, error } = await db.rpc('admin_db_stats')
  if (!error && data) {
    const d = data as any
    const tables: TableStat[] = Array.isArray(d.tables)
      ? d.tables.map((t: any) => ({ table: t.table, rows: numOrNull(t.rows), bytes: numOrNull(t.bytes) }))
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
        const { count } = await db.from(table).select('id', { count: 'exact', head: true })
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
