export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Crown, Users, Network, Truck, FolderKanban, Timer, ScrollText, Wallet, Paintbrush, Server, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireMasterAdmin } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { formatCurrency } from '@/lib/utils'

const SUB_FEE = 150 // R150 per subscriber / month (mirrors the Finance tab)

export default async function AdminOverviewPage() {
  // Defence in depth — middleware already gates /admin to system_admin.
  await requireMasterAdmin()
  const db = createAdminClient()

  // Cheap head-count queries — the hub shows a headline number per area, not detail.
  const [companies, accounts, suppliers, projects, regions, audit] = await Promise.all([
    db.from('companies').select('id', { count: 'exact', head: true }),
    db.from('user_profiles').select('id', { count: 'exact', head: true }).in('role', ['client', 'store_manager', 'regional_manager', 'executive']).eq('active', true),
    db.from('suppliers').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('projects').select('id', { count: 'exact', head: true }).is('archived_at', null),
    db.from('regions').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('audit_logs').select('id', { count: 'exact', head: true }),
  ])
  const companyCount = companies.count ?? 0
  const accountCount = accounts.count ?? 0
  const supplierCount = suppliers.count ?? 0
  const projectCount = projects.count ?? 0
  const regionCount = regions.count ?? 0
  const auditCount = audit.count ?? 0
  const mrr = accountCount * SUB_FEE

  const areas: { href: string; label: string; desc: string; stat: string; icon: React.ElementType }[] = [
    { href: '/admin/accounts', label: 'Accounts', icon: Users, desc: 'Companies, managers & suppliers', stat: `${companyCount} compan${companyCount === 1 ? 'y' : 'ies'} · ${accountCount} accounts` },
    { href: '/admin/hierarchy', label: 'Hierarchy', icon: Network, desc: 'Link managers to regions & stores', stat: `${regionCount} region${regionCount === 1 ? '' : 's'}` },
    { href: '/admin/suppliers', label: 'Suppliers', icon: Truck, desc: 'Directory & verification', stat: `${supplierCount} active` },
    { href: '/admin/projects', label: 'Projects', icon: FolderKanban, desc: 'Multi-store rollout tracking', stat: `${projectCount} active` },
    { href: '/admin/sla', label: 'SLA', icon: Timer, desc: 'Response & resolution targets', stat: 'Motiv default + per-company' },
    { href: '/admin/audit', label: 'Audit', icon: ScrollText, desc: 'Privileged-action trail & sign-ins', stat: `${auditCount} event${auditCount === 1 ? '' : 's'}` },
    { href: '/admin/finance', label: 'Finance', icon: Wallet, desc: 'Revenue, billing & supplier fees', stat: `${formatCurrency(mrr)}/mo subscriptions` },
    { href: '/admin/customization', label: 'Customize', icon: Paintbrush, desc: 'Branding, colours & app icons', stat: 'Name · palette · logo' },
    { href: '/admin/supabase', label: 'Infrastructure', icon: Server, desc: 'Supabase · Vercel · Resend · Upstash · Sentry', stat: 'Live provider health' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Crown className="text-blue-600 dark:text-blue-400" size={22} /> Platform Admin
          <InfoTip title="Platform Admin" align="left">Master-admin-only area. This overview links to every admin tool. Finance holds the revenue view; the Infrastructure group has the live Supabase/Vercel/Resend/Upstash/Sentry panels.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Everything across {companyCount} compan{companyCount === 1 ? 'y' : 'ies'} — jump to any area below.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(a => (
          <Link key={a.href} href={a.href} className="group block">
            <Card className="h-full p-4 transition hover:bg-[var(--hover)] hover:ring-blue-500/30">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <a.icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[var(--text)]">{a.label}</p>
                    <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)] transition group-hover:translate-x-0.5 group-hover:text-[var(--text-muted)]" />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{a.desc}</p>
                  <p className="mt-2 text-sm font-medium text-[var(--text)]">{a.stat}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
