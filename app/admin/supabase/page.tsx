export const dynamic = 'force-dynamic'

import { Database, HardDrive, Users, Table2 } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getSupabaseStats } from '@/lib/admin/supabase-stats'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, UsageBar, Notice } from '@/components/admin/ui'
import { FREE_LIMITS, formatBytes, formatNumber } from '@/lib/admin/limits'

export default async function SupabaseAdminPage() {
  await requireMasterAdmin()
  const res = await getSupabaseStats()
  const d = res.data

  return (
    <div className="space-y-6">
      <ProviderHeader
        name="Supabase"
        icon={<Database className="text-emerald-500" size={22} />}
        whatItIs="Your backend: Postgres database, Auth (logins), file Storage and Realtime. Every ticket, quote, user and photo lives here. If Supabase is down or full, the app stops working — so watch the database and storage size against the free-tier caps."
        result={res}
        dashboardUrl="https://supabase.com/dashboard/project/_/reports"
      />

      {d && (
        <>
          {/* Free-tier usage gauges — the numbers that decide when you must upgrade. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Database size={13} /> Database size
                <InfoTip title="Database size">Total Postgres size. Supabase Free caps this at 500 MB. When the bar goes amber (75%) start planning the Supabase Pro upgrade; red (90%) means act now or writes can start failing.</InfoTip>
              </div>
              <div className="text-2xl font-bold leading-none text-[var(--text)] tabular-nums">{formatBytes(d.dbSizeBytes)}</div>
              <div className="text-[11px] text-[var(--text-faint)]">of {formatBytes(FREE_LIMITS.supabaseDbBytes)} free</div>
              <UsageBar value={d.dbSizeBytes} limit={FREE_LIMITS.supabaseDbBytes} />
            </Card>

            <Card className="p-4 flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <HardDrive size={13} /> Storage used
                <InfoTip title="File storage">Size of all uploaded files (ticket photos, proof-of-completion, COC docs). Free tier is ~1 GB. Photos add up fast — this is usually the first free-tier limit you hit.</InfoTip>
              </div>
              <div className="text-2xl font-bold leading-none text-[var(--text)] tabular-nums">{formatBytes(d.storageBytes)}</div>
              <div className="text-[11px] text-[var(--text-faint)]">{formatNumber(d.storageObjects)} files · of {formatBytes(FREE_LIMITS.supabaseStorageBytes)} free</div>
              <UsageBar value={d.storageBytes} limit={FREE_LIMITS.supabaseStorageBytes} />
            </Card>

            <StatTile
              label="Auth users"
              icon={<Users size={13} />}
              tone="gold"
              value={formatNumber(d.authUsers)}
              info={<>Total accounts in Supabase Auth (managers, RMs, suppliers, execs, admins). Free tier allows 50,000 monthly active users — plenty for a pilot.</>}
              hint={`of ${formatNumber(FREE_LIMITS.supabaseMau)} MAU free`}
            />

            <StatTile
              label="Total rows"
              icon={<Table2 size={13} />}
              tone="info"
              value={formatNumber(d.totalRows)}
              info={<>Sum of live rows across all public tables — a rough gauge of how much business data the app holds. Individual tables are broken down below.</>}
              hint={`${d.tables.length} tables`}
            />
          </div>

          {!d.rpcInstalled && (
            <Notice variant="warn">
              Database + storage sizes are hidden because the <code className="font-mono">admin_db_stats()</code> function isn&apos;t installed yet. Apply <code className="font-mono">supabase/migrations/20260705_admin_db_stats.sql</code> in the Supabase SQL Editor to unlock the size gauges above and the full table list.
            </Notice>
          )}

          {/* Per-table breakdown */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Table2 size={15} className="text-emerald-500" /> Tables
              <InfoTip title="Tables">Row count and on-disk size per table (row counts are live Postgres estimates, refreshed by autovacuum). Spot which tables are growing fastest — usually tickets, notifications and storage-linked rows.</InfoTip>
            </h2>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Table</th>
                    <th className="px-2 text-right">Rows</th>
                    <th className="px-2 text-right">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {d.tables.map((t) => (
                    <tr key={t.table} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 px-2 font-mono text-[13px] text-[var(--text)]">{t.table}</td>
                      <td className="px-2 text-right text-[var(--text-muted)] tabular-nums">{formatNumber(t.rows)}</td>
                      <td className="px-2 text-right text-[var(--text-muted)] tabular-nums">{t.bytes == null ? '—' : formatBytes(t.bytes)}</td>
                    </tr>
                  ))}
                  {!d.tables.length && <tr><td colSpan={3} className="py-6 text-center text-[var(--text-faint)]">No tables reported.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
