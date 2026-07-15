'use client'

// RM Suppliers tab — a performance directory: KPI summary cards, a filterable /
// paginated data table (SLA, open/overdue, first-fix, escalations, exposure), and
// a red "Invite" action that emails a supplier an onboarding link + a personal
// message. Tapping a row opens a slide-out pane (contact, stats, score breakdown,
// ratings) — mirrors the Stores tab.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Truck, User, Mail, Phone, MapPin, Wrench, ChevronDown, ChevronLeft, ChevronRight,
  Users, Briefcase, Clock, ShieldCheck, DollarSign, Search, MoreVertical, X, Send, Info,
} from 'lucide-react'
import type { HealthStatus } from '@/lib/health/types'
import type { RegionalDashboardData } from '@/lib/health/data'
import { Card } from '@/components/exec/ui'
import { Stars } from '@/components/ui/Stars'
import { MapLink } from '@/components/ui/MapLink'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { formatCurrency, formatDate } from '@/lib/utils'
import { isValidEmail } from '@/lib/csv'

type Row = RegionalDashboardData['suppliers'][number]
const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'
const pct = (n: number) => `${Math.round(n * 100)}%`

// The 4 engine RAG bands collapse to the 3 buckets the table shows (Attention +
// At Risk both read "At risk"). Colours mirror the status pills used elsewhere.
type Bucket = 'healthy' | 'at_risk' | 'critical'
const bucketOf = (b: HealthStatus): Bucket => b === 'controlled' ? 'healthy' : b === 'critical' ? 'critical' : 'at_risk'
const STATUS_META: Record<Bucket, { label: string; pill: string; text: string }> = {
  healthy:  { label: 'Healthy',  pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  at_risk:  { label: 'At risk',  pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30',        text: 'text-amber-600 dark:text-amber-400' },
  critical: { label: 'Critical', pill: 'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/30',                text: 'text-red-600 dark:text-red-400' },
}

interface Detail {
  supplier: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; trade: string | null }
  jobsCompleted: number
  rating: { avg: number | null; count: number }
  comments: { score: number; comment: string | null; createdAt: string }[]
}

const SEL_CLS = 'appearance-none rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40'
function Select({ value, onChange, ariaLabel, children }: { value: string; onChange: (v: string) => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="relative shrink-0">
      <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className={SEL_CLS}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
    </div>
  )
}

// Up-to-3-letter monogram from the supplier name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 3).map(p => p[0]!.toUpperCase()).join('')
}

export function RegionalSuppliersTable({ suppliers }: { suppliers: Row[] }) {
  const [sel, setSel] = useState<Row | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Filters + pagination — all client-side over the already-loaded suppliers.
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Bucket>('all')
  const [cat, setCat] = useState('all')
  const [perfF, setPerfF] = useState<'all' | 'high' | 'mid' | 'low'>('all')
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)

  // Deep-link ?supplier=<id> opens that supplier's pane on mount.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('supplier')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link sync from the URL on mount
    if (id) { const match = suppliers.find(s => s.id === id); if (match) setSel(match) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep pagination in range as filters change
  useEffect(() => { setPage(1) }, [q, status, cat, perfF, perPage])

  // KPI roll-ups across the loaded suppliers.
  const kpis = useMemo(() => {
    const total = suppliers.length
    const open = suppliers.reduce((s, x) => s + x.open, 0)
    const overdue = suppliers.reduce((s, x) => s + x.overdue, 0)
    const exposure = suppliers.reduce((s, x) => s + x.costExposure, 0)
    const avgSla = total ? Math.round(suppliers.reduce((s, x) => s + x.perf.performanceScore, 0) / total) : 0
    return { total, open, overdue, exposure, avgSla }
  }, [suppliers])

  // Distinct trades → Category filter options.
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const s of suppliers) for (const c of (s.category ?? '').split(',').map(x => x.trim()).filter(Boolean)) set.add(c)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [suppliers])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return suppliers.filter(s => {
      if (status !== 'all' && bucketOf(s.perf.band) !== status) return false
      if (cat !== 'all' && !(s.category ?? '').toLowerCase().split(',').map(x => x.trim()).includes(cat.toLowerCase())) return false
      const score = s.perf.performanceScore
      if (perfF === 'high' && score < 90) return false
      if (perfF === 'mid' && !(score >= 70 && score < 90)) return false
      if (perfF === 'low' && score >= 70) return false
      if (term && !`${s.name} ${s.category ?? ''} ${s.contactName ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [suppliers, q, status, cat, perfF])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const curPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage)
  const firstShown = filtered.length ? (curPage - 1) * perPage + 1 : 0
  const lastShown = Math.min(curPage * perPage, filtered.length)
  const pageStart = Math.max(1, Math.min(curPage - 2, totalPages - 4))
  const pageNums: number[] = []
  for (let p = pageStart; p <= Math.min(totalPages, pageStart + 4); p++) pageNums.push(p)

  const activeFilters = [status !== 'all', cat !== 'all', perfF !== 'all'].filter(Boolean).length

  return (
    <div className="space-y-5">
      {/* Header — title + red Invite button */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><Truck className="text-blue-600 dark:text-blue-400" size={22} /> Suppliers</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">All suppliers in your company. Tap a supplier to view full details and performance.</p>
        </div>
        <button onClick={() => setInviteOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
          <Send size={15} /> Invite
        </button>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SupKpi icon={<Users size={18} />} wrap="bg-blue-500/15 text-blue-600 dark:text-blue-400" value={kpis.total} label="Total suppliers" hint="In your company" />
        <SupKpi icon={<Briefcase size={18} />} wrap="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" value={kpis.open} label="Open jobs" hint="Across all suppliers" />
        <SupKpi icon={<Clock size={18} />} wrap="bg-amber-500/15 text-amber-600 dark:text-amber-400" value={kpis.overdue} label="Overdue jobs" hint="Require attention" tone={kpis.overdue ? 'text-amber-600 dark:text-amber-400' : undefined} />
        <SupKpi icon={<ShieldCheck size={18} />} wrap="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" value={`${kpis.avgSla}%`} label="Avg SLA compliance" hint="Target: 90%" />
        <SupKpi icon={<DollarSign size={18} />} wrap="bg-red-500/15 text-red-600 dark:text-red-400" value={fmtK(kpis.exposure)} label="Total exposure" hint="Across all suppliers" />
      </div>

      {/* Table card — toolbar, rows, pagination */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
          <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search suppliers…"
              className="w-full rounded-xl bg-[var(--input-bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          {/* Mobile: selects form one swipeable strip; sm:contents restores the
              flex-wrap desktop layout. */}
          <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:contents">
          <Select ariaLabel="Filter by status" value={status} onChange={v => setStatus(v as 'all' | Bucket)}>
            <option value="all">Status: All</option><option value="healthy">Healthy</option><option value="at_risk">At risk</option><option value="critical">Critical</option>
          </Select>
          <Select ariaLabel="Filter by category" value={cat} onChange={setCat}>
            <option value="all">Category: All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select ariaLabel="Filter by performance" value={perfF} onChange={v => setPerfF(v as typeof perfF)}>
            <option value="all">Performance: All</option><option value="high">90%+</option><option value="mid">70–89%</option><option value="low">Below 70%</option>
          </Select>
          {activeFilters > 0 && (
            <button onClick={() => { setStatus('all'); setCat('all'); setPerfF('all') }} className="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
              <X size={13} /> Clear <span className="rounded-md bg-blue-500/15 px-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">{activeFilters}</span>
            </button>
          )}
          </div>
        </div>

        {/* Desktop / tablet — full table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              <th className="px-3 py-2.5 font-medium">Supplier</th><th className="px-3 font-medium">Category</th><th className="px-3 font-medium">Status</th>
              <th className="px-3 font-medium">SLA</th><th className="px-3 text-center font-medium">Open</th><th className="px-3 text-center font-medium">Overdue</th>
              <th className="px-3 text-center font-medium">First-fix</th><th className="px-3 text-center font-medium">Repeat</th><th className="px-3 text-center font-medium">Escalations</th>
              <th className="px-3 font-medium">Exposure</th><th className="px-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {pageRows.map(s => {
                const m = STATUS_META[bucketOf(s.perf.band)]
                return (
                  <tr key={s.id} onClick={() => setSel(s)} className="cursor-pointer border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600/15 text-[11px] font-bold text-blue-700 dark:text-blue-300">{initials(s.name)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text)]">{s.name}</p>
                          {(s.contactName || s.phone) && <p className="truncate text-xs text-[var(--text-muted)]">{[s.contactName, s.phone].filter(Boolean).join(' • ')}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[150px] truncate px-3 text-[var(--text-muted)]">{s.category ?? '—'}</td>
                    <td className="px-3"><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${m.pill}`}>{m.label}</span></td>
                    <td className={`px-3 font-semibold tabular-nums ${m.text}`}>{s.perf.performanceScore}%</td>
                    <td className="px-3 text-center text-[var(--text)] tabular-nums">{s.open}</td>
                    <td className={`px-3 text-center tabular-nums ${s.overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--text-faint)]'}`}>{s.overdue}</td>
                    <td className="px-3 text-center text-[var(--text-muted)] tabular-nums">{pct(s.perf.firstTimeFixRate)}</td>
                    <td className="px-3 text-center text-[var(--text-muted)] tabular-nums">{s.perf.repeatDefectInvolvement}</td>
                    <td className={`px-3 text-center tabular-nums ${s.perf.escalationCount ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--text-faint)]'}`}>{s.perf.escalationCount}</td>
                    <td className="whitespace-nowrap px-3 text-[var(--text)] tabular-nums">{fmtK(s.costExposure)}</td>
                    <td className="px-3 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSel(s)} aria-label={`View ${s.name}`} className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><MoreVertical size={16} /></button>
                    </td>
                  </tr>
                )
              })}
              {!pageRows.length && <tr><td colSpan={11} className="py-8 text-center text-[var(--text-faint)]">{suppliers.length ? 'No suppliers match your filters.' : 'No suppliers yet — invite one to get started.'}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Phone — stacked cards */}
        <ul className="divide-y divide-[var(--border)] md:hidden">
          {pageRows.map(s => {
            const m = STATUS_META[bucketOf(s.perf.band)]
            return (
              <li key={s.id}>
                <button onClick={() => setSel(s)} className="w-full p-3 text-left transition hover:bg-[var(--hover)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600/15 text-[11px] font-bold text-blue-700 dark:text-blue-300">{initials(s.name)}</span>
                      <div className="min-w-0">
                        {/* Mobile-only card (ul is md:hidden) — let the name wrap. */}
                        <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]">{s.name}</p>
                        {s.category && <p className="truncate text-[11px] text-[var(--text-muted)]">{s.category}</p>}
                      </div>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`text-sm font-semibold ${m.text}`}>{s.perf.performanceScore}%</span>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${m.pill}`}>{m.label}</span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>Open: <span className="text-[var(--text)]">{s.open}</span></span>
                    <span>Overdue: <span className={s.overdue ? 'text-red-500' : 'text-[var(--text)]'}>{s.overdue}</span></span>
                    <span>First-fix: <span className="text-[var(--text)]">{pct(s.perf.firstTimeFixRate)}</span></span>
                    <span>Exposure: <span className="text-[var(--text)]">{fmtK(s.costExposure)}</span></span>
                  </div>
                </button>
              </li>
            )
          })}
          {!pageRows.length && <li className="py-8 text-center text-sm text-[var(--text-faint)]">{suppliers.length ? 'No suppliers match your filters.' : 'No suppliers yet — invite one to get started.'}</li>}
        </ul>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Rows per page
            <Select ariaLabel="Rows per page" value={String(perPage)} onChange={v => setPerPage(Number(v))}>
              <option value="10">10</option><option value="25">25</option><option value="50">50</option>
            </Select>
          </div>
          {/* Mobile: wrap allowed + range label hidden so the cluster fits 375px. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="mr-1 hidden text-xs text-[var(--text-faint)] tabular-nums sm:inline">{firstShown}–{lastShown} of {filtered.length}</span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="Previous page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span className="text-xs text-[var(--text-muted)] tabular-nums sm:hidden">{curPage} / {totalPages}</span>
            {pageNums.map(p => (
              <button key={p} onClick={() => setPage(p)} aria-current={p === curPage} className={`hidden sm:inline-flex min-w-8 justify-center rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums transition ${p === curPage ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="Next page" className="rounded-lg p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      </Card>

      {/* Methodology footer */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400"><Info size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--text-muted)]">Supplier status is calculated daily based on SLA compliance, overdue jobs, first-fix rate, and escalations.</p>
            <button onClick={() => setShowHelp(o => !o)} aria-expanded={showHelp} className="mt-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
              {showHelp ? 'Hide details' : 'Learn more about supplier performance'}
            </button>
            {showHelp && (
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                <li>Every supplier starts at <span className="font-semibold text-[var(--text)]">100%</span>; each factor deducts up to its weight.</li>
                <li><span className="font-medium text-[var(--text)]">SLA breaches</span> −40 · <span className="font-medium text-[var(--text)]">First-time fix</span> −20 · <span className="font-medium text-[var(--text)]">Evidence complete</span> −15 · <span className="font-medium text-[var(--text)]">Repeat defects</span> −15 · <span className="font-medium text-[var(--text)]">Escalations</span> −10.</li>
                <li><span className="font-semibold text-emerald-600 dark:text-emerald-400">Healthy</span> ≥ 80% · <span className="font-semibold text-amber-600 dark:text-amber-400">At risk</span> 50–79% · <span className="font-semibold text-red-600 dark:text-red-400">Critical</span> below 50%.</li>
              </ul>
            )}
          </div>
        </div>
      </Card>

      {sel && <SupplierPane row={sel} onClose={() => setSel(null)} />}
      {inviteOpen && <InviteSupplierModal onClose={() => setInviteOpen(false)} />}
    </div>
  )
}

function SupKpi({ icon, wrap, value, label, hint, tone }: { icon: React.ReactNode; wrap: string; value: React.ReactNode; label: string; hint?: string; tone?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)] sm:gap-3 sm:p-4">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${wrap}`}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-xl font-bold leading-tight sm:text-2xl ${tone ?? 'text-[var(--text)]'}`}>{value}</div>
        <div className="line-clamp-2 text-xs font-medium text-[var(--text-muted)] sm:line-clamp-none sm:truncate">{label}</div>
        {hint && <div className="mt-0.5 hidden truncate text-[11px] text-[var(--text-faint)] sm:block">{hint}</div>}
      </div>
    </div>
  )
}

/** Invite a supplier by email + optional personal message. Posts `invite_supplier`
 *  (creates the supplier row + invite token, emails the branded onboarding link). */
function InviteSupplierModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) { setResult({ ok: false, text: 'Please enter a valid email address.' }); return }
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite_supplier', email, companyName: company, message }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed to send invite')
      setResult({ ok: true, text: d.message ?? 'Invite sent.', link: d.actionLink })
      router.refresh()
    } catch (e: any) { setResult({ ok: false, text: e.message }); setBusy(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      {close => (
        <>
          <DrawerHeader onClose={close} title={<div className="flex items-center gap-2"><Send size={17} className="shrink-0 text-blue-600 dark:text-blue-400" /><h3 className="text-lg font-bold text-[var(--text)]">Invite a supplier</h3></div>} />
          {result?.ok ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">{result.text}</div>
              {result.link && (
                <div className="rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
                  <p className="mb-1 text-xs text-[var(--text-muted)]">Email isn&apos;t configured — copy this onboarding link and send it yourself:</p>
                  <a href={result.link} className="block break-all text-xs font-medium text-blue-600 underline dark:text-blue-400">{result.link}</a>
                </div>
              )}
              <button onClick={close} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">Done</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="-mt-2 text-sm text-[var(--text-muted)]">Send an email invite with a link to set up their Motiv account. They confirm their company details when they sign up.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Supplier email <span className="text-red-500">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="supplier@company.co.za" className={FIELD} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Company name <span className="text-[var(--text-faint)]">(optional)</span></label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. FlowFix Plumbing" className={FIELD} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Message <span className="text-[var(--text-faint)]">(optional)</span></label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="Add a short note — it's included in the invite email." className={`${FIELD} resize-none`} />
              </div>
              {result && !result.ok && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{result.text}</p>}
              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
                <Send size={16} /> {busy ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

const FIELD = 'w-full rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] placeholder-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40'

function SupplierPane({ row, onClose }: { row: Row; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showComments, setShowComments] = useState(false)

  useEffect(() => {
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets loading before re-fetching when row.id changes
    setLoading(true)
    fetch(`/api/regional/suppliers/${row.id}`)
      .then(r => r.json())
      .then(d => { if (live) setDetail(d) })
      .catch(() => { if (live) setDetail(null) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [row.id])

  const c = detail?.supplier
  const m = STATUS_META[bucketOf(row.perf.band)]
  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  )

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <>
        <DrawerHeader onClose={close} title={
          <div className="flex items-center gap-2 flex-wrap">
            <Truck size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-lg font-bold text-[var(--text)]">{row.name}</h3>
            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${m.pill}`}>{m.label}</span>
          </div>
        } />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 -mt-1">
          <span className={`text-sm font-semibold ${m.text}`}>{row.perf.performanceScore}% SLA</span>
          <span className="text-[var(--text-faint)]">·</span>
          <Stars value={row.avgRating} count={row.ratingCount} size={14} />
        </div>

        {/* Contact */}
        <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Contact</div>
          {loading ? <p className="text-sm text-[var(--text-faint)]">Loading…</p> : (
            <div className="space-y-1.5">
              {c?.contactName && <div className="flex items-center gap-2 text-sm text-[var(--text)]"><User size={14} className="text-[var(--text-faint)] shrink-0" />{c.contactName}</div>}
              {(c?.trade || row.category) && <div className="flex items-center gap-2 text-sm text-[var(--text)]"><Wrench size={14} className="text-[var(--text-faint)] shrink-0" />{c?.trade || row.category}</div>}
              {c?.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-blue-600 dark:hover:text-blue-400"><Mail size={14} className="text-[var(--text-faint)] shrink-0" /><span className="truncate">{c.email}</span></a>}
              {c?.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-blue-600 dark:hover:text-blue-400"><Phone size={14} className="text-[var(--text-faint)] shrink-0" />{c.phone}</a>}
              {c?.address && <div className="flex items-start gap-2 text-sm text-[var(--text)]"><MapPin size={14} className="text-[var(--text-faint)] shrink-0 mt-0.5" /><MapLink address={c.address} className="hover:text-blue-600 dark:hover:text-blue-400">{c.address}</MapLink></div>}
              {!c?.contactName && !c?.email && !c?.phone && !c?.address && <p className="text-sm text-[var(--text-faint)]">No contact details on file yet — they&apos;ll be captured when the supplier completes onboarding.</p>}
            </div>
          )}
        </div>

        {/* Performance stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Jobs completed" value={loading ? '…' : (detail?.jobsCompleted ?? 0)} />
          <Stat label="SLA performance" value={`${row.perf.performanceScore}%`} tone={m.text} />
          <Stat label="Open" value={row.open} />
          <Stat label="Overdue" value={row.overdue} tone={row.overdue ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'} />
          <Stat label="First-time fix" value={pct(row.perf.firstTimeFixRate)} />
          <Stat label="Repeat defects" value={row.perf.repeatDefectInvolvement} />
          <Stat label="Escalations" value={row.perf.escalationCount} />
          <Stat label="Cost exposure" value={fmtK(row.costExposure)} />
        </div>

        {/* Why this score */}
        {(() => {
          const p = row.perf
          const n = p.assignedTickets || 0
          const factors = [
            { label: 'SLA breaches', stat: n ? `${p.slaBreaches} of ${n} jobs` : 'no jobs yet', pts: n ? (p.slaBreaches / n) * 40 : 0, max: 40 },
            { label: 'First-time fix', stat: pct(p.firstTimeFixRate), pts: (1 - p.firstTimeFixRate) * 20, max: 20 },
            { label: 'Evidence complete', stat: pct(p.evidenceCompletionRate), pts: (1 - p.evidenceCompletionRate) * 15, max: 15 },
            { label: 'Repeat defects', stat: n ? `${p.repeatDefectInvolvement} of ${n} jobs` : '0', pts: n ? (p.repeatDefectInvolvement / n) * 15 : 0, max: 15 },
            { label: 'Escalations', stat: `${p.escalationCount} urgent breach${p.escalationCount === 1 ? '' : 'es'}`, pts: Math.min(10, p.escalationCount * 2), max: 10 },
          ].map(f => ({ ...f, pts: Math.round(f.pts) }))
          return (
            <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Why this score</div>
                <span className={`text-sm font-semibold ${m.text}`}>{p.performanceScore}%</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Starts at 100%; each factor deducts points up to its weight.</p>
              <div className="space-y-1.5">
                {factors.map(f => (
                  <div key={f.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--text-muted)] min-w-0 break-words sm:truncate">{f.label} <span className="text-[var(--text-faint)]">· {f.stat}</span></span>
                    <span className={`shrink-0 font-medium tabular-nums ${f.pts ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{f.pts ? `−${f.pts}` : '0'}<span className="text-[var(--text-faint)] font-normal"> / {f.max}</span></span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]"><span className="font-semibold text-[var(--text)]">Escalation</span> = an urgent (P1) job that breached its SLA. Each one costs 2 points (max 10) and flags the supplier for follow-up.</p>
            </div>
          )
        })()}

        {/* Rating + comments */}
        <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Rating</div>
            <Stars value={detail?.rating.avg ?? row.avgRating} count={detail?.rating.count ?? row.ratingCount} size={14} />
          </div>
          {!loading && detail?.comments.length ? (
            <>
              <button onClick={() => setShowComments(o => !o)} aria-expanded={showComments} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                <ChevronDown size={14} className={`transition-transform ${showComments ? 'rotate-180' : ''}`} />
                {showComments ? 'Hide' : 'Show'} comments ({detail.comments.length})
              </button>
              {showComments && (
                <div className="space-y-2 pt-1">
                  {detail.comments.map((cm, i) => (
                    <div key={i} className="rounded-lg bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Stars value={cm.score} size={11} />
                        <span className="text-[10px] text-[var(--text-faint)]">{formatDate(cm.createdAt)}</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1 whitespace-pre-line">{cm.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (!loading && <p className="text-xs text-[var(--text-faint)]">No written feedback yet.</p>)}
        </div>
        </>
      )}
    </Modal>
  )
}
