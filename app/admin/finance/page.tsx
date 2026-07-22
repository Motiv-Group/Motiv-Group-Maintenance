export const dynamic = 'force-dynamic'

import { Banknote, Wallet, Receipt, Building2, Users, Truck, Store, Briefcase, Crown } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireMasterAdmin } from '@/lib/health/guard'
import { BackLink } from '@/components/ui/BackLink'
import { SectionCard, KpiRow } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { formatCurrency } from '@/lib/utils'

const APP_FEE_RATE = 0.005   // 0.5% of completed quote value
const SUB_FEE = 150          // R150 per subscriber / month (static for now)

export default async function AdminFinancePage() {
  // Defence in depth — middleware already gates /admin to system_admin.
  await requireMasterAdmin()
  const db = createAdminClient()

  // App-wide (all tenants) via service role.
  const [{ data: suppliers }, { data: subscribers }, { data: completed }, { count: companyCount }] = await Promise.all([
    db.from('suppliers').select('id, company_name').eq('active', true).order('company_name'),
    db.from('user_profiles').select('id, full_name, email, role').in('role', ['client', 'store_manager', 'regional_manager', 'executive']).eq('active', true),
    db.from('tickets').select('supplier_id, quote_value').eq('status', 'completed'),
    db.from('companies').select('id', { count: 'exact', head: true }),
  ])

  // Supplier app revenue: 0.5% of the awarded (excl-VAT) quote value of completed tickets.
  const quotedBy = new Map<string, number>()
  for (const t of completed ?? []) if (t.supplier_id) quotedBy.set(t.supplier_id, (quotedBy.get(t.supplier_id) ?? 0) + Number(t.quote_value ?? 0))
  const supplierRows = (suppliers ?? [])
    .map(s => { const quoted = quotedBy.get(s.id) ?? 0; return { id: s.id, name: s.company_name, quoted, fee: quoted * APP_FEE_RATE } })
    .sort((a, b) => b.quoted - a.quoted)
  const totalQuoted = supplierRows.reduce((a, s) => a + s.quoted, 0)
  const totalFee = totalQuoted * APP_FEE_RATE

  // Subscribers: SM (client/store_manager), RM, Executive — R150 each.
  const subs = subscribers ?? []
  const isSM = (r: string) => r === 'client' || r === 'store_manager'
  const smCount = subs.filter(u => isSM(u.role)).length
  const rmCount = subs.filter(u => u.role === 'regional_manager').length
  const exCount = subs.filter(u => u.role === 'executive').length
  const subCount = subs.length
  const subRevenue = subCount * SUB_FEE
  const grandTotal = totalFee + subRevenue

  const roleLabel = (r: string) => isSM(r) ? 'Store Manager' : r === 'regional_manager' ? 'Regional Manager' : 'Executive'
  const sortedSubs = [...subs].sort((a, b) => roleLabel(a.role).localeCompare(roleLabel(b.role)) || (a.full_name ?? '').localeCompare(b.full_name ?? ''))

  return (
    <div className="space-y-6">
      <BackLink fallbackHref="/admin" label="Back to overview" />
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Wallet className="text-blue-600 dark:text-blue-400" size={22} /> Finance
          <InfoTip title="Finance" align="left">The platform business view: total revenue (supplier fees + subscriptions), per-subscriber billing and per-supplier app fees, app-wide across every company.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Revenue, subscribers and supplier fees across {companyCount ?? 0} compan{companyCount === 1 ? 'y' : 'ies'}.</p>
      </div>

      {/* Revenue summary */}
      <KpiRow kpis={[
        { label: 'Total App Revenue', value: formatCurrency(grandTotal), hint: 'Supplier fees + subscriptions', icon: <Wallet size={13} />, tone: 'good' },
        { label: 'Supplier Fees (0.5%)', value: formatCurrency(totalFee), hint: `of ${formatCurrency(totalQuoted)} completed`, icon: <Receipt size={13} />, tone: 'info' },
        { label: 'Subscriptions', value: formatCurrency(subRevenue), hint: `${subCount} × ${formatCurrency(SUB_FEE)}/mo`, icon: <Banknote size={13} />, tone: 'info' },
        { label: 'Completed Quote Value', value: formatCurrency(totalQuoted), hint: `${supplierRows.length} suppliers`, icon: <Briefcase size={13} />, tone: 'good' },
      ]} />

      {/* Subscribers (clients) */}
      <SectionCard
        title="Subscribers (Clients)"
        icon={<Users size={15} className="text-blue-500" />}
        action={<span className="text-xs text-[var(--text-muted)]">{subCount} active · {formatCurrency(subRevenue)}/mo</span>}
      >
        <div className="space-y-4">
          <KpiRow kpis={[
            { label: 'Store Managers', value: smCount, hint: `${formatCurrency(smCount * SUB_FEE)}/mo`, icon: <Store size={13} />, tone: 'info' },
            { label: 'Regional Managers', value: rmCount, hint: `${formatCurrency(rmCount * SUB_FEE)}/mo`, icon: <Building2 size={13} />, tone: 'info' },
            { label: 'Executives', value: exCount, hint: `${formatCurrency(exCount * SUB_FEE)}/mo`, icon: <Crown size={13} />, tone: 'info' },
          ]} />
          <div className="hidden sm:block overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Name</th><th className="px-2">Email</th><th className="px-2">Role</th><th className="px-2 text-right">Monthly</th></tr></thead>
              <tbody>
                {sortedSubs.map(u => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                    <td className="py-2.5 px-2 text-[var(--text)]">{u.full_name ?? '—'}</td>
                    <td className="px-2 text-[var(--text-muted)] truncate max-w-[220px]">{u.email ?? '—'}</td>
                    <td className="px-2 text-[var(--text-muted)]">{roleLabel(u.role)}</td>
                    <td className="px-2 text-right text-[var(--text)] tabular-nums">{formatCurrency(SUB_FEE)}</td>
                  </tr>
                ))}
                {!sortedSubs.length && <tr><td colSpan={4} className="py-6 text-center text-[var(--text-faint)]">No subscribers yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-2">
            {sortedSubs.map(u => (
              <div key={u.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--text)] truncate min-w-0">{u.full_name ?? '—'}</span>
                  <span className="text-[var(--text)] tabular-nums shrink-0">{formatCurrency(SUB_FEE)}/mo</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{roleLabel(u.role)}</div>
                <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{u.email ?? '—'}</div>
              </div>
            ))}
            {!sortedSubs.length && <div className="py-6 text-center text-[var(--text-faint)]">No subscribers yet.</div>}
          </div>
        </div>
      </SectionCard>

      {/* Suppliers */}
      <SectionCard
        title="Suppliers"
        icon={<Truck size={15} className="text-blue-500" />}
        action={<span className="text-xs text-[var(--text-muted)]">{supplierRows.length} active</span>}
      >
        <div className="hidden sm:block overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Supplier</th><th className="px-2 text-right">Completed Quote Value</th><th className="px-2 text-right">App Fee (0.5%)</th></tr></thead>
            <tbody>
              {supplierRows.map(s => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                  <td className="py-2.5 px-2 text-[var(--text)]">{s.name}</td>
                  <td className="px-2 text-right text-[var(--text)] tabular-nums whitespace-nowrap">{formatCurrency(s.quoted)}</td>
                  <td className="px-2 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(s.fee)}</td>
                </tr>
              ))}
              {!supplierRows.length && <tr><td colSpan={3} className="py-6 text-center text-[var(--text-faint)]">No suppliers yet.</td></tr>}
            </tbody>
            {supplierRows.length > 0 && (
              <tfoot><tr className="border-t-2 border-[var(--border)] font-bold">
                <td className="py-2.5 px-2 text-[var(--text)]">Grand total</td>
                <td className="px-2 text-right text-[var(--text)] tabular-nums whitespace-nowrap">{formatCurrency(totalQuoted)}</td>
                <td className="px-2 text-right text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(totalFee)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
        <div className="sm:hidden space-y-2">
          {supplierRows.map(s => (
            <div key={s.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
              <div className="font-semibold text-[var(--text)] truncate min-w-0">{s.name}</div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[var(--text-faint)]">Quote Value</div>
                  <div className="text-[var(--text)] tabular-nums whitespace-nowrap">{formatCurrency(s.quoted)}</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[11px] text-[var(--text-faint)]">App Fee (0.5%)</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(s.fee)}</div>
                </div>
              </div>
            </div>
          ))}
          {supplierRows.length > 0 && (
            <div className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
              <div className="font-bold text-[var(--text)]">Grand total</div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-[var(--text-faint)]">Quote Value</div>
                  <div className="font-bold text-[var(--text)] tabular-nums whitespace-nowrap">{formatCurrency(totalQuoted)}</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[11px] text-[var(--text-faint)]">App Fee (0.5%)</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(totalFee)}</div>
                </div>
              </div>
            </div>
          )}
          {!supplierRows.length && <div className="py-6 text-center text-[var(--text-faint)]">No suppliers yet.</div>}
        </div>
      </SectionCard>
    </div>
  )
}
