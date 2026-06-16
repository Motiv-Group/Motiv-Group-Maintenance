export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  Activity, AlertTriangle, Sparkles, ClipboardList, Truck, Repeat,
  Banknote, ListTodo, Building2, ShieldAlert, Clock4, ArrowRight,
} from 'lucide-react'
import { requireRegionalManager } from '@/lib/dashboards/guard'
import { assembleRegionalDashboard, type TicketActionRow } from '@/lib/dashboards/data'
import { PORTFOLIO_LABELS } from '@/lib/dashboards/constants'
import { HealthGauge, KpiGrid, DistributionBar, SectionCard, RagBadge, type KpiSpec } from '@/components/dashboards/primitives'
import { ResponsiveTable, type RTColumn } from '@/components/dashboards/ResponsiveTable'
import { formatCurrency, formatDateTimeShort } from '@/lib/utils'

export default async function RegionalDashboard() {
  const { user, profile } = await requireRegionalManager()
  const data = await assembleRegionalDashboard(user.id)
  const p = data.portfolio

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()

  const kpis: KpiSpec[] = [
    { label: 'Portfolio Health', value: `${p.finalPortfolioHealth}%`, hint: PORTFOLIO_LABELS[p.rag], accent: 'border-l-brand-500', tone: p.rag === 'green' ? 'good' : p.rag === 'amber' ? 'warn' : 'bad' },
    { label: 'Active Stores', value: p.activeStores, hint: `avg health ${p.averageStoreHealth}%`, accent: 'border-l-blue-500', href: '/regional/stores' },
    { label: 'Need Attention', value: data.attentionStores.length, hint: `${p.counts.critical} critical · ${p.counts.red} red`, accent: 'border-l-red-500', tone: data.attentionStores.length > 0 ? 'warn' : 'good' },
    { label: 'Open Tickets', value: p.openTickets, hint: `${p.overdueTickets} overdue`, accent: 'border-l-amber-500', href: '/regional/tickets' },
    { label: 'Supplier SLA Breaches', value: p.supplierSlaBreaches, accent: 'border-l-orange-500', tone: p.supplierSlaBreaches > 0 ? 'warn' : 'good' },
    { label: 'Internal SLA Breaches', value: p.internalSlaBreaches, accent: 'border-l-purple-500', tone: p.internalSlaBreaches > 0 ? 'warn' : 'good' },
    { label: 'Quotes Awaiting Approval', value: data.quotesAwaitingApproval, hint: formatCurrency(data.pendingQuoteValue), accent: 'border-l-yellow-500', tone: data.quotesAwaitingApproval > 0 ? 'warn' : 'default', href: '/regional/tickets?status=quoted' },
    { label: 'Repeat Defect Alerts', value: data.repeatDefects.length, accent: 'border-l-pink-500', tone: data.repeatDefects.length > 0 ? 'warn' : 'good' },
  ]

  // Recommended focus today
  const focus = buildFocus(data)

  const ticketCols: RTColumn<TicketActionRow>[] = [
    { header: 'Store', role: 'title', cell: t => (
      <Link href={`/regional/tickets/${t.id}`} className="font-medium text-gray-900 dark:text-white hover:text-brand-600">{t.storeName}</Link>
    ) },
    { header: 'SLA', role: 'badge', cell: t => <span className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{t.slaLabel}</span> },
    { header: 'Priority', cell: t => <span className="capitalize">{t.priority}</span> },
    { header: 'Age', cell: t => `${t.ageDays}d` },
    { header: 'Blocker', hideMobile: true, cell: t => <span className="text-gray-500 dark:text-gray-400">{t.currentBlocker ?? '—'}</span> },
    { header: 'Owner', hideMobile: true, cell: t => <span className="text-gray-500 dark:text-gray-400">{t.blockerOwner ?? '—'}</span> },
    { header: 'Next action', cell: t => <span className="text-gray-600 dark:text-gray-300">{t.nextAction}</span> },
    { header: 'Due', cell: t => <span className="whitespace-nowrap">{t.nextActionDueAt ? formatDateTimeShort(t.nextActionDueAt) : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting}, {profile.full_name?.split(' ')[0] ?? 'Manager'} 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {data.regionNames.join(', ') || 'Regional overview'} · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Portfolio health hero */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <HealthGauge score={p.finalPortfolioHealth} rag={p.rag} label="Portfolio" />
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-3">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <Activity size={18} className="text-brand-600 dark:text-brand-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio Health</h2>
              <RagBadge rag={p.rag} label={PORTFOLIO_LABELS[p.rag]} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Average store health {p.averageStoreHealth}% − penalty {p.riskPenalty} = <strong>{p.finalPortfolioHealth}%</strong>. {p.mainReason}.
            </p>
            {p.appliedPenalties.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.appliedPenalties.map((x, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{x}</span>
                ))}
              </div>
            )}
            <div className="pt-1"><DistributionBar counts={p.counts} /></div>
          </div>
        </div>
      </div>

      <KpiGrid specs={kpis} />

      {/* Recommended focus today */}
      <SectionCard title="Recommended Focus Today" icon={<ListTodo size={16} className="text-brand-600" />}>
        {focus.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing urgent — portfolio is under control.</p>
        ) : (
          <ul className="space-y-2">
            {focus.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5">{f.icon}</span>
                <span className="text-gray-700 dark:text-gray-200">{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stores requiring attention */}
        <SectionCard title="Stores Requiring Attention" icon={<AlertTriangle size={16} className="text-red-500" />}
          action={<Link href="/regional/stores" className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">All <ArrowRight size={12} /></Link>}>
          {data.attentionStores.length === 0 ? (
            <p className="text-sm text-gray-400">No stores flagged — every store is on track.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.attentionStores.slice(0, 8).map(s => (
                <li key={s.storeId} className="flex items-center justify-between gap-2 border-b border-gray-50 dark:border-gray-700/50 pb-2">
                  <div className="min-w-0">
                    <Link href={`/regional/stores/${s.storeId}`} className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-brand-600">{s.storeName}</Link>
                    <p className="text-xs text-gray-400 truncate">{s.mainIssue}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">{s.finalHealthScore}%</span>
                    <RagBadge rag={s.finalRag} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Performing well */}
        <SectionCard title="Performing Well" icon={<Sparkles size={16} className="text-green-500" />}>
          {data.healthyStores.length === 0 ? (
            <p className="text-sm text-gray-400">No stores in the green band yet — keep clearing the backlog.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.healthyStores.slice(0, 8).map(s => (
                <li key={s.storeId} className="flex items-center justify-between gap-2 border-b border-gray-50 dark:border-gray-700/50 pb-2">
                  <Link href={`/regional/stores/${s.storeId}`} className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-brand-600">{s.storeName}</Link>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{s.finalHealthScore}%</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Ticket action list */}
      <SectionCard title="Ticket Action List" icon={<ClipboardList size={16} className="text-brand-600" />}
        action={<Link href="/regional/tickets" className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">All tickets <ArrowRight size={12} /></Link>}>
        <ResponsiveTable
          columns={ticketCols}
          rows={data.ticketActions.slice(0, 5)}
          getKey={t => t.id}
          minWidth={720}
          empty="No open tickets needing action."
        />
        {data.ticketActions.length > 5 && (
          <Link href="/regional/tickets" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-3 inline-block">
            +{data.ticketActions.length - 5} more →
          </Link>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Internal action backlog */}
        <SectionCard title="Internal Action Backlog" icon={<Clock4 size={16} className="text-purple-500" />}>
          {data.internalBacklog.length === 0 ? (
            <p className="text-sm text-gray-400">No internal actions are holding work up.</p>
          ) : (
            <ul className="space-y-2">
              {data.internalBacklog.slice(0, 8).map(b => (
                <li key={b.ticketId} className="flex items-center justify-between gap-2 border-b border-gray-50 dark:border-gray-700/50 pb-2">
                  <div className="min-w-0">
                    <Link href={`/regional/tickets/${b.ticketId}`} className="text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 truncate block">{b.storeName}</Link>
                    <p className="text-xs text-gray-400">{b.action} · {b.owner ?? 'internal'}</p>
                  </div>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${b.internalBreached ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{b.daysWaiting}d</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Quote & cost exposure */}
        <SectionCard title="Quote & Cost Exposure" icon={<Banknote size={16} className="text-emerald-500" />}>
          <div className="grid grid-cols-2 gap-3 text-center mb-3">
            <div className="rounded-lg bg-slate-50 dark:bg-gray-900/40 p-3">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{data.quotesAwaitingApproval}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Awaiting approval</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-gray-900/40 p-3">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.pendingQuoteValue)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Pending value</p>
            </div>
          </div>
          {data.highValueApprovals.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {data.highValueApprovals.slice(0, 5).map(a => (
                <li key={a.ticketId} className="flex items-center justify-between gap-2">
                  <Link href={`/regional/tickets/${a.ticketId}`} className="text-gray-700 dark:text-gray-200 hover:text-brand-600 truncate">{a.storeName}</Link>
                  <span className="shrink-0 text-xs">{formatCurrency(a.value)} · {a.daysWaiting}d</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Supplier performance + Repeat defects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Supplier Performance" icon={<Truck size={16} className="text-brand-600 dark:text-brand-300" />}>
          {data.suppliers.length === 0 ? (
            <p className="text-sm text-gray-400">No tickets linked to a sub-supplier in your region yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.suppliers.slice(0, 6).map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2 border-b border-gray-50 dark:border-gray-700/50 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.perf.assignedTickets} tickets · {s.perf.slaBreaches} breaches · {Math.round(s.perf.firstTimeFixRate * 100)}% first-fix</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">{s.perf.performanceScore}</span>
                    <RagBadge rag={s.perf.band} label={s.perf.band} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Repeat Defects" icon={<Repeat size={16} className="text-pink-500" />}>
          {data.repeatDefects.length === 0 ? (
            <p className="text-sm text-gray-400">No repeat-defect patterns in the last 30 days.</p>
          ) : (
            <ul className="space-y-2">
              {data.repeatDefects.slice(0, 6).map((d, i) => (
                <li key={i} className="border-b border-gray-50 dark:border-gray-700/50 pb-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{d.category} · {d.storeName} <span className="text-pink-600 dark:text-pink-400">×{d.count}</span></p>
                  <p className="text-xs text-gray-400">{d.suggestedAction}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

// ── Recommended focus generator ──
function buildFocus(data: Awaited<ReturnType<typeof assembleRegionalDashboard>>) {
  const out: { icon: React.ReactNode; text: string }[] = []
  const crit = data.attentionStores.filter(s => s.finalRag === 'critical').slice(0, 3)
  if (crit.length) out.push({ icon: <ShieldAlert size={15} className="text-red-600" />, text: `Escalate critical store(s): ${crit.map(s => s.storeName).join(', ')}` })
  const callStores = data.attentionStores.filter(s => s.finalRag === 'red').slice(0, 3)
  if (callStores.length) out.push({ icon: <Building2 size={15} className="text-amber-600" />, text: `Call / follow up: ${callStores.map(s => s.storeName).join(', ')}` })
  if (data.highValueApprovals.length) out.push({ icon: <Banknote size={15} className="text-emerald-600" />, text: `Approve/decline ${data.highValueApprovals.length} high-value quote(s) — oldest ${Math.max(...data.highValueApprovals.map(a => a.daysWaiting))}d waiting` })
  const badSupplier = data.suppliers.find(s => s.perf.band === 'red' || s.perf.band === 'critical')
  if (badSupplier) out.push({ icon: <Truck size={15} className="text-orange-600" />, text: `Follow up supplier ${badSupplier.name} (${badSupplier.perf.slaBreaches} SLA breaches)` })
  if (data.repeatDefects.length) out.push({ icon: <Repeat size={15} className="text-pink-600" />, text: `Review ${data.repeatDefects.length} repeat-defect pattern(s)` })
  return out
}
