'use client'

// Region/store switcher shown in the desktop sidebar when the user has more than
// one region (RM) / store (SM). Picking one writes a cookie the server reads to
// scope every page, then refreshes. With a single option it renders as a plain
// chip (no dropdown).
import { useState, type ElementType } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown } from 'lucide-react'

interface Option { id: string; label: string }

export function ContextSwitcher({ options, activeId, cookieName, Icon }: {
  options: Option[]
  activeId: string | null
  cookieName: string
  Icon: ElementType
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const active = options.find(o => o.id === activeId) ?? options[0]

  // Single option → static chip, matching the old sidebar context pill.
  if (options.length <= 1) {
    return (
      <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-200">
        <span className="truncate">{active?.label ?? '—'}</span>
        <Icon size={14} className="shrink-0 text-gray-400" />
      </div>
    )
  }

  function pick(id: string) {
    // eslint-disable-next-line react-hooks/immutability -- document.cookie is the DOM cookie API, not a React value mutation
    document.cookie = `${cookieName}=${id}; path=/; max-age=31536000; samesite=lax`
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="relative mt-6">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-200 transition hover:bg-white/[0.08]">
        <span className="flex min-w-0 items-center gap-2"><Icon size={14} className="shrink-0 text-gray-400" /><span className="truncate">{active?.label ?? 'Select'}</span></span>
        <ChevronsUpDown size={14} className="shrink-0 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="listbox" className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-brand-700 p-1 shadow-xl">
            {options.map(o => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === active?.id} onClick={() => pick(o.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-white/[0.08]">
                <span className="truncate">{o.label}</span>
                {o.id === active?.id && <Check size={14} className="shrink-0 text-[#C6A35D]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
