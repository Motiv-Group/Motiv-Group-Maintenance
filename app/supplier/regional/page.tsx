export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, ArrowRight, SearchX } from 'lucide-react'
import { SearchInput } from '@/components/ui/SearchInput'
import { Suspense } from 'react'

export default async function AdminRegionalPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Clients</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {regionalManagers?.length ?? 0} regional manager{regionalManagers?.length !== 1 ? 's' : ''} · {totalBranches} branch{totalBranches !== 1 ? 'es' : ''} total
        </p>
      </div>

      <Suspense>
        <SearchInput placeholder="Search by name, company or email…" />
      </Suspense>

      {filtered.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center">
          {q ? (
            <>
              <SearchX size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">No results for &quot;{q}&quot;</p>
            </>
          ) : (
            <>
              <Users size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">No regional managers registered yet.</p>
              <p className="text-xs text-gray-400 mt-1">They can sign up at /auth/signup and select the Regional Manager role.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rm => {
            const count = branchCounts[rm.id] ?? 0
            return (
              <Link key={rm.id} href={`/supplier/regional/${rm.id}`}>
                <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 border-l-brand-500 rounded-xl px-5 py-4 hover:border-brand-400 dark:hover:border-gray-400 transition-colors flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                    <span className="text-brand-700 dark:text-brand-400 font-bold text-sm">
                      {(rm.full_name ?? rm.email ?? '?')[0].toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{rm.full_name ?? 'Unnamed'}</p>
                    <p className={`text-sm truncate ${rm.company_name ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 italic'}`}>
                      {rm.company_name ?? 'No company set'}
                    </p>
                  </div>

                  {/* Branch count + arrow */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{count}</p>
                      <p className="text-xs text-gray-400">branch{count !== 1 ? 'es' : ''}</p>
                    </div>
                    <ArrowRight size={16} className="text-gray-400" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
