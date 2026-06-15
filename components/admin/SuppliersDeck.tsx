'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import type { Supplier } from '@/lib/types'

function SupplierContent({ s }: { s: Supplier }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{s.company_name}</p>
        {s.qualified ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full shrink-0">
            <CheckCircle2 size={10} /> Qualified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full shrink-0">
            <XCircle size={10} /> Unqualified
          </span>
        )}
      </div>
      {s.contact_name && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{s.contact_name}</p>
      )}
    </div>
  )
}

/**
 * Collapsible stacked deck of sub-suppliers (one deck per trade). Collapsed it
 * shows the top card over a layered pile; expanded it lists every sub-supplier,
 * each linking to its detail page. Mirrors RecentTicketsStack's interaction.
 */
export function SuppliersDeck({ suppliers }: { suppliers: Supplier[] }) {
  const [expanded, setExpanded] = useState(false)
  if (suppliers.length === 0) return null

  const top = suppliers[0]
  const layerCount = Math.min(suppliers.length - 1, 2)

  const collapseBar = (
    <button
      onClick={() => setExpanded(false)}
      className="w-full text-xs text-[#C6A35D] hover:text-amber-600 flex items-center justify-between py-2 px-1 transition-colors"
    >
      <span className="flex items-center gap-1 font-medium">
        <ChevronUp size={12} /> Collapse
      </span>
      <span className="text-gray-400 dark:text-gray-500">
        {suppliers.length} sub-supplier{suppliers.length !== 1 ? 's' : ''}
      </span>
    </button>
  )

  if (expanded) {
    return (
      <div>
        <div className="mb-3">{collapseBar}</div>
        <div className="space-y-2">
          {suppliers.map(s => (
            <Link key={s.id} href={`/supplier/suppliers/${s.id}`}>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-brand-400 dark:hover:border-gray-500 transition-colors flex items-center justify-between gap-3">
                <SupplierContent s={s} />
                <ArrowRight size={16} className="text-gray-400 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-3">{collapseBar}</div>
      </div>
    )
  }

  return (
    <button onClick={() => setExpanded(true)} className="w-full text-left focus:outline-none group" aria-label="Expand sub-suppliers">
      <div className="relative mb-4">
        {layerCount >= 2 && (
          <div className="absolute rounded-xl bg-slate-300 dark:bg-gray-600" style={{ left: '14px', right: '14px', top: 0, bottom: '-10px', zIndex: 0 }} />
        )}
        {layerCount >= 1 && (
          <div className="absolute rounded-xl bg-slate-200 dark:bg-gray-700" style={{ left: '7px', right: '7px', top: 0, bottom: '-5px', zIndex: 1 }} />
        )}
        <div
          className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm group-hover:border-brand-400 dark:group-hover:border-gray-500 group-hover:shadow-md transition-all"
          style={{ zIndex: 2 }}
        >
          <SupplierContent s={top} />
          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {suppliers.length} sub-supplier{suppliers.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs font-medium text-[#C6A35D] flex items-center gap-1">
              View all <ChevronDown size={11} />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
