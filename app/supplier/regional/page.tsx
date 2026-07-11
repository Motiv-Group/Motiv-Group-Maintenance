export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, ArrowRight, SearchX } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { SearchInput } from '@/components/ui/SearchInput'
import { Suspense } from 'react'

export default async function AdminRegionalPage(
  props: {
    searchParams: Promise<{ q?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const adminClient = createAdminClient()
  const q = (searchParams.q ?? '').toLowerCase().trim()

  // v3: RMs are user_profiles rows; branches (stores) link to an RM through their
  // region (regional_users → stores.region_id), not a per-store column.
  const [{ data: regionalManagers }, { data: stores }, { data: regionalUsers }] = await Promise.all([
    adminClient
      .from('user_profiles')
      .select('id, full_name, company_name, email, phone')
      .eq('role', 'regional_manager')
      .order('full_name'),
    adminClient
      .from('stores')
      .select('id, region_id'),
    adminClient
      .from('regional_users')
      .select('user_id, region_id'),
  ])

  // Count stores per region, then attribute each region's stores to its RM(s).
  const storesPerRegion: Record<string, number> = {}
  for (const s of stores ?? []) {
    if (s.region_id) storesPerRegion[s.region_id] = (storesPerRegion[s.region_id] ?? 0) + 1
  }
  const branchCounts: Record<string, number> = {}
  for (const link of regionalUsers ?? []) {
    if (link.user_id && link.region_id) {
      branchCounts[link.user_id] = (branchCounts[link.user_id] ?? 0) + (storesPerRegion[link.region_id] ?? 0)
    }
  }

  const filtered = q
    ? (regionalManagers ?? []).filter(rm =>
        rm.full_name?.toLowerCase().includes(q) ||
        rm.email?.toLowerCase().includes(q) ||
        rm.company_name?.toLowerCase().includes(q)
      )
    : (regionalManagers ?? [])

  const totalBranches = stores?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">Clients</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          {regionalManagers?.length ?? 0} regional manager{regionalManagers?.length !== 1 ? 's' : ''} · {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} total
        </p>
      </div>

      <Suspense>
        <SearchInput placeholder="Search by name, company or email…" />
      </Suspense>

      {filtered.length === 0 ? (
        <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
          {q ? (
            <div>
              <SearchX size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
              <p className="text-sm text-[var(--text-faint)]">No results for &quot;{q}&quot;</p>
            </div>
          ) : (
            <div>
              <Users size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
              <p className="text-sm text-[var(--text-faint)]">No regional managers registered yet.</p>
              <p className="text-xs text-[var(--text-faint)] mt-1">They can sign up at /auth/signup and select the Regional Manager role.</p>
            </div>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          {filtered.map(rm => {
            const count = branchCounts[rm.id] ?? 0
            return (
              <Link
                key={rm.id}
                href={`/supplier/regional/${rm.id}`}
                className="flex items-center gap-4 px-5 py-4 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">
                    {(rm.full_name ?? rm.email ?? '?')[0].toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--text)] truncate">{rm.full_name ?? 'Unnamed'}</p>
                  <p className={`text-sm truncate ${rm.company_name ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-faint)] italic'}`}>
                    {rm.company_name ?? 'No company set'}
                  </p>
                </div>

                {/* Branch count + arrow */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-[var(--text)]">{count}</p>
                    <p className="text-xs text-[var(--text-faint)]">branch{count !== 1 ? 'es' : ''}</p>
                  </div>
                  <ArrowRight size={16} className="text-[var(--text-faint)]" />
                </div>
              </Link>
            )
          })}
        </Card>
      )}
    </div>
  )
}
