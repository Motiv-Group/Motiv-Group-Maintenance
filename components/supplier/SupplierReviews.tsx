'use client'

// Supplier "My Reviews" page — a rating hero + KPI cards + score breakdown on the
// left, and a filterable / paginated list of manager reviews on the right. All
// computed from the supplier's `ratings` rows. Mirrors the polished RM data pages.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Star, Users, CalendarDays, TrendingUp, TrendingDown, Wrench, Store, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Info, ArrowRight } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { Stars } from '@/components/ui/Stars'
import { formatDate } from '@/lib/utils'

export interface SupplierReview {
  id: string
  score: number
  comment: string | null
  createdAt: string
  ticketId: string | null
  jobRef: string | null
  category: string | null
  storeName: string | null
  completedAt: string | null
  reviewerName: string | null
  reviewerRole: string
}

// Word for an average score — matches the tone shown in the hero.
function band(avg: number): string {
  if (avg >= 4.5) return 'Very good'
  if (avg >= 4) return 'Good'
  if (avg >= 3) return 'Average'
  if (avg >= 2) return 'Below average'
  return 'Poor'
}
function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('') : '?'
}
function monthKey(iso: string): string { return iso.slice(0, 7) } // YYYY-MM

const SEL = 'appearance-none rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40'
function Select({ value, onChange, ariaLabel, children }: { value: string; onChange: (v: string) => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className={SEL}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
    </div>
  )
}

export function SupplierReviews({ reviews, now }: { reviews: SupplierReview[]; now: string }) {
  const [rating, setRating] = useState('all')
  const [jobType, setJobType] = useState('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest')
  const [perPage, setPerPage] = useState(5)
  const [page, setPage] = useState(1)

  const total = reviews.length
  const avg = total ? reviews.reduce((s, r) => s + r.score, 0) / total : 5
  const breakdown = useMemo(() => {
    const b: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    for (const r of reviews) if (b[r.score] != null) b[r.score]++
    return b
  }, [reviews])

  // This-month count + rating trend vs last month (from the injected `now`).
  const thisKey = monthKey(now)
  const prevKey = (() => { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })()
  const thisMonth = reviews.filter(r => monthKey(r.createdAt) === thisKey)
  const lastMonth = reviews.filter(r => monthKey(r.createdAt) === prevKey)
  const avgOf = (rs: SupplierReview[]) => rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : 0
  const trend = thisMonth.length && lastMonth.length ? avgOf(thisMonth) - avgOf(lastMonth) : 0

  const categories = useMemo(() => [...new Set(reviews.map(r => r.category).filter(Boolean))].sort() as string[], [reviews])

  const filtered = useMemo(() => {
    const rows = reviews.filter(r => {
      if (rating !== 'all' && r.score !== Number(rating)) return false
      if (jobType !== 'all' && r.category !== jobType) return false
      return true
    })
    const cmp: Record<string, (a: SupplierReview, b: SupplierReview) => number> = {
      newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      oldest: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      highest: (a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt),
      lowest: (a, b) => a.score - b.score || +new Date(b.createdAt) - +new Date(a.createdAt),
    }
    return [...rows].sort(cmp[sort])
  }, [reviews, rating, jobType, sort])

  // Snap to page 1 whenever filters change.
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const curPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((curPage - 1) * perPage, curPage * perPage)
  const firstShown = filtered.length ? (curPage - 1) * perPage + 1 : 0
  const lastShown = Math.min(curPage * perPage, filtered.length)
  const resetPage = () => setPage(1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/supplier" className="mb-1 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to dashboard</Link>
          <h1 className="text-2xl font-bold text-[var(--text)]">My Reviews</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">See feedback from store and regional managers for your completed work.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] items-start">
        {/* Left column — rating hero, breakdown, this month */}
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-bold text-[var(--text)]">Supplier rating</p>
            <div className="mt-3 flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Star size={26} className="fill-current" /></span>
              <div>
                <div className="flex items-end gap-1"><span className="text-3xl font-bold leading-none text-[var(--text)]">{avg.toFixed(1)}</span><span className="text-sm text-[var(--text-faint)]">/ 5</span></div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{band(avg)}</p>
              </div>
            </div>
            <div className="mt-3"><Stars value={avg} size={18} showNumber={false} /></div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Based on {total} review{total === 1 ? '' : 's'}</p>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-bold text-[var(--text)]">Rating breakdown</p>
            <div className="mt-3 space-y-2">
              {[5, 4, 3, 2, 1].map(n => {
                const count = breakdown[n]
                const pct = total ? (count / total) * 100 : 0
                return (
                  <div key={n} className="flex items-center gap-2 text-xs">
                    <span className="flex w-6 items-center gap-0.5 text-[var(--text-muted)]">{n}<Star size={11} className="fill-amber-400 text-amber-400" /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                    <span className="w-4 text-right tabular-nums text-[var(--text)]">{count}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]"><CalendarDays size={15} className="text-[var(--text-faint)]" /> This month</p>
            <div className="mt-2 text-2xl font-bold text-[var(--text)]">{thisMonth.length} <span className="text-sm font-medium text-[var(--text-muted)]">review{thisMonth.length === 1 ? '' : 's'}</span></div>
            <div className="mt-1"><TrendPill delta={trend} /></div>
          </Card>
        </div>

        {/* Right column — KPIs, filters, list, pagination */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={<Star size={18} className="fill-current" />} wrap="bg-purple-500/15 text-purple-600 dark:text-purple-400" value={`${avg.toFixed(1)} / 5`} label="Average rating" hint={band(avg)} />
            <Kpi icon={<Users size={18} />} wrap="bg-blue-500/15 text-blue-600 dark:text-blue-400" value={total} label="Total reviews" hint="Across all time" />
            <Kpi icon={<CalendarDays size={18} />} wrap="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" value={thisMonth.length} label="This month" hint="reviews" />
            <Kpi icon={trend >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />} wrap="bg-amber-500/15 text-amber-600 dark:text-amber-400" value={`${trend > 0 ? '+' : ''}${trend.toFixed(1)}`} label="Rating trend" hint="vs last month" />
          </div>

          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Select ariaLabel="Filter by rating" value={rating} onChange={v => { setRating(v); resetPage() }}>
              <option value="all">All ratings</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} stars</option>)}
            </Select>
            <Select ariaLabel="Filter by job type" value={jobType} onChange={v => { setJobType(v); resetPage() }}>
              <option value="all">All job types</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <div className="ml-auto"><Select ariaLabel="Sort reviews" value={sort} onChange={v => { setSort(v as typeof sort); resetPage() }}>
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option>
            </Select></div>
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">Reviews are written by the store and regional managers after they sign off your completed jobs. You can&apos;t edit or remove them.</p>
          </div>

          {pageRows.length ? (
            <div className="space-y-3">
              {pageRows.map(r => (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600/15 text-[11px] font-bold text-blue-700 dark:text-blue-300">{initials(r.reviewerName)}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-faint)]">Reviewed by</p>
                        <p className="text-sm font-semibold text-[var(--text)]">{r.reviewerName ?? 'Manager'}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{r.reviewerRole}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <Stars value={r.score} size={15} showNumber={false} />
                      <span className="text-sm font-bold text-[var(--text)]">{r.score.toFixed(1)}</span>
                    </div>
                  </div>

                  {r.comment && <p className="mt-3 text-sm text-[var(--text)]">{r.comment}</p>}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.category && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] ring-1 ring-[var(--border)]"><Wrench size={11} /> {r.category}</span>}
                      {r.storeName && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] ring-1 ring-[var(--border)]"><Store size={11} /> {r.storeName}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {r.completedAt && <span className="text-[11px] text-[var(--text-faint)]">Completed {formatDate(r.completedAt)}</span>}
                      {r.ticketId && <Link href={`/supplier/tickets/${r.ticketId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">View job <ArrowRight size={14} /></Link>}
                    </div>
                  </div>
                </Card>
              ))}

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">Rows per page
                  <Select ariaLabel="Rows per page" value={String(perPage)} onChange={v => { setPerPage(Number(v)); resetPage() }}><option value="5">5</option><option value="10">10</option><option value="25">25</option></Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-xs text-[var(--text-faint)] tabular-nums">{firstShown}–{lastShown} of {filtered.length}</span>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="Previous page" className="rounded-lg p-2.5 sm:p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronLeft size={15} /></button>
                  <span className="px-1 text-xs text-[var(--text-muted)] tabular-nums">Page {curPage} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="Next page" className="rounded-lg p-2.5 sm:p-1.5 text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          ) : (
            <Card className="grid min-h-32 place-items-center p-6 sm:p-8 text-center">
              <div>
                <Star size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
                <p className="text-sm text-[var(--text-faint)]">{total ? 'No reviews match your filters.' : 'No reviews yet — they appear here after a manager signs off a completed job.'}</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function TrendPill({ delta }: { delta: number }) {
  if (!delta) return <span className="text-[11px] text-[var(--text-faint)]">No change vs last month</span>
  const up = delta > 0
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? '+' : ''}{delta.toFixed(1)} vs last month</span>
}

function Kpi({ icon, wrap, value, label, hint }: { icon: React.ReactNode; wrap: string; value: React.ReactNode; label: string; hint?: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${wrap}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight text-[var(--text)]">{value}</div>
        <div className="truncate text-xs font-medium text-[var(--text-muted)]">{label}</div>
        {hint && <div className="truncate text-[11px] text-[var(--text-faint)]">{hint}</div>}
      </div>
    </Card>
  )
}
