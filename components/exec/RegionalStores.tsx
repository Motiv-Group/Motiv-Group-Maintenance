'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Store, Plus, User, Mail, Phone, MapPin, Ticket, MoreVertical, Pencil, Power, RotateCcw, Trash2, X, ChevronDown, ChevronLeft, ChevronRight, Download, Archive, ArrowRight, Eye, EyeOff } from 'lucide-react'
import type { StoreCard } from '@/lib/health/data'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { isValidEmail, isValidPhone, normalisePhone } from '@/lib/csv'
import { Card, Pill, Donut, BreakdownList, STATUS_TEXT, FilterSelect, SearchInput } from '@/components/exec/ui'
import { DrawerHeader } from '@/components/exec/Drawer'
import { Modal } from '@/components/ui/Modal'
import { errMsg } from '@/components/ui/errMsg'

export interface ArchivedStore { id: string; name: string; deactivatedAt: string | null }
type ActionTarget = { id: string; name: string; archived: boolean }

// The 4 engine RAG states collapse to the 3 buckets shown in the table
// (At Risk folds into Attention). Colours/labels mirror the status tabs.
type Bucket = 'critical' | 'attention' | 'healthy'
const bucketOf = (st: string): Bucket => st === 'controlled' ? 'healthy' : st === 'critical' ? 'critical' : 'attention'
const BUCKET_META: Record<Bucket, { label: string; badge: string; bar: string; text: string; tab: string }> = {
  critical:  { label: 'Critical',  badge: 'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/30',              bar: '#ef4444', text: 'text-red-600 dark:text-red-400',    tab: 'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/40' },
  attention: { label: 'Attention', badge: 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b] ring-[#f59e0b]/30',      bar: '#f59e0b', text: 'text-amber-600 dark:text-[#f59e0b]', tab: 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b] ring-[#f59e0b]/40' },
  healthy:   { label: 'Controlled', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30', bar: '#10b981', text: 'text-emerald-600 dark:text-emerald-400', tab: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/40' },
}

// Compact "time since" for the Last Activity column.
function relativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '—'
  const diff = nowMs - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Yesterday'
  if (day < 7) return `${day}d ago`
  if (day < 35) return `${Math.floor(day / 7)}w ago`
  return `${Math.floor(day / 30)}mo ago`
}

const SEL_CLS = 'appearance-none rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40'
/** Styled native <select> with a chevron — used across the Stores toolbar + pager. */
function Select({ value, onChange, ariaLabel, children }: { value: string; onChange: (v: string) => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="relative shrink-0">
      <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className={SEL_CLS}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
    </div>
  )
}

export function RegionalStores({ stores, archived = [], companyName = '' }: { stores: StoreCard[]; archived?: ArchivedStore[]; companyName?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const selected = stores.find(s => s.storeId === selId) ?? null

  // Filters + table view state — all client-side over the already-loaded stores.
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState<'all' | Bucket>('all')
  const [sla, setSla] = useState<'all' | 'overdue' | 'ok'>('all')
  const [openF, setOpenF] = useState<'all' | 'none' | 'low' | 'high'>('all')
  const [sort, setSort] = useState<'attention' | 'health' | 'open' | 'overdue' | 'exposure' | 'name'>('attention')
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)

  // eslint-disable-next-line react-hooks/purity -- cosmetic "last activity" relative-time readout, not hydration-critical
  const nowMs = Date.now()

  const counts = useMemo(() => {
    const c = { all: stores.length, critical: 0, attention: 0, healthy: 0 }
    for (const s of stores) c[bucketOf(s.finalStatus)]++
    return c
  }, [stores])

  // Deep-links: ?status= seeds the bucket tab; ?store= opens a store's panel.
  useEffect(() => {
    const st = searchParams.get('status')
    const map: Record<string, 'all' | Bucket> = { controlled: 'healthy', healthy: 'healthy', attention: 'attention', at_risk: 'attention', critical: 'critical' }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed from the URL query on mount
    if (st && map[st]) setBucket(map[st])
    const id = new URLSearchParams(window.location.search).get('store')
    if (id && stores.some(s => s.storeId === id)) { setSelId(id); setOpen(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Snap back to page 1 whenever a filter/sort/page-size changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keeps pagination in range as the filtered set changes
  useEffect(() => { setPage(1) }, [q, bucket, sla, openF, sort, perPage])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const rows = stores.filter(s => {
      if (bucket !== 'all' && bucketOf(s.finalStatus) !== bucket) return false
      if (sla === 'overdue' && s.overdueTickets === 0) return false
      if (sla === 'ok' && s.overdueTickets > 0) return false
      if (openF === 'none' && s.openTickets !== 0) return false
      if (openF === 'low' && !(s.openTickets >= 1 && s.openTickets <= 3)) return false
      if (openF === 'high' && s.openTickets < 4) return false
      if (term && !`${s.storeName} ${s.branchCode ?? ''} ${s.mainIssue}`.toLowerCase().includes(term)) return false
      return true
    })
    const cmp: Record<string, (a: StoreCard, b: StoreCard) => number> = {
      attention: (a, b) => a.finalHealthScore - b.finalHealthScore,
      health: (a, b) => b.finalHealthScore - a.finalHealthScore,
      open: (a, b) => b.openTickets - a.openTickets,
      overdue: (a, b) => b.overdueTickets - a.overdueTickets,
      exposure: (a, b) => b.costExposure - a.costExposure,
      name: (a, b) => a.storeName.localeCompare(b.storeName),
    }
    return [...rows].sort(cmp[sort])
  }, [stores, q, bucket, sla, openF, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const curPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage)
  const firstShown = filtered.length ? (curPage - 1) * perPage + 1 : 0
  const lastShown = Math.min(curPage * perPage, filtered.length)
  const pageStart = Math.max(1, Math.min(curPage - 2, totalPages - 4))
  const pageNums: number[] = []
  for (let p = pageStart; p <= Math.min(totalPages, pageStart + 4); p++) pageNums.push(p)

  // Export the current (filtered) rows as a client-side CSV — no backend.
  function exportCsv() {
    const head = ['Rank', 'Store', 'Branch', 'Health %', 'Status', 'Open', 'Overdue', 'Approvals', 'Exposure', 'Last Activity', 'Main Driver']
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
    const body = filtered.map((s, i) => [i + 1, s.storeName, s.branchCode ?? '', s.finalHealthScore, BUCKET_META[bucketOf(s.finalStatus)].label, s.openTickets, s.overdueTickets, s.pendingDecisions, s.costExposure, relativeTime(s.lastActivityAt, nowMs), s.mainIssue].map(esc).join(','))
    const csv = [head.map(esc).join(','), ...body].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'stores.csv'; a.click(); URL.revokeObjectURL(url)
  }

  async function act(action: string, storeId: string) {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, storeId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Action failed')
      setActionTarget(null)
      setNotice({ ok: true, text: d.message ?? 'Done.' })
      router.refresh()
    } catch (e) {
      setNotice({ ok: false, text: errMsg(e) })
    } finally { setBusy(false) }
  }
  const kebab = (t: ActionTarget) => (
    <button type="button" onClick={() => setActionTarget(t)} disabled={busy} aria-label={`Actions for ${t.name}`}
      className="p-3 sm:p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition disabled:opacity-50">
      <MoreVertical size={16} />
    </button>
  )

  return (
    <div className="space-y-5">
      {/* Header — title, subtitle, Export + Add Store. Stacks on phones (the two
          buttons claim ~215px of the row). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Stores</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">All {counts.all} store{counts.all === 1 ? '' : 's'} ranked by highest attention first.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><Download size={15} /> Export</button>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"><Plus size={16} /> Add Store</button>
        </div>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm ${notice.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-current/70 hover:text-current"><X size={15} /></button>
        </div>
      )}

      {/* Status bucket tabs — always colour-coded (All blue · Critical red · Attention
          amber · Controlled green); the active tab gets a thicker ring + bold. */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'all', label: 'All', n: counts.all, tint: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', ring: 'ring-blue-500/40' },
          { key: 'critical', label: 'Critical', n: counts.critical, tint: 'bg-red-500/15 text-red-700 dark:text-red-400', ring: 'ring-red-500/40' },
          { key: 'attention', label: 'Attention', n: counts.attention, tint: 'bg-[#f59e0b]/15 text-amber-700 dark:text-[#f59e0b]', ring: 'ring-[#f59e0b]/40' },
          { key: 'healthy', label: 'Controlled', n: counts.healthy, tint: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-500/40' },
        ] as const).map(t => {
          const active = bucket === t.key
          return (
            <button key={t.key} onClick={() => setBucket(t.key)} aria-pressed={active}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${t.tint} ${t.ring} ${active ? 'font-bold ring-2' : 'font-semibold ring-1 opacity-80 hover:opacity-100'}`}>
              {t.label} <span className="rounded-md bg-black/10 px-1.5 py-0.5 text-xs tabular-nums dark:bg-white/10">{t.n}</span>
            </button>
          )
        })}
      </div>

      {/* Table card — toolbar, rows, pagination */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search stores…" />
          {/* Mobile: pills form one swipeable strip; sm:contents restores the
              flex-wrap desktop layout (matches the Tickets tab). */}
          <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:contents">
          <FilterSelect label="Status" value={bucket} onChange={v => setBucket(v as 'all' | Bucket)} options={[{ value: 'all', label: 'All' }, { value: 'critical', label: 'Critical' }, { value: 'attention', label: 'Attention' }, { value: 'healthy', label: 'Controlled' }]} />
          <FilterSelect label="SLA" value={sla} onChange={v => setSla(v as typeof sla)} options={[{ value: 'all', label: 'All' }, { value: 'overdue', label: 'Has overdue' }, { value: 'ok', label: 'No overdue' }]} />
          <FilterSelect label="Open" value={openF} onChange={v => setOpenF(v as typeof openF)} options={[{ value: 'all', label: 'All' }, { value: 'none', label: 'None (0)' }, { value: 'low', label: '1–3' }, { value: 'high', label: '4+' }]} />
          <FilterSelect label="Sort by" value={sort} onChange={v => setSort(v as typeof sort)} options={[{ value: 'attention', label: 'Attention' }, { value: 'health', label: 'Health' }, { value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'exposure', label: 'Exposure' }, { value: 'name', label: 'Name' }]} />
          </div>
        </div>

        {/* Desktop / tablet — full table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[940px] text-sm">
            <thead><tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              <th className="px-3 py-2.5 font-medium">#</th><th className="px-3 font-medium">Store</th><th className="px-3 font-medium">Health</th><th className="px-3 font-medium">Status</th>
              <th className="px-3 text-center font-medium">Open</th><th className="px-3 text-center font-medium">Overdue</th><th className="px-3 text-center font-medium">Approvals</th>
              <th className="px-3 font-medium">Exposure</th><th className="px-3 font-medium">Last Activity</th><th className="px-3 font-medium">Main Driver</th>
            </tr></thead>
            <tbody>
              {pageRows.map((s, i) => {
                const m = BUCKET_META[bucketOf(s.finalStatus)]
                return (
                  <tr key={s.storeId} onClick={() => { setSelId(s.storeId); setOpen(true) }} className="cursor-pointer border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                    <td className="px-3 py-3 text-[var(--text-faint)] tabular-nums">{(curPage - 1) * perPage + i + 1}</td>
                    <td className="px-3">
                      <p className="font-semibold text-[var(--text)]">{s.storeName}</p>
                      {s.branchCode && <p className="mt-0.5 font-mono text-[11px] text-[var(--text-faint)]">{s.branchCode}</p>}
                    </td>
                    <td className="px-3">
                      <div className={`font-bold ${m.text}`}>{s.finalHealthScore}%</div>
                      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, s.finalHealthScore))}%`, background: m.bar }} /></div>
                    </td>
                    <td className="px-3"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${m.badge}`}>{m.label}</span></td>
                    <td className="px-3 text-center text-[var(--text)] tabular-nums">{s.openTickets}</td>
                    <td className={`px-3 text-center tabular-nums ${s.overdueTickets ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--text-faint)]'}`}>{s.overdueTickets}</td>
                    <td className="px-3 text-center text-[var(--text)] tabular-nums">{s.pendingDecisions}</td>
                    <td className="px-3 whitespace-nowrap text-[var(--text)] tabular-nums">{formatCurrency(s.costExposure)}</td>
                    <td className="px-3 whitespace-nowrap text-[var(--text-muted)]">{relativeTime(s.lastActivityAt, nowMs)}</td>
                    <td className="max-w-[180px] truncate px-3 text-xs text-[var(--text-muted)]">{s.mainIssue}</td>
                  </tr>
                )
              })}
              {!pageRows.length && <tr><td colSpan={10} className="py-8 text-center text-[var(--text-faint)]">No stores match.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Phone — stacked cards, tap to open detail (no horizontal scroll) */}
        <ul className="divide-y divide-[var(--border)] md:hidden">
          {pageRows.map((s, i) => {
            const m = BUCKET_META[bucketOf(s.finalStatus)]
            return (
              <li key={s.storeId} className="relative">
                <button onClick={() => { setSelId(s.storeId); setOpen(true) }} className="w-full p-3 pr-12 sm:pr-10 text-left transition hover:bg-[var(--hover)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {/* Mobile-only card (ul is md:hidden) — let the name wrap. */}
                      <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]"><span className="text-[var(--text-faint)]">#{(curPage - 1) * perPage + i + 1}</span> {s.storeName}{s.branchCode && <span className="ml-1.5 font-mono text-[11px] text-[var(--text-faint)]">{s.branchCode}</span>}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">{s.mainIssue}</p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-sm font-bold ${m.text}`}>{s.finalHealthScore}%</span>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${m.badge}`}>{m.label}</span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>Open: <span className="text-[var(--text)]">{s.openTickets}</span></span>
                    <span>Overdue: <span className={s.overdueTickets ? 'text-red-500' : 'text-[var(--text)]'}>{s.overdueTickets}</span></span>
                    <span>Approvals: <span className="text-[var(--text)]">{s.pendingDecisions}</span></span>
                    <span>Exposure: <span className="text-[var(--text)]">{formatCurrency(s.costExposure)}</span></span>
                    <span>Activity: <span className="text-[var(--text)]">{relativeTime(s.lastActivityAt, nowMs)}</span></span>
                  </div>
                </button>
                <div className="absolute right-1 top-1 sm:right-2 sm:top-2">{kebab({ id: s.storeId, name: s.storeName, archived: false })}</div>
              </li>
            )
          })}
          {!pageRows.length && <li className="py-8 text-center text-sm text-[var(--text-faint)]">No stores match.</li>}
        </ul>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Rows per page
            <Select ariaLabel="Rows per page" value={String(perPage)} onChange={v => setPerPage(Number(v))}>
              <option value="10">10</option><option value="25">25</option><option value="50">50</option>
            </Select>
          </div>
          {/* Mobile: wrap allowed, range label hidden, "Next" icon-only — the full
              cluster (~380px) overflows the card at 375px. sm+ unchanged. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="mr-1 hidden text-xs text-[var(--text-faint)] tabular-nums sm:inline">{firstShown}–{lastShown} of {filtered.length}</span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="Previous page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span className="text-xs text-[var(--text-muted)] tabular-nums sm:hidden">{curPage} / {totalPages}</span>
            {pageNums.map(p => (
              <button key={p} onClick={() => setPage(p)} aria-current={p === curPage} className={`hidden sm:inline-flex min-w-8 justify-center rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums transition ${p === curPage ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="Next page" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><span className="hidden sm:inline">Next</span> <ChevronRight size={14} /></button>
          </div>
        </div>
      </Card>

      {/* Archive — deactivated stores, collapsible */}
      {archived.length > 0 && (
        <Card className="p-3">
          <button onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen} className="w-full flex items-center gap-2 -m-1 p-1 rounded-lg hover:bg-[var(--hover)] transition">
            <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            <Archive size={15} className="text-[var(--text-faint)]" />
            <span className="text-sm font-bold text-[var(--text)]">Archive · Deactivated</span>
            <span className="text-[11px] font-medium text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5">{archived.length}</span>
          </button>
          {archiveOpen && (
            <ul className="space-y-2 mt-2">
              {archived.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] break-words sm:truncate">{a.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Deactivated</span>
                      {a.deactivatedAt ? ` · ${formatDateTime(a.deactivatedAt)}` : ''}
                    </p>
                  </div>
                  {kebab({ id: a.id, name: a.name, archived: true })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {open && selected && <Modal onClose={() => setOpen(false)} maxWidth="max-w-2xl">{close => <Detail s={selected} onClose={close} onManage={() => { setOpen(false); setActionTarget({ id: selected.storeId, name: selected.storeName, archived: false }) }} />}</Modal>}

      {actionTarget && (
        <StoreActionsModal
          target={actionTarget}
          busy={busy}
          onClose={() => setActionTarget(null)}
          onEdit={() => { const id = actionTarget.id; setActionTarget(null); setEditId(id) }}
          onDeactivate={() => act('deactivate_store', actionTarget.id)}
          onReactivate={() => act('reactivate_store', actionTarget.id)}
          onDelete={() => act('delete_store', actionTarget.id)}
        />
      )}

      {editId && <EditStoreModal storeId={editId} companyName={companyName} onClose={() => setEditId(null)} onSaved={msg => { setEditId(null); setNotice({ ok: true, text: msg }); router.refresh() }} />}

      {addOpen && <AddStoreModal companyName={companyName} onClose={() => setAddOpen(false)} onSaved={msg => { setAddOpen(false); setNotice({ ok: true, text: msg }); router.refresh() }} />}
    </div>
  )
}

/** Centred pop-up listing the actions for one store. Big store name + close X.
 *  Destructive actions confirm in-app (no native browser dialog). */
function StoreActionsModal({ target, busy, onClose, onEdit, onDeactivate, onReactivate, onDelete }: {
  target: ActionTarget; busy: boolean; onClose: () => void
  onEdit: () => void; onDeactivate: () => void; onReactivate: () => void; onDelete: () => void
}) {
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const item = 'flex items-center gap-2.5 w-full px-3.5 py-3 rounded-xl ring-1 ring-[var(--border)] text-sm font-medium text-left transition disabled:opacity-50'

  const confirmCopy = confirm === 'delete'
    ? { title: `Delete ${target.name}?`, body: 'This permanently removes the store from the database. This cannot be undone.', cta: 'Yes, delete', cls: 'bg-red-600 hover:bg-red-700', run: onDelete }
    : { title: `Deactivate ${target.name}?`, body: 'The store will be hidden from active lists and moved to the archive. You can reactivate it later.', cta: 'Yes, deactivate', cls: 'bg-amber-500 hover:bg-amber-600 text-[#0a0e17]', run: onDeactivate }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm rounded-2xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Manage store</p>
            <h3 className="text-xl font-bold text-[var(--text)] break-words">{target.name}</h3>
            {target.archived && <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Deactivated</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>

        {confirm ? (
          <div className="space-y-3">
            <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">{confirmCopy.title}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{confirmCopy.body}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={confirmCopy.run} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-50 ${confirmCopy.cls}`}>{busy ? 'Working…' : confirmCopy.cta}</button>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-xl ring-1 ring-[var(--border)] text-[var(--text-muted)] text-sm font-medium">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" disabled={busy} onClick={onEdit} className={`${item} text-[var(--text)] hover:bg-[var(--hover)]`}><Pencil size={15} className="text-[var(--text-faint)]" /> Edit store</button>
            {target.archived
              ? <button type="button" disabled={busy} onClick={onReactivate} className={`${item} text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10`}><RotateCcw size={15} /> Reactivate store</button>
              : <button type="button" disabled={busy} onClick={() => setConfirm('deactivate')} className={`${item} text-amber-600 dark:text-amber-400 hover:bg-amber-500/10`}><Power size={15} /> Deactivate store</button>}
            <button type="button" disabled={busy} onClick={() => setConfirm('delete')} className={`${item} text-red-600 dark:text-red-400 hover:bg-red-500/10`}><Trash2 size={15} /> Delete store</button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Edit the full store + store-manager record — the same fields the SM sees
 *  greyed-out in their Settings (they can't self-edit these). Changing the email
 *  re-issues login credentials (username + new password) by email. Uses the shared
 *  Modal for consistency with the store-detail and actions pop-ups. */
function EditStoreModal({ storeId, companyName = '', onClose, onSaved }: { storeId: string; companyName?: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [hasSm, setHasSm] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  const setUpper = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value.toUpperCase() }))

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'store_detail', storeId }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? 'Could not load store')
        if (!live) return
        setVals({
          store_name: d.store?.name ?? '',
          branch_code: d.store?.branchCode ?? '',
          sub_store: d.store?.subStore ?? '',
          address: d.store?.address ?? '',
          full_name: d.sm?.fullName ?? '',
          email: d.sm?.email ?? '',
          phone: d.sm?.phone ?? '',
          // Company applies to all the RM's stores — default to the RM's company.
          company_name: d.sm?.companyName || companyName || '',
        })
        setHasSm(!!d.sm)
      } catch (e) { if (live) setErr(errMsg(e)) } finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [storeId, companyName])

  // Validate, then show an in-app confirm step (no native browser dialog).
  function review(e: React.FormEvent) {
    e.preventDefault()
    if (!vals.store_name?.trim()) { setErr('Store name is required.'); return }
    if (!vals.branch_code?.trim()) { setErr('Branch code is required.'); return }
    if (hasSm) {
      if (vals.email?.trim() && !isValidEmail(vals.email)) { setErr('Please enter a valid email address.'); return }
      if (vals.phone?.trim() && !isValidPhone(vals.phone)) { setErr('Please enter a valid phone number.'); return }
    }
    setErr(''); setConfirming(true)
  }

  async function doSave() {
    setBusy(true); setErr('')
    try {
      const body = {
        action: 'update_store', storeId,
        store_name: vals.store_name, branch_code: vals.branch_code, sub_store: vals.sub_store, address: vals.address ?? '',
        ...(hasSm ? { full_name: vals.full_name, email: vals.email, phone: vals.phone, company_name: vals.company_name ?? '' } : {}),
      }
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Update failed')
      onSaved(d.message ?? 'Store updated.')
    } catch (e) { setErr(errMsg(e)); setBusy(false); setConfirming(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      {close => (
        <>
          <DrawerHeader onClose={close} title={<div className="flex items-center gap-2"><Pencil size={17} className="text-blue-600 dark:text-blue-400 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">Edit store</h3></div>} />
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--text-faint)]">Loading…</p>
          ) : (
            <form onSubmit={review} className="space-y-4">
              {/* Store details */}
              <FormSection title="Store details">
                <Field label="Company name"><input className={FIELD_INPUT} value={vals.company_name ?? ''} onChange={set('company_name')} placeholder="Acme Corporation" /></Field>
                <Field label="Store / branch name"><input className={FIELD_INPUT} value={vals.store_name ?? ''} onChange={set('store_name')} required /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Branch code"><input className={`${FIELD_INPUT} font-mono uppercase`} value={vals.branch_code ?? ''} onChange={setUpper('branch_code')} placeholder="e.g. CPT001" required /></Field>
                  <Field label="Branch / sub-store"><input className={FIELD_INPUT} value={vals.sub_store ?? ''} onChange={set('sub_store')} placeholder="e.g. Cape Town Branch" /></Field>
                </div>
                <Field label="Address"><input className={FIELD_INPUT} value={vals.address ?? ''} onChange={set('address')} placeholder="123 Main St, Cape Town" /></Field>
              </FormSection>

              {/* Store manager — the SM's greyed-out Settings fields */}
              {hasSm ? (
                <FormSection title="Store manager">
                  <Field label="Full name"><input className={FIELD_INPUT} value={vals.full_name ?? ''} onChange={set('full_name')} placeholder="e.g. Thabo Mokoena" /></Field>
                  <Field label="Phone"><input className={FIELD_INPUT} type="tel" value={vals.phone ?? ''} onChange={set('phone')} placeholder="e.g. 0761936165" /></Field>
                  <Field label="Login email"><input className={FIELD_INPUT} type="email" value={vals.email ?? ''} onChange={set('email')} placeholder="manager@store.co.za" /></Field>
                  <p className="text-[11px] text-[var(--text-faint)]">Changing the email re-issues login details (username + new password) to the new address.</p>
                </FormSection>
              ) : (
                <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-[11px] text-[var(--text-faint)]">No store manager linked yet — only the store details can be edited.</p>
              )}

              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</p>}

              {confirming ? (
                <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
                  <p className="text-sm text-[var(--text)]">Save these changes to <span className="font-semibold">{vals.store_name}</span>?</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={doSave} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">{busy ? 'Saving…' : 'Yes, save'}</button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60">Save changes</button>
              )}
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

/** Add a store + its store-manager login in one pop-up. Posts `create_store_manager`
 *  (creates the store, the auth user, links them, emails the credentials). */
function AddStoreModal({ companyName = '', onClose, onSaved }: { companyName?: string; onClose: () => void; onSaved: (msg: string) => void }) {
  // Company applies to all the RM's stores — pre-fill with the RM's own company.
  const [vals, setVals] = useState<Record<string, string>>({ company_name: companyName })
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }))
  const setUpper = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value.toUpperCase() }))
  const formatPhone = () => { const n = normalisePhone(vals.phone); if (n) setVals(v => ({ ...v, phone: n })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(vals.email)) { setErr('Please enter a valid email address.'); return }
    if (!isValidPhone(vals.phone)) { setErr('Please enter a valid phone number.'); return }
    if ((vals.password ?? '').length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_store_manager', ...vals }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed to create account')
      onSaved(d.message ?? 'Store manager account created.')
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      {close => (
        <>
          <DrawerHeader onClose={close} title={<div className="flex items-center gap-2"><Plus size={17} className="text-emerald-500 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">Add store</h3></div>} />
          <p className="-mt-2 text-sm text-[var(--text-muted)]">Create a store and its store-manager login. The login details are emailed to the manager.</p>
          <form onSubmit={submit} className="space-y-4">
            {/* Store details */}
            <FormSection title="Store details">
              <Field label="Company name"><input className={FIELD_INPUT} value={vals.company_name ?? ''} onChange={set('company_name')} placeholder="Acme Corporation" /></Field>
              <Field label="Store / branch name"><input className={FIELD_INPUT} value={vals.store_name ?? ''} onChange={set('store_name')} placeholder="e.g. Canal Walk" required /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Branch code"><input className={`${FIELD_INPUT} font-mono uppercase`} value={vals.branch_code ?? ''} onChange={setUpper('branch_code')} placeholder="e.g. CPT001" required /></Field>
                <Field label="Branch / sub-store"><input className={FIELD_INPUT} value={vals.sub_store ?? ''} onChange={set('sub_store')} placeholder="e.g. Cape Town Branch" /></Field>
              </div>
              <Field label="Address"><input className={FIELD_INPUT} value={vals.address ?? ''} onChange={set('address')} placeholder="123 Main St, Cape Town" /></Field>
            </FormSection>

            {/* Store manager */}
            <FormSection title="Store manager">
              <Field label="Full name"><input className={FIELD_INPUT} value={vals.full_name ?? ''} onChange={set('full_name')} placeholder="e.g. Thabo Mokoena" required /></Field>
              <Field label="Phone"><input className={FIELD_INPUT} type="tel" value={vals.phone ?? ''} onChange={set('phone')} onBlur={formatPhone} placeholder="e.g. 0761936165" required /></Field>
              <Field label="Login email"><input className={FIELD_INPUT} type="email" value={vals.email ?? ''} onChange={set('email')} placeholder="manager@store.co.za" required /></Field>
              <Field label="Temporary password (min 8)">
                <div className="relative">
                  <input className={`${FIELD_INPUT} pr-11`} type={showPw ? 'text' : 'password'} value={vals.password ?? ''} onChange={set('password')} placeholder="At least 8 characters" minLength={8} required />
                  <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </FormSection>

            {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{err}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              <Plus size={16} /> {busy ? 'Creating…' : 'Create store'}
            </button>
          </form>
        </>
      )}
    </Modal>
  )
}

const FIELD_INPUT = 'w-full rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl bg-[var(--surface-2)] p-3.5 ring-1 ring-[var(--border)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs text-[var(--text-muted)]">{label}</label>{children}</div>
}

/** One contact line: clickable (mail/tel/maps) when a value exists, else hidden. */
function ContactRow({ icon: Icon, label, value, href, external }: { icon: React.ElementType; label: string; value: string | null | undefined; href: string | null; external?: boolean }) {
  if (!value) return null
  const inner = (
    <>
      <Icon size={16} className="mt-0.5 shrink-0 text-[var(--text-faint)] group-hover:text-blue-600 dark:group-hover:text-blue-400" />
      <span className="min-w-0"><span className="block text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span><span className="block break-words text-sm font-medium text-[var(--text)] group-hover:text-blue-600 dark:group-hover:text-blue-400">{value}</span></span>
    </>
  )
  return href
    ? <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-[var(--hover)]">{inner}</a>
    : <div className="flex items-start gap-2.5 px-0 py-1.5">{inner}</div>
}

function Detail({ s, onClose, onManage }: { s: StoreCard; onClose?: () => void; onManage?: () => void }) {
  const recommended = s.finalStatus === 'controlled' ? 'Store controlled — keep it up.' : `Resolve: ${s.mainIssue}.`
  // Prefer the store's street address; fall back to its region so a location always shows.
  const loc = s.location || (s.regionName && s.regionName !== '—' ? s.regionName : null)
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><Store size={18} className="text-blue-600 dark:text-blue-400 shrink-0" /><h3 className="text-lg font-bold text-[var(--text)]">{s.storeName}</h3>{s.branchCode && <span className="font-mono text-xs text-[var(--text-faint)]">{s.branchCode}</span>}<Pill status={s.finalStatus} /></div>}>
        {onManage && <button type="button" onClick={onManage} aria-label="Manage store" title="Manage store" className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition"><MoreVertical size={16} /></button>}
      </DrawerHeader>

      {/* Health hero — donut + score + top-line */}
      <div className="flex items-center gap-4 rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
        <Donut value={s.finalHealthScore} status={s.finalStatus} size={92} label="Health" />
        <div className="min-w-0">
          <div className={`text-2xl font-bold leading-none ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">Open {s.openTickets} · Overdue {s.overdueTickets} · Pending {s.pendingDecisions}</p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">{s.regionName}</p>
        </div>
      </div>

      {/* Store manager — full contact, all clickable */}
      <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><User size={13} /> Store Manager</div>
        {s.sm?.name || s.sm?.email || s.sm?.phone || loc ? (
          <div className="space-y-0.5">
            {s.sm?.name && <p className="mb-1 text-base font-bold text-[var(--text)]">{s.sm.name}</p>}
            <ContactRow icon={Mail} label="Email" value={s.sm?.email} href={s.sm?.email ? `mailto:${s.sm.email}` : null} />
            <ContactRow icon={Phone} label="Phone" value={s.sm?.phone} href={s.sm?.phone ? `tel:${s.sm.phone}` : null} />
            <ContactRow icon={MapPin} label="Location" value={loc} href={loc ? `https://maps.google.com/?q=${encodeURIComponent(loc)}` : null} external />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-faint)]">No store manager on record.</p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Open', value: String(s.openTickets) },
          { label: 'Overdue', value: String(s.overdueTickets) },
          { label: 'Approvals', value: String(s.pendingDecisions) },
          { label: 'Exposure', value: formatCurrency(s.costExposure) },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
            <div className="text-lg font-bold text-[var(--text)]">{c.value}</div>
            <div className="text-[11px] text-[var(--text-faint)]">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Health breakdown */}
      <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Health breakdown</div>
        <BreakdownList rows={[
          { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 }, { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
          { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 }, { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
          { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 }, { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
        ]} />
      </div>

      {/* Recommended action */}
      <div className="rounded-xl bg-blue-500/5 ring-1 ring-blue-500/20 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Recommended action</div>
        <p className="mt-1 text-sm text-[var(--text)]">{recommended}</p>
      </div>

      <Link href={`/regional/tickets?store=${encodeURIComponent(s.storeName)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500">
        <Ticket size={16} /> View store tickets <ArrowRight size={15} />
      </Link>
    </div>
  )
}
