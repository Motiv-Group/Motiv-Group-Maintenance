'use client'
import { Printer } from 'lucide-react'

export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors print:hidden"
    >
      <Printer size={15} /> {label}
    </button>
  )
}
