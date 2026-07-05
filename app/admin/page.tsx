export const dynamic = 'force-dynamic'

import { Banknote, Wallet, Receipt, Building2, Users, Truck, Store, Briefcase, Crown } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireMasterAdmin } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { formatCurrency } from '@/lib/utils'

const APP_FEE_RATE = 0.005   // 0.5% of completed quote value
const SUB_FEE = 150          // R150 per subscriber / month (static for now)

function Kpi({ label, value, hint, icon, tone = 'text-[var(--text)]' }: { label: string; value: string; hint?: string; icon: React.ReactNode; tone?: string }) {
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">{icon}{label}</div>
      <div className={`text-2xl font-bold leading-none ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--text-faint)]">{hint}</div>}
    </Card>
  )
}

export default async function AdminOverviewPage() {
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
  for (const t of (completed ?? []) as any[]) if (t.supplier_id) quotedBy.set(t.supplier_id, (quotedBy.get(t.supplier_id) ?? 0) + Number(t.quote_value ?? 0))
  const supplierRows = ((suppliers ?? []) as any[])
    .map(s => { const quoted = quotedBy.get(s.id) ?? 0; return { id: s.id, name: s.company_name as string, quoted, fee: quoted * APP_FEE_RATE } })
    .sort((a, b) => b.quoted - a.quoted)
  const totalQuoted = supplierRows.reduce((a, s) => a + s.quoted, 0)
  const totalFee = totalQuoted * APP_FEE_RATE

  // Subscribers: SM (client/store_manager), RM, Executive — R150 each.
  const subs = (subscribers ?? []) as any[]
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
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Crown className="text-[#C6A35D]" size={22} /> Platform Admin
          <InfoTip title="Platform Admin" align="left">Master-admin-only area. This tab is the business view (revenue, subscribers, suppliers). The tabs above — Supabase, Vercel, Resend, Upstash, Sentry — are the live infrastructure panels: database size, deployments, email, rate limiting and errors.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">App-wide overview across {companyCount ?? 0} compan{companyCount === 1 ? 'y' : 'ies'} — revenue, suppliers and subscribers. Infra provider health is in the tabs above.</p>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total App Revenue" value={formatCurrency(grandTotal)} hint="Supplier fees + subscriptions" icon={<Wallet size={13} className="text-emerald-500" />} tone="text-emerald-600 dark:text-emerald-400" />
        <Kpi label="Supplier Fees (0.5%)" value={formatCurrency(totalFee)} hint={`of ${formatCurrency(totalQuoted)} completed`} icon={<Receipt size={13} className="text-[#C6A35D]" />} />
        <Kpi label="Subscriptions" value={formatCurrency(subRevenue)} hint={`${subCount} × ${formatCurrency(SUB_FEE)}/mo`} icon={<Banknote size={13} className="text-blue-500" />} />
        <Kpi label="Completed Quote Value" value={formatCurrency(totalQuoted)} hint={`${supplierRows.length} suppliers`} icon={<Briefcase size={13} className="text-violet-500" />} />
      </div>

      {/* Subscribers (clients) */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2"><Users size={15} className="text-blue-500" /> Subscribers (Clients)</h2>
          <span className="text-xs text-[var(--text-muted)]">{subCount} active · {formatCurrency(subRevenue)}/mo</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Store Managers', n: smCount, icon: <Store size={13} className="text-blue-500" /> },
            { label: 'Regional Managers', n: rmCount, icon: <Building2 size={13} className="text-teal-500" /> },
            { label: 'Executives', n: exCount, icon: <Crown size={13} className="text-[#C6A35D]" /> },
          ].map(c => (
            <div key={c.label} className="rounded-xl ring-1 ring-[var(--border)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">{c.icon}{c.label}</div>
              <div className="text-2xl font-bold text-[var(--text)] mt-1">{c.n}</div>
              <div className="text-[10px] text-[var(--text-faint)]">{formatCurrency(c.n * SUB_FEE)}/mo</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Name</th><th className="px-2">Email</th><th className="px-2">Role</th><th className="px-2 text-right">Monthly</th></tr></thead>
            <tbody>
              {sortedSubs.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
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
      </Card>

      {/* Suppliers */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2"><Truck size={15} className="text-teal-500" /> Suppliers</h2>
          <span className="text-xs text-[var(--text-muted)]">{supplierRows.length} active</span>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Supplier</th><th className="px-2 text-right">Completed Quote Value</th><th className="px-2 text-right">App Fee (0.5%)</th></tr></thead>
            <tbody>
              {supplierRows.map(s => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
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
      </Card>
    </div>
  )
}
