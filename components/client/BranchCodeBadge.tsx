'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Hash, Copy, Check, AlertTriangle } from 'lucide-react'

interface Props {
  branchCode: string | null
}

export function BranchCodeBadge({ branchCode }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!branchCode) return
    navigator.clipboard.writeText(branchCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!branchCode) {
    return (
      <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
        <p className="text-sm text-yellow-700 dark:text-yellow-300 flex-1">
          No branch code set — your regional manager won&apos;t be able to link your store.
        </p>
        <Link href="/settings" className="text-xs font-medium text-yellow-700 dark:text-yellow-300 underline shrink-0">
          Set it now
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30">
        <Hash size={14} className="text-brand-600 dark:text-brand-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 dark:text-gray-500">Branch Code</p>
        <p className="font-mono font-semibold text-gray-900 dark:text-white tracking-wider">{branchCode}</p>
      </div>
      <button
        onClick={handleCopy}
        title="Copy branch code"
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20"
      >
        {copied ? (
          <><Check size={13} className="text-green-500" /> <span className="text-green-500">Copied</span></>
        ) : (
          <><Copy size={13} /> Copy</>
        )}
      </button>
    </div>
  )
}
