export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, Truck, SearchX } from 'lucide-react'
import { SearchInput } from '@/components/ui/SearchInput'
import { SuppliersDeck } from '@/components/admin/SuppliersDeck'
import type { Supplier } from '@/lib/types'

const TRADE_ORDER = ['Electrical', 'Plumbing', 'HVAC', 'Painting', 'Carpentry', 'Tiling', 'Roofing', 'General']

const TRADE_COLORS: Record<string, string> = {
  Electrical:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Plumbing:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  HVAC:        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  Painting:    'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  Carpentry:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Tiling:      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  Roofing:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  General:     'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Other:       'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

function tradeBadge(trade: string) {
  const cls = TRADE_COLORS[trade] ?? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cls}`}>{trade}</span>
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const adminClient = createAdminClient()
  const q = (searchParams.q ?? '').toLowerCase().trim()

  const { data, error } = await adminClient
    .from('suppliers')
    .select('*')
    .order('company_name')

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl p-6 text-center space-y-2">
        <p className="font-semibold text-red-700 dark:text-red-400">Sub Suppliers table not found</p>
        <p className="text-sm text-red-600 dark:text-red-500">
          Run the migration in <code className="font-mono text-xs">supabase/migrations/suppliers_table.sql</code> in your Supabase SQL Editor first.
        </p>
      </div>
    )
  }

  const allSuppliers = (data ?? []) as Supplier[]
  const qualified    = allSuppliers.filter(s => s.qualified).length

  const filtered = q
    ? allSuppliers.filter(s =>
        s.company_name.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.trade?.toLowerCase().includes(q)
      )
    : allSuppliers

  // Group by trade (profession). Known trades first in a fixed order, then any
  // custom trades alphabetically, then the catch-all 'Other' last.
  const groups = new Map<string, Supplier[]>()
  for (const s of filtered) {
    const key = s.trade && s.trade.trim() ? s.trade.trim() : 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  const known         = TRADE_ORDER.filter(t => groups.has(t))
  const custom        = Array.from(groups.keys()).filter(t => !TRADE_ORDER.includes(t) && t !== 'Other').sort()
  const orderedTrades = [...known, ...custom, ...(groups.has('Other') ? ['Other'] : [])]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sub Suppliers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {allSuppliers.length} sub-supplier{allSuppliers.length !== 1 ? 's' : ''} · {qualified} qualified
          </p>
        </div>
        <Link href="/supplier/suppliers/new">
          <div className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Add Sub Supplier
          </div>
        </Link>
      </div>

      {/* Search */}
      <Suspense>
        <SearchInput placeholder="Search by name, contact, trade or email…" />
      </Suspense>

      {/* Empty states */}
      {allSuppliers.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center space-y-3">
          <Truck size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400">No sub-suppliers yet.</p>
          <Link href="/supplier/suppliers/new">
            <span className="text-sm text-brand-600 dark:text-brand-400 hover:underline">Add your first sub-supplier</span>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center">
          <SearchX size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No sub-suppliers match <span className="font-medium">&ldquo;{q}&rdquo;</span></p>
        </div>
      ) : (
        /* One stacked deck per trade */
        <div className="space-y-6">
          {orderedTrades.map(trade => (
            <section key={trade}>
              <div className="flex items-center gap-2 mb-2">
                {tradeBadge(trade)}
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {groups.get(trade)!.length} sub-supplier{groups.get(trade)!.length !== 1 ? 's' : ''}
                </span>
              </div>
              <SuppliersDeck suppliers={groups.get(trade)!} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
