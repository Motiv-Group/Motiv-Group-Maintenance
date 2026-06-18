'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Store, Plus } from 'lucide-react'
import type { StoreCard } from '@/lib/health/data'
import { formatCurrency } from '@/lib/utils'
import { SectionCard, Pill, Donut, BreakdownList, STATUS_TEXT } from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

export function RegionalStores({ stores }: { stores: StoreCard[] }) {
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const selected = stores.find(s => s.storeId === selId) ?? null
  const ranked = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Store className="text-indigo-600 dark:text-indigo-400" size={22} /> Stores</h1>
        <Link href="/regional/stores/add" className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition shrink-0">
          <Plus size={16} /> Add Stores
        </Link>
      </div>

      <SectionCard title="Store Ranking — highest attention first">
          {/* Desktop / tablet — full table */}
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Health</th><th className="px-2">Status</th>
                <th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-2">Approvals</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th>
              </tr></thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr key={s.storeId} onClick={() => { setSelId(s.storeId); setOpen(true) }} className={`border-b border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] ${selId === s.storeId ? 'bg-[var(--hover)]' : ''}`}>
                    <td className="py-2.5 px-2 text-[var(--text-faint)]">{i + 1}</td><td className="px-2 text-[var(--text)]">{s.storeName}</td>
                    <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td><td className="px-2"><Pill status={s.finalStatus} /></td>
                    <td className="px-2 text-[var(--text)]">{s.openTickets}</td><td className="px-2 text-red-400">{s.overdueTickets}</td>
                    <td className="px-2 text-[var(--text)]">{s.pendingDecisions}</td><td className="px-2 text-[var(--text)] whitespace-nowrap">{fmtK(s.costExposure)}</td>
                    <td className="px-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate">{s.mainIssue}</td>
                  </tr>
                ))}
                {!stores.length && <tr><td colSpan={9} className="py-6 text-center text-[var(--text-faint)]">No stores in your region.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Phone — stacked cards, tap to open detail (no horizontal scroll) */}
          <ul className="md:hidden space-y-2">
            {ranked.map((s, i) => (
              <li key={s.storeId}>
                <button onClick={() => { setSelId(s.storeId); setOpen(true) }} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:bg-[var(--hover)] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate"><span className="text-[var(--text-faint)]">#{i + 1}</span> {s.storeName}</p>
                      <p className="text-[11px] text-[var(--text-faint)] truncate mt-0.5">{s.mainIssue}</p>
                    </div>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-sm font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</span>
                      <Pill status={s.finalStatus} />
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>Open: <span className="text-[var(--text)]">{s.openTickets}</span></span>
                    <span>Overdue: <span className="text-red-500">{s.overdueTickets}</span></span>
                    <span>Approvals: <span className="text-[var(--text)]">{s.pendingDecisions}</span></span>
                    <span>Exposure: <span className="text-[var(--text)]">{fmtK(s.costExposure)}</span></span>
                  </div>
                </button>
              </li>
            ))}
            {!stores.length && <li className="py-6 text-center text-[var(--text-faint)] text-sm">No stores in your region.</li>}
          </ul>
      </SectionCard>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <Detail s={selected} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

function Detail({ s, onClose }: { s: StoreCard; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-[var(--text)]">{s.storeName}</h3><Pill status={s.finalStatus} /></div>} />
      <div><div className={`text-3xl font-bold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div><p className="text-xs text-[var(--text-muted)] mt-1">Open {s.openTickets} · Overdue {s.overdueTickets} · Pending approvals {s.pendingDecisions}</p></div>
      <div className="flex items-center gap-4">
        <Donut value={s.finalHealthScore} status={s.finalStatus} size={104} />
        <div className="flex-1"><BreakdownList rows={[
          { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 }, { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
          { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 }, { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
          { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 }, { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
        ]} /></div>
      </div>
      <div><div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Recommended Action</div><p className="text-xs text-[var(--text)]">{s.finalStatus === 'controlled' ? 'Store controlled — maintain.' : `Resolve: ${s.mainIssue}.`}</p></div>
      <PrimaryButton tone="gold">View Store Tickets</PrimaryButton>
    </div>
  )
}
