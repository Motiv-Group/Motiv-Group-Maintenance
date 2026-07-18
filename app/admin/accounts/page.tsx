export const dynamic = 'force-dynamic'

import { UsersRound } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { SectionCard } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { AddAccountForm, type CompanyOpt, type RegionOpt, type ProjectOpt } from '@/components/admin/AddAccountForm'
import { BulkImportForm } from '@/components/admin/BulkImportForm'
import { formatDate } from '@/lib/utils'

const roleLabel = (r: string) => r === 'executive' ? 'Executive' : r === 'regional_manager' ? 'Regional Manager' : 'Store Manager'
const roleRank = (r: string) => r === 'executive' ? 0 : r === 'regional_manager' ? 1 : 2

// Last sign-in per user comes from Supabase auth (last_sign_in_at) — no custom
// tracking needed. Paginate defensively (perPage caps at 1000).
async function loadLastSignIns(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const list = data?.users ?? []
    if (error || !list.length) break
    for (const u of list) map.set(u.id, u.last_sign_in_at ?? null)
    if (list.length < 1000) break
  }
  return map
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

export default async function AdminAccountsPage() {
  await requireMasterAdmin()
  const db = createAdminClient()
  const [{ data: companies }, { data: regions }, { data: users }, { data: ru }, { data: su }, { data: stores }, { data: projects }] = await Promise.all([
    db.from('companies').select('id, name').eq('active', true).order('name'),
    db.from('regions').select('id, name, region_code, company_id').eq('active', true).order('name'),
    db.from('user_profiles').select('id, full_name, email, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']).eq('active', true),
    db.from('regional_users').select('user_id, region_id'),
    db.from('store_users').select('user_id, store_id'),
    db.from('stores').select('id, branch_code, region_id'),
    db.from('projects').select('id, name, company_id').is('archived_at', null).order('name'),
  ])
  type UserRow = NonNullable<typeof users>[number]
  const companyName = new Map((companies ?? []).map(c => [c.id, c.name]))
  const companyOpts: CompanyOpt[] = (companies ?? []).map(c => ({ id: c.id, name: c.name }))
  const regionOpts: RegionOpt[] = (regions ?? []).map(r => ({ id: r.id, name: r.name, companyId: r.company_id, code: r.region_code }))
  const projectOpts: ProjectOpt[] = (projects ?? []).map(p => ({ id: p.id, name: p.name, companyId: p.company_id }))

  // Per-user "Region / Branch": RMs → their region name(s); SMs → their store branch code.
  const regionLabelById = new Map((regions ?? []).map(r => [r.id, `${r.name} (${r.region_code})`]))
  const storeById = new Map((stores ?? []).map(s => [s.id, s]))
  const rmRegions = new Map<string, string[]>()
  for (const r of (ru ?? [])) { const a = rmRegions.get(r.user_id) ?? []; const l = regionLabelById.get(r.region_id); if (l) a.push(l); rmRegions.set(r.user_id, a) }
  const smBranch = new Map<string, string>()
  for (const s of (su ?? [])) { const store = storeById.get(s.store_id); if (store?.branch_code && !smBranch.has(s.user_id)) smBranch.set(s.user_id, store.branch_code) }
  const locationFor = (u: UserRow): string => {
    if (u.role === 'regional_manager') return (rmRegions.get(u.id) ?? []).join(', ') || '—'
    if (u.role === 'store_manager') return smBranch.get(u.id) ?? '—'
    return '—'
  }
  const rows = (users ?? []).sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.full_name ?? '').localeCompare(b.full_name ?? ''))

  // Engagement: last sign-in per user + a "signed in this week / never" summary.
  const signIns = await loadLastSignIns(db)
  const activeWeek = rows.filter(u => { const d = daysAgo(signIns.get(u.id) ?? null); return d != null && d <= 7 }).length
  const neverSignedIn = rows.filter(u => !signIns.get(u.id)).length
  const lastSignInCell = (u: UserRow) => {
    const iso = signIns.get(u.id) ?? null
    if (!iso) return <span className="text-amber-600 dark:text-amber-400">Never</span>
    const d = daysAgo(iso)
    const recent = d != null && d <= 7
    return (
      <span className="flex items-center gap-1.5">
        <i className={`h-1.5 w-1.5 rounded-full ${recent ? 'bg-emerald-500' : 'bg-slate-400/60'}`} />
        {formatDate(iso)}{d != null && <span className="text-[var(--text-faint)]">· {d === 0 ? 'today' : `${d}d ago`}</span>}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <UsersRound className="text-blue-600 dark:text-blue-400" size={22} /> Create accounts
          <InfoTip title="Create accounts" align="left">Pick a company first, then add people under it. Choose “＋ New company” to create a company on its own; pick an existing company to add an Executive (optional), Regional Manager or Store Manager. Each account gets an email set-password link. Suppliers and Individuals self-register.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Invite the store hierarchy. Individuals and suppliers self-register from the sign-up page.</p>
      </div>

      <AddAccountForm companies={companyOpts} regions={regionOpts} projects={projectOpts} />

      <BulkImportForm />

      <SectionCard
        title="Existing accounts"
        action={
          <span className="text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
            <span className="text-emerald-600 dark:text-emerald-400">{activeWeek}<span className="hidden sm:inline"> active this week</span></span>
            {neverSignedIn > 0 && <span className="text-amber-600 dark:text-amber-400">{neverSignedIn}<span className="hidden sm:inline"> never signed in</span></span>}
            <span>· {rows.length}<span className="hidden sm:inline"> total</span></span>
          </span>
        }
      >
        <div className="hidden sm:block overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]"><th className="py-2 px-2">Name</th><th className="px-2">Email</th><th className="px-2">Role</th><th className="px-2">Region / Branch</th><th className="px-2">Company</th><th className="px-2">Last sign-in</th></tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                  <td className="py-2.5 px-2 text-[var(--text)]">{u.full_name ?? '—'}</td>
                  <td className="px-2 text-[var(--text-muted)] truncate max-w-[220px]">{u.email ?? '—'}</td>
                  <td className="px-2 text-[var(--text-muted)]">{roleLabel(u.role)}</td>
                  <td className="px-2 text-[var(--text-muted)]">{locationFor(u)}</td>
                  <td className="px-2 text-[var(--text-muted)]">{u.company_id ? (companyName.get(u.company_id) ?? '—') : <span className="text-amber-600 dark:text-amber-400">Pending</span>}</td>
                  <td className="px-2 text-[var(--text-muted)] whitespace-nowrap">{lastSignInCell(u)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-[var(--text-faint)]">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden space-y-2">
          {rows.map(u => (
            <div key={u.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text)] truncate">{u.full_name ?? '—'}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{u.email ?? '—'}</p>
                </div>
                <span className="text-xs text-[var(--text-muted)] shrink-0">{roleLabel(u.role)}</span>
              </div>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-faint)]">Company</dt>
                  <dd className="text-[var(--text-muted)] text-right min-w-0 truncate">{u.company_id ? (companyName.get(u.company_id) ?? '—') : <span className="text-amber-600 dark:text-amber-400">Pending</span>}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-faint)]">Region / Branch</dt>
                  <dd className="text-[var(--text-muted)] text-right min-w-0 truncate">{locationFor(u)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-faint)] shrink-0">Last sign-in</dt>
                  <dd className="text-[var(--text-muted)]">{lastSignInCell(u)}</dd>
                </div>
              </dl>
            </div>
          ))}
          {!rows.length && <p className="py-6 text-center text-[var(--text-faint)]">No accounts yet.</p>}
        </div>
      </SectionCard>
    </div>
  )
}
