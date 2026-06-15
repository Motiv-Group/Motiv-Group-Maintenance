'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <div className="no-print sticky top-2 z-10 flex justify-end mb-4">
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow"
      >
        <Printer size={16} /> Save as PDF / Print
      </button>
    </div>
  )
}
