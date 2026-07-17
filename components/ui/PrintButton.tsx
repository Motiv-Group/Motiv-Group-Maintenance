'use client'
import { Printer } from 'lucide-react'

/**
 * The single Print / Save-as-PDF button (consolidates the former
 * components/dashboards + components/reports near-duplicates).
 * `sticky` renders the report-view variant: a sticky, right-aligned wrapper
 * that stays reachable while scrolling a long printable report.
 */
export function PrintButton({ label, sticky = false }: { label?: string; sticky?: boolean }) {
  if (sticky) {
    return (
      <div className="no-print print:hidden sticky top-2 z-10 flex justify-end mb-4">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow"
        >
          <Printer size={16} /> {label ?? 'Save as PDF / Print'}
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors print:hidden"
    >
      <Printer size={15} /> {label ?? 'Print / Save as PDF'}
    </button>
  )
}
