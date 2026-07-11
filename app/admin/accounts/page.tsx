export const dynamic = 'force-dynamic'

import { UsersRound } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { SectionCard } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { AddAccountForm, type CompanyOpt, type RegionOpt } from '@/components/admin/AddAccountForm'
import { BulkImportForm } from '@/components/admin/BulkImportForm'

const roleLabel = (r: string) => r === 'executive' ? 'Executive' : r === 'regional_manager' ? 'Regional Manager' : 'Store Manager'
const roleRank = (r: string) => r === 'executive' ? 0 : r === 'regional_manager' ? 1 : 2

export default async function AdminAccountsPage() {
  await requireMasterAdmin()
  const db = createAdminClient()
  const [{ data: companies }, { data: regions }, { data: users }] = await Promise.all([
    db.from('companies').select('id, name').eq('active', true).order('name'),
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, full_name, email, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']).eq('active', true),
  ])
  const companyName = new Map(((companies ?? []) as any[]).map(c => [c.id, c.name]))
  const companyOpts: CompanyOpt[] = ((companies ?? []) as any[]).map(c => ({ id: c.id, name: c.name }))
  const regionOpts: RegionOpt[] = ((regions ?? []) as any[]).map(r => ({ id: r.id, name: r.name, companyId: r.company_id, code: r.region_code }))
  const rows = ((users ?? []) as any[]).sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.full_name ?? '').localeCompare(b.full_name ?? ''))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <UsersRound className="text-blue-600 dark:text-blue-400" size={22} /> Accounts
          <InfoTip title="Accounts" align="left">Create Executive, Regional Manager and Store Manager accounts by invitation. Each gets an email set-password link. Executives own a company; RMs manage a region; SMs run a store. Suppliers and Individuals self-register.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Invite the store hierarchy. Individuals and suppliers self-register from the sign-up page.</p>
      </div>

      <AddAccountForm companies={companyOpts} regions={regionOpts} />

      <BulkImportForm />

      <SectionCard
        title="Existing accounts"
        action={<span className="text-xs text-[var(--text-muted)]">{rows.length} total</span>}
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Name</th><th className="px-2">Email</th><th className="px-2">Role</th><th className="px-2">Company</th></tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                  <td className="py-2.5 px-2 text-[var(--text)]">{u.full_name ?? '—'}</td>
                  <td className="px-2 text-[var(--text-muted)] truncate max-w-[220px]">{u.email ?? '—'}</td>
                  <td className="px-2 text-[var(--text-muted)]">{roleLabel(u.role)}</td>
                  <td className="px-2 text-[var(--text-muted)]">{u.company_id ? (companyName.get(u.company_id) ?? '—') : <span className="text-amber-600 dark:text-amber-400">Pending</span>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="py-6 text-center text-[var(--text-faint)]">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
