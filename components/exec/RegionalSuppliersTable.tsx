'use client'

// RM Suppliers tab — performance table; tapping a supplier opens a slide-out
// pane (mirrors the Stores tab) with contact details, jobs completed, SLA + star
// rating, and expandable rating comments.
import { useEffect, useState } from 'react'
import { Truck, X, User, Mail, Phone, MapPin, Wrench, ChevronDown } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, Pill, STATUS_TEXT } from '@/components/exec/ui'
import { Stars } from '@/components/ui/Stars'
import { MapLink } from '@/components/ui/MapLink'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'

type Row = RegionalDashboardData['suppliers'][number]
const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

interface Detail {
  supplier: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; trade: string | null }
  jobsCompleted: number
  rating: { avg: number | null; count: number }
  comments: { score: number; comment: string | null; createdAt: string }[]
}

export function RegionalSuppliersTable({ suppliers }: { suppliers: Row[] }) {
  const [sel, setSel] = useState<Row | null>(null)
  // Open a supplier's pane directly when deep-linked from the dashboard
  // (?supplier=<id>, e.g. the Supplier Performance block).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('supplier')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link sync from the URL on mount; the empty-dep effect intentionally seeds selection once
    if (id) { const match = suppliers.find(s => s.id === id); if (match) setSel(match) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <SectionCard title="Suppliers">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
            <th className="py-2 px-2">Supplier</th><th className="px-2">SLA</th><th className="px-2">Status</th>
            <th className="px-2 text-center">Open</th><th className="px-2 text-center">Overdue</th><th className="px-2 text-center">First-fix</th>
            <th className="px-2 text-center">Repeat</th><th className="px-2 text-center">Escalations</th><th className="px-2">Exposure</th>
          </tr></thead>
          <tbody>
            {suppliers.map(s => (
              <tr key={s.id} onClick={() => setSel(s)} className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)]">
                <td className="py-2.5 px-2 font-medium text-[var(--text)]">{s.name}</td>
                <td className={`px-2 font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</td>
                <td className="px-2"><Pill status={s.perf.band} /></td>
                <td className="px-2 text-center text-[var(--text-muted)]">{s.open}</td>
                <td className="px-2 text-center text-red-500">{s.overdue}</td>
                <td className="px-2 text-center text-[var(--text-muted)]">{Math.round(s.perf.firstTimeFixRate * 100)}%</td>
                <td className="px-2 text-center text-[var(--text-muted)]">{s.perf.repeatDefectInvolvement}</td>
                <td className="px-2 text-center text-[var(--text-muted)]">{s.perf.escalationCount}</td>
                <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
              </tr>
            ))}
            {!suppliers.length && <tr><td colSpan={9} className="py-6 text-center text-[var(--text-faint)]">No suppliers yet — add one to get started.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Phone — stacked cards */}
      <ul className="md:hidden space-y-2">
        {suppliers.map(s => (
          <li key={s.id}>
            <button onClick={() => setSel(s)} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--hover)] transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{s.name}</p>
                  <span className="mt-0.5 inline-block"><Stars value={s.avgRating} count={s.ratingCount} size={12} /></span>
                </div>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-sm font-semibold ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span>
                  <Pill status={s.perf.band} />
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                <span>Open: <span className="text-[var(--text)]">{s.open}</span></span>
                <span>Overdue: <span className="text-red-500">{s.overdue}</span></span>
                <span>First-fix: <span className="text-[var(--text)]">{Math.round(s.perf.firstTimeFixRate * 100)}%</span></span>
                <span>Exposure: <span className="text-[var(--text)]">{fmtK(s.costExposure)}</span></span>
              </div>
            </button>
          </li>
        ))}
        {!suppliers.length && <li className="py-6 text-center text-[var(--text-faint)] text-sm">No suppliers yet — add one to get started.</li>}
      </ul>

      {sel && <SupplierPane row={sel} onClose={() => setSel(null)} />}
    </SectionCard>
  )
}

function SupplierPane({ row, onClose }: { row: Row; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showComments, setShowComments] = useState(false)

  useEffect(() => {
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets loading state when row.id changes before re-fetching the supplier detail
    setLoading(true)
    fetch(`/api/regional/suppliers/${row.id}`)
      .then(r => r.json())
      .then(d => { if (live) setDetail(d) })
      .catch(() => { if (live) setDetail(null) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [row.id])

  const c = detail?.supplier
  const Stat = ({ label, value, tone = '' }: { label: string; value: number | string; tone?: string }) => (
    <div className="rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] p-3">
      <div className={`text-xl font-bold ${tone || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  )

  return (
    <Modal onClose={onClose}>
      {close => (
        <>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--text)] truncate flex items-center gap-2"><Truck size={18} className="text-[#C6A35D] shrink-0" />{row.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Pill status={row.perf.band} />
              <span className={`text-sm font-semibold ${STATUS_TEXT[row.perf.band]}`}>{row.perf.performanceScore}% SLA</span>
            </div>
            <div className="mt-1"><Stars value={row.avgRating} count={row.ratingCount} size={14} /></div>
          </div>
          <button onClick={close} className="shrink-0 -m-1 p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X size={18} /></button>
        </div>

        {/* Performance stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Jobs completed" value={loading ? '…' : (detail?.jobsCompleted ?? 0)} />
          <Stat label="SLA performance" value={`${row.perf.performanceScore}%`} tone={STATUS_TEXT[row.perf.band]} />
          <Stat label="Open" value={row.open} />
          <Stat label="Overdue" value={row.overdue} tone={row.overdue ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'} />
          <Stat label="First-time fix" value={`${Math.round(row.perf.firstTimeFixRate * 100)}%`} />
          <Stat label="Repeat defects" value={row.perf.repeatDefectInvolvement} />
          <Stat label="Escalations" value={row.perf.escalationCount} />
          <Stat label="Cost exposure" value={fmtK(row.costExposure)} />
        </div>

        {/* Why this score — mirrors the deductions in lib/health/supplierPerformance.ts */}
        {(() => {
          const p = row.perf
          const n = p.assignedTickets || 0
          const factors = [
            { label: 'SLA breaches', stat: n ? `${p.slaBreaches} of ${n} jobs` : 'no jobs yet', pts: n ? (p.slaBreaches / n) * 40 : 0, max: 40 },
            { label: 'First-time fix', stat: `${Math.round(p.firstTimeFixRate * 100)}%`, pts: (1 - p.firstTimeFixRate) * 20, max: 20 },
            { label: 'Evidence complete', stat: `${Math.round(p.evidenceCompletionRate * 100)}%`, pts: (1 - p.evidenceCompletionRate) * 15, max: 15 },
            { label: 'Repeat defects', stat: n ? `${p.repeatDefectInvolvement} of ${n} jobs` : '0', pts: n ? (p.repeatDefectInvolvement / n) * 15 : 0, max: 15 },
            { label: 'Escalations', stat: `${p.escalationCount} urgent breach${p.escalationCount === 1 ? '' : 'es'}`, pts: Math.min(10, p.escalationCount * 2), max: 10 },
          ].map(f => ({ ...f, pts: Math.round(f.pts) }))
          return (
            <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Why this score</div>
                <span className={`text-sm font-semibold ${STATUS_TEXT[p.band]}`}>{p.performanceScore}%</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Starts at 100%; each factor deducts points up to its weight.</p>
              <div className="space-y-1.5">
                {factors.map(f => (
                  <div key={f.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--text-muted)] min-w-0 truncate">{f.label} <span className="text-[var(--text-faint)]">· {f.stat}</span></span>
                    <span className={`shrink-0 font-medium tabular-nums ${f.pts ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{f.pts ? `−${f.pts}` : '0'}<span className="text-[var(--text-faint)] font-normal"> / {f.max}</span></span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]"><span className="font-semibold text-[var(--text)]">Escalation</span> = an urgent (P1) job that breached its SLA. Each one costs 2 points (max 10) and flags the supplier for follow-up.</p>
            </div>
          )
        })()}

        {/* Contact */}
        <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Contact</div>
          {loading ? <p className="text-sm text-[var(--text-faint)]">Loading…</p> : (
            <div className="space-y-1.5">
              {c?.contactName && <div className="flex items-center gap-2 text-sm text-[var(--text)]"><User size={14} className="text-[var(--text-faint)] shrink-0" />{c.contactName}</div>}
              {c?.trade && <div className="flex items-center gap-2 text-sm text-[var(--text)]"><Wrench size={14} className="text-[var(--text-faint)] shrink-0" />{c.trade}</div>}
              {c?.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-[#C6A35D]"><Mail size={14} className="text-[var(--text-faint)] shrink-0" /><span className="truncate">{c.email}</span></a>}
              {c?.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-sm text-[var(--text)] hover:text-[#C6A35D]"><Phone size={14} className="text-[var(--text-faint)] shrink-0" />{c.phone}</a>}
              {c?.address && <div className="flex items-start gap-2 text-sm text-[var(--text)]"><MapPin size={14} className="text-[var(--text-faint)] shrink-0 mt-0.5" /><MapLink address={c.address} className="hover:text-[#C6A35D]">{c.address}</MapLink></div>}
              {!c?.contactName && !c?.email && !c?.phone && !c?.address && <p className="text-sm text-[var(--text-faint)]">No contact details on file.</p>}
            </div>
          )}
        </div>

        {/* Star rating + expandable comments */}
        <div className="rounded-xl ring-1 ring-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Rating</div>
            <Stars value={detail?.rating.avg ?? row.avgRating} count={detail?.rating.count ?? row.ratingCount} size={14} />
          </div>
          {!loading && detail?.comments.length ? (
            <>
              <button onClick={() => setShowComments(o => !o)} aria-expanded={showComments} className="flex items-center gap-1.5 text-xs font-medium text-[#C6A35D] hover:underline">
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
