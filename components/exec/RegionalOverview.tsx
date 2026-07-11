'use client'

import Link from 'next/link'
import { Building2, ShieldAlert, Truck, ClipboardCheck, AlertTriangle, ListTodo, Banknote } from 'lucide-react'
import type { RegionalDashboardData } from '@/lib/health/data'
import { SectionCard, Card, DistributionBar, RagBlocks, STATUS_TEXT } from '@/components/exec/ui'
import { DashboardHealthHeader } from '@/components/exec/DashboardHealthHeader'
import { RegionalPriorityWorkQueue } from '@/components/regional/RegionalPriorityWorkQueue'
import { Stars } from '@/components/ui/Stars'
import type { Briefing } from '@/lib/briefing/facts'
import { formatCurrency } from '@/lib/utils'

export function RegionalOverview({ data, name, briefing, briefingScopeId, motivSuppliers = [] }: { data: RegionalDashboardData; name: string | null; briefing?: Briefing; briefingScopeId?: string; motivSuppliers?: { id: string; name: string; avgRating?: number; ratingCount?: number }[] }) {
  const p = data.portfolio
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  const focus = buildFocus(data)
  // Company suppliers for the Today queue's in-place "Assign supplier" picker.
  const assignSuppliers = data.suppliers.map(s => ({ id: s.id, name: s.name, avgRating: s.avgRating, ratingCount: s.ratingCount }))

  return (
    <div className="space-y-5">
      {/* Page header — greeting (left) · region health donut + AI briefing (right). */}
      <DashboardHealthHeader
        greeting={greeting}
        name={name}
        subtitle="Regional portfolio overview"
        scopePrefix="Portfolio"
        score={p.finalPortfolioHealth}
        status={p.status}
        briefingBody={briefing?.body}
        briefingHeadline={briefing?.headline}
        briefingScope="region"
        briefingScopeId={briefingScopeId}
      />

      {/* KPI cards + priority work queue (same as the store-manager home). */}
      <RegionalPriorityWorkQueue tickets={data.tickets} generatedAt={data.generatedAt} suppliers={assignSuppliers} motivSuppliers={motivSuppliers} />

      {/* Portfolio blocks side by side: distribution · focus · supplier perf · quote value */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SectionCard title="Store Health Distribution" icon={<Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />} action={<Link href="/regional/stores" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          <DistributionBar counts={p.counts} />
          {/* Each RAG block deep-links into the Stores tab filtered to that status. */}
          <div className="mt-3"><RagBlocks counts={p.counts} unitLabel="stores" hrefFor={s => `/regional/stores?status=${s}`} /></div>
        </SectionCard>

        <SectionCard title="Recommended Focus Today" icon={<ListTodo size={15} className="text-[#C6A35D]" />}>
          {focus.length ? <ul className="space-y-2">{focus.map((f, i) => <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">{f.icon}<span>{f.text}</span></li>)}</ul>
            : <p className="text-sm text-[var(--text-faint)]">Nothing urgent — portfolio under control.</p>}
        </SectionCard>

        <SectionCard title="Supplier Performance" icon={<Truck size={15} className="text-teal-600 dark:text-teal-400" />} action={<Link href="/regional/suppliers" className="text-xs text-[#C6A35D] hover:underline">View all</Link>}>
          {data.suppliers.slice(0, 5).map(s => (
            <Link key={s.id} href={`/regional/suppliers?supplier=${s.id}`} className="flex items-center justify-between gap-2 py-2 -mx-2 px-2 rounded-lg border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)] truncate">{s.name}</p>
                <Stars value={s.avgRating} count={s.ratingCount} />
              </div>
              <span className={`text-sm font-semibold shrink-0 ${STATUS_TEXT[s.perf.band]}`}>{s.perf.performanceScore}%</span>
            </Link>
          ))}
          {!data.suppliers.length && <p className="text-sm text-[var(--text-faint)]">No suppliers active in your region yet.</p>}
        </SectionCard>

        <QuoteValueCard accepted={data.quoteTotals.accepted} pending={data.quoteTotals.pending} voPending={data.quoteTotals.voPending} />
      </div>
    </div>
  )
}

/** Combined quote-value KPI: accepted (incl. approved VOs), pending quotes, and
 *  pending variation orders as their own line. Read-only summary metric. */
function QuoteValueCard({ accepted, pending, voPending }: { accepted: number; pending: number; voPending: number }) {
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-w-0 h-full">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]"><Banknote size={13} /> Quote Value</div>
      <div className="space-y-0.5 mt-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Accepted</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(accepted)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-600 dark:text-amber-500">Pending</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(pending)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-purple-600 dark:text-purple-400">VO pending</span>
          <span className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(voPending)}</span>
        </div>
      </div>
    </Card>
  )
}

function buildFocus(data: RegionalDashboardData) {
  const out: { icon: React.ReactNode; text: string }[] = []
  const crit = data.attentionStores.filter(s => s.finalStatus === 'critical').slice(0, 3)
  if (crit.length) out.push({ icon: <ShieldAlert size={15} className="text-red-400 mt-0.5 shrink-0" />, text: `Escalate critical store(s): ${crit.map(s => s.storeName).join(', ')}` })
  const red = data.attentionStores.filter(s => s.finalStatus === 'at_risk').slice(0, 3)
  if (red.length) out.push({ icon: <Building2 size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `Follow up: ${red.map(s => s.storeName).join(', ')}` })
  if (data.signoffsPending) out.push({ icon: <ClipboardCheck size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `${data.signoffsPending} job(s) awaiting your sign-off` })
  if (data.snagsOpen) out.push({ icon: <AlertTriangle size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `${data.snagsOpen} open snag(s) to resolve` })
  const badSup = data.suppliers.find(s => s.perf.band === 'at_risk' || s.perf.band === 'critical')
  if (badSup) out.push({ icon: <Truck size={15} className="text-[#C6A35D] mt-0.5 shrink-0" />, text: `Follow up supplier ${badSup.name} (${badSup.perf.slaBreaches} breaches)` })
  return out
}
