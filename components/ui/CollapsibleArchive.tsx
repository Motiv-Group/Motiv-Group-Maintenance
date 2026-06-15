'use client'

import { useState } from 'react'
import { Archive, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  count: number
  children: React.ReactNode
}

export function CollapsibleArchive({ count, children }: Props) {
  const [open, setOpen] = useState(false)

  if (count === 0) return null

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
          <Archive size={14} />
          Archive
          <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">
            {count}
          </span>
        </span>
        {open
          ? <ChevronUp  size={16} className="text-gray-400" />
          : <ChevronDown size={16} className="text-gray-400" />
        }
      </button>

      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-slate-50 dark:bg-gray-800/50">
          {children}
        </div>
      )}
    </div>
  )
}
