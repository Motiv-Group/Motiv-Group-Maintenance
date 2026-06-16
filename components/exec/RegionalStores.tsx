'use client'

import { useState } from 'react'
import { Store } from 'lucide-react'
import type { StoreCard } from '@/lib/health/data'
import { formatCurrency } from '@/lib/utils'
import { Card, SectionCard, Pill, Donut, BreakdownList, STATUS_TEXT } from '@/components/exec/ui'
import { Drawer, DrawerHeader, PrimaryButton } from '@/components/exec/Drawer'
import { ProvisionPanel } from '@/components/exec/ProvisionPanel'

const fmtK = (n: number) => n ? (n >= 1000 ? `R ${(n / 1000).toFixed(0)}K` : formatCurrency(n)) : 'R 0'

export function RegionalStores({ stores }: { stores: StoreCard[] }) {
  const [selId, setSelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const selected = stores.find(s => s.storeId === selId) ?? null
  const ranked = [...stores].sort((a, b) => a.finalHealthScore - b.finalHealthScore)

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Store className="text-[#C6A35D]" size={22} /> Stores</h1>
        <p className="text-sm text-slate-400 mt-0.5">Stores in your region — health, blockers and required action.</p></div>

      <ProvisionPanel mode="rm-stores" stores={stores.map(s => ({ id: s.storeId, name: s.storeName }))} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
        <SectionCard title="Store Ranking — highest attention first">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5">
                <th className="py-2 px-2">#</th><th className="px-2">Store</th><th className="px-2">Health</th><th className="px-2">Status</th>
                <th className="px-2">Open</th><th className="px-2">Overdue</th><th className="px-2">Approvals</th><th className="px-2">Exposure</th><th className="px-2">Main Driver</th>
              </tr></thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr key={s.storeId} onClick={() => { setSelId(s.storeId); setOpen(true) }} className={`border-b border-white/5 cursor-pointer hover:bg-white/[0.03] ${selId === s.storeId ? 'bg-white/[0.04]' : ''}`}>
                    <td className="py-2.5 px-2 text-slate-500">{i + 1}</td><td className="px-2 text-white">{s.storeName}</td>
                    <td className={`px-2 font-semibold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</td><td className="px-2"><Pill status={s.finalStatus} /></td>
                    <td className="px-2 text-slate-300">{s.openTickets}</td><td className="px-2 text-red-400">{s.overdueTickets}</td>
                    <td className="px-2 text-slate-300">{s.pendingDecisions}</td><td className="px-2 text-slate-300 whitespace-nowrap">{fmtK(s.costExposure)}</td>
                    <td className="px-2 text-xs text-slate-400 max-w-[200px] truncate">{s.mainIssue}</td>
                  </tr>
                ))}
                {!stores.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">No stores in your region.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <div className="hidden xl:block sticky top-20"><Card className="p-5">{selected ? <Detail s={selected} /> : <p className="text-sm text-slate-500">Select a store.</p>}</Card></div>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)}>{selected && <Detail s={selected} onClose={() => setOpen(false)} />}</Drawer>
    </div>
  )
}

function Detail({ s, onClose }: { s: StoreCard; onClose?: () => void }) {
  return (
    <div className="space-y-4">
      <DrawerHeader onClose={onClose} title={<div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-bold text-white">{s.storeName}</h3><Pill status={s.finalStatus} /></div>} />
      <div><div className={`text-3xl font-bold ${STATUS_TEXT[s.finalStatus]}`}>{s.finalHealthScore}%</div><p className="text-xs text-slate-400 mt-1">Open {s.openTickets} · Overdue {s.overdueTickets} · Pending approvals {s.pendingDecisions}</p></div>
      <div className="flex items-center gap-4">
        <Donut value={s.finalHealthScore} status={s.finalStatus} size={104} />
        <div className="flex-1"><BreakdownList rows={[
          { label: 'Operational Risk', value: s.breakdown.operationalRisk, max: 30 }, { label: 'SLA Performance', value: s.breakdown.sla, max: 20 },
          { label: 'Ticket Load', value: s.breakdown.ticketLoad, max: 15 }, { label: 'Repeat Defects', value: s.breakdown.repeatDefect, max: 15 },
          { label: 'Commercial Impact', value: s.breakdown.commercialBlocker, max: 10 }, { label: 'Data Quality', value: s.breakdown.dataQuality, max: 10 },
        ]} /></div>
      </div>
      <div><div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Recommended Action</div><p className="text-xs text-slate-300">{s.finalStatus === 'controlled' ? 'Store controlled — maintain.' : `Resolve: ${s.mainIssue}.`}</p></div>
      <PrimaryButton tone="gold">View Store Tickets</PrimaryButton>
    </div>
  )
}
