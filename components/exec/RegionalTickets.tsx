'use client'

import Link from 'next/link'
import { Ticket } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'

export function RegionalTickets({ actions }: { actions: RegionalDashboardData['ticketActions'] }) {
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Ticket className="text-[#C6A35D]" size={22} /> Tickets</h1>
        <p className="text-sm text-slate-400 mt-0.5">Open tickets needing action — lowest health first.</p></div>
      <SectionCard title={`Ticket Action List (${actions.length})`}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-[11px] text-slate-500 border-b border-white/5">
              <th className="py-2 px-2">Store</th><th className="px-2">Priority</th><th className="px-2">Age</th><th className="px-2">SLA</th>
              <th className="px-2">Blocker</th><th className="px-2">Next Action</th><th className="px-2">Due</th><th className="px-2">Health</th><th className="px-2"></th>
            </tr></thead>
            <tbody>
              {actions.map(t => (
                <tr key={t.id} className="border-b border-white/5">
                  <td className="py-2.5 px-2 text-white">{t.storeName}</td><td className="px-2 text-slate-300">{t.priority}</td>
                  <td className="px-2 text-slate-300">{t.ageDays}d</td>
                  <td className="px-2"><span className={`text-[11px] ${t.slaLabel === 'Breached' ? 'text-red-400' : t.slaLabel === 'Healthy' ? 'text-emerald-400' : 'text-[#C6A35D]'}`}>{t.slaLabel}</span></td>
                  <td className="px-2 text-xs text-slate-400">{t.currentBlocker ?? '—'}</td>
                  <td className="px-2 text-xs text-slate-300 max-w-[200px] truncate">{t.nextAction}</td>
                  <td className="px-2 text-xs text-slate-400 whitespace-nowrap">{t.nextActionDueAt ? new Date(t.nextActionDueAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—'}</td>
                  <td className="px-2 font-semibold text-white">{t.healthScore}</td>
                  <td className="px-2"><Link href={`/regional/tickets/${t.id}`} className="text-[11px] px-2 py-1 rounded-lg ring-1 text-[#C6A35D] ring-[#C6A35D]/40">Open</Link></td>
                </tr>
              ))}
              {!actions.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">No open tickets needing action.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
