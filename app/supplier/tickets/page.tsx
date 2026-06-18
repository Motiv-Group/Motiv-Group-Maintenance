export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { SectionCard } from '@/components/exec/ui'

export default async function SupplierTicketsPage() {
  const { companyId, supplierIds } = await requireSupplierV3()
  const d = await assembleSupplierDashboard(companyId, supplierIds)

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Ticket className="text-blue-600 dark:text-blue-400" size={22} /> Assigned Tickets</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Open work assigned to you — acknowledge, update, upload evidence, submit for sign-off.</p></div>
      <SectionCard title={`Open Work (${d.tickets.length})`}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
              <th className="py-2 px-2">Store</th><th className="px-2">Title</th><th className="px-2">Priority</th><th className="px-2">SLA</th><th className="px-2">Age</th><th className="px-2">Evidence</th><th className="px-2"></th>
            </tr></thead>
            <tbody>
              {d.tickets.map(t => (
                <tr key={t.id} className="border-b border-[var(--border)] hover:bg-[var(--hover)]">
                  <td className="py-2.5 px-2 text-[var(--text)]">{t.storeName}</td>
                  <td className="px-2 text-[var(--text)] max-w-[220px] truncate">{t.title}</td>
                  <td className="px-2 text-[var(--text)]">{t.priority}</td>
                  <td className="px-2"><span className={t.slaLabel === 'Breached' ? 'text-red-600 dark:text-red-400' : t.acknowledged ? 'text-[#C6A35D]' : 'text-blue-600 dark:text-blue-400'}>{t.acknowledged ? t.slaLabel : 'New'}</span></td>
                  <td className="px-2 text-[var(--text)]">{t.ageDays}d</td>
                  <td className="px-2 text-xs">{t.evidenceRequired ? `${[t.beforeUploaded, t.afterUploaded, t.cocUploaded].filter(Boolean).length}/3` : '—'}</td>
                  <td className="px-2"><Link href={`/supplier/tickets/${t.id}`} className="text-[11px] px-2 py-1 rounded-lg ring-1 text-[#C6A35D] ring-[#C6A35D]/40">Open</Link></td>
                </tr>
              ))}
              {!d.tickets.length && <tr><td colSpan={7} className="py-6 text-center text-[var(--text-faint)]">No open work assigned.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
