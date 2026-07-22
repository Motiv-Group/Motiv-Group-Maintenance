'use client'

// Filter bar for the admin audit log. Drives the page's URL searchParams
// (range / action / q) so the server component re-queries. Range + action apply
// immediately on change; the free-text box applies on submit/Enter (or the
// Search button). Mobile-first: controls stack full-width at base and lay out in
// a row from `sm:`. Blue focus rings / actions per the app's colour convention.
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, ChevronDown, X } from 'lucide-react'

// Date presets → range keys the page understands. `all` clears the cutoff.
const RANGES: { value: string; label: string }[] = [
  { value: 'week', label: 'Past 7 days' },
  { value: 'month', label: 'Past month' },
  { value: 'quarter', label: 'Past 3 months' },
  { value: 'all', label: 'All time' },
]

// Action-type options — mirror the ACTION_LABELS in app/admin/audit/page.tsx so
// the dropdown lists the same human labels. Kept here so the filter bar is
// self-contained (a client component can't import the page's server-side const).
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'provision.add_region', label: 'Region created' },
  { value: 'provision.invite_rm', label: 'Regional manager invited' },
  { value: 'provision.approve_rm', label: 'Regional manager approved' },
  { value: 'provision.reject_rm', label: 'Regional manager rejected' },
  { value: 'provision.add_store', label: 'Store created' },
  { value: 'provision.invite_store_manager', label: 'Store manager invited' },
  { value: 'provision.create_store_manager', label: 'Store manager created' },
  { value: 'provision.add_supplier', label: 'Supplier added' },
  { value: 'provision.update_store', label: 'Store updated' },
  { value: 'provision.deactivate_store', label: 'Store deactivated' },
  { value: 'provision.reactivate_store', label: 'Store reactivated' },
  { value: 'provision.delete_store', label: 'Store deleted' },
  { value: 'admin.create_executive', label: 'Executive + company created' },
  { value: 'admin.invite_rm', label: 'Regional manager invited (admin)' },
  { value: 'admin.invite_sm', label: 'Store manager invited (admin)' },
  { value: 'admin.bulk_import', label: 'Bulk account import' },
  { value: 'admin.move_store', label: 'Store moved' },
  { value: 'admin.relink_rm', label: 'Regional manager re-linked' },
  { value: 'supplier.approve', label: 'Supplier approved' },
  { value: 'supplier.reject', label: 'Supplier rejected' },
  { value: 'supplier.onboard_invited', label: 'Supplier onboarded (invited)' },
  { value: 'supplier.onboard_self_signup', label: 'Supplier self-signup' },
  { value: 'supplier.assign_rm', label: 'RM assigned to region' },
  { value: 'supplier.unassign_rm', label: 'RM unassigned from region' },
  { value: 'account.self_delete', label: 'Account self-deleted (POPIA)' },
]

export default function AuditFilters({
  range,
  action,
  q,
}: {
  range: string
  action: string
  q: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [text, setText] = useState(q)

  // Build the next URL from the current params with one key overridden.
  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    const qs = next.toString()
    router.push(qs ? `?${qs}` : '?')
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    push('q', text.trim())
  }

  const clearAll = () => {
    setText('')
    router.push('?')
  }

  const anyActive = (range && range !== 'all') || !!action || !!q

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Date preset */}
      <label className="relative flex h-11 w-full items-center gap-1.5 rounded-xl bg-[var(--input-bg)] px-3 text-sm ring-1 ring-[var(--border)] transition focus-within:ring-blue-500/40 sm:h-auto sm:w-auto sm:py-2.5">
        <span className="whitespace-nowrap text-[var(--text-muted)]">Period:</span>
        <select
          value={range || 'all'}
          onChange={e => push('range', e.target.value)}
          className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-4 font-semibold text-[var(--text)] outline-none sm:flex-none"
        >
          {RANGES.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-[var(--text-faint)]" />
      </label>

      {/* Action type */}
      <label className="relative flex h-11 w-full items-center gap-1.5 rounded-xl bg-[var(--input-bg)] px-3 text-sm ring-1 ring-[var(--border)] transition focus-within:ring-blue-500/40 sm:h-auto sm:w-auto sm:py-2.5">
        <span className="whitespace-nowrap text-[var(--text-muted)]">Action:</span>
        <select
          value={action}
          onChange={e => push('action', e.target.value)}
          className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-4 font-semibold text-[var(--text)] outline-none sm:max-w-[220px]"
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-[var(--text-faint)]" />
      </label>

      {/* Free-text search — applies on submit/Enter */}
      <form onSubmit={submitSearch} className="flex w-full items-center gap-2 sm:w-auto sm:flex-1 sm:min-w-[200px]">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Search actor, company, details…"
            className="h-11 w-full rounded-xl bg-[var(--input-bg)] pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-blue-500/40 sm:h-auto sm:py-2.5"
          />
        </div>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 sm:h-auto sm:py-2.5"
        >
          Search
        </button>
      </form>

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] sm:h-auto sm:py-2.5"
        >
          <X size={14} /> Clear
        </button>
      )}
    </div>
  )
}
