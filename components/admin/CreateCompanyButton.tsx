'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CreateCompanyModal } from './CreateCompanyModal'

// Opens the Create-company pop-up. Blue = action (UI convention).
export function CreateCompanyButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-2.5 text-sm font-semibold text-white transition">
        <Plus size={16} /> Create company
      </button>
      {open && <CreateCompanyModal onClose={() => setOpen(false)} />}
    </>
  )
}
