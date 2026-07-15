'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  placeholder?: string
  paramName?: string
}

export function SearchInput({ placeholder = 'Search…', paramName = 'q' }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [localValue, setLocalValue] = useState(searchParams.get(paramName) ?? '')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local input to the URL searchParams (external store) whenever the query string changes; deliberate effect-driven sync
    setLocalValue(searchParams.get(paramName) ?? '')
  }, [searchParams, paramName])

  const pushToUrl = useCallback((val: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (val) params.set(paramName, val)
    else     params.delete(paramName)
    router.replace(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams, paramName])

  useEffect(() => {
    const timer = setTimeout(() => pushToUrl(localValue), 350)
    return () => clearTimeout(timer)
  }, [localValue]) // eslint-disable-line react-hooks/exhaustive-deps

  function clear() {
    setLocalValue('')
    pushToUrl('')
  }

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none" />
      <input
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:ring-blue-500/40"
      />
      {localValue && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
